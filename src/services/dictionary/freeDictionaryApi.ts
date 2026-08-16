type TargetLanguage = "en" | "vi" | "zh-CN";

import type { DictionaryEntry } from "@/shared/types";

interface FreeDictionaryTranslation {
  language?: { code?: unknown };
  word?: unknown;
}

interface FreeDictionaryPronunciation {
  type?: unknown;
  text?: unknown;
  tags?: unknown;
}

interface FreeDictionarySense {
  definition?: unknown;
  examples?: unknown;
  synonyms?: unknown;
  translations?: unknown;
  subsenses?: unknown;
}

interface FreeDictionaryEntry {
  word?: unknown;
  language?: { code?: unknown };
  partOfSpeech?: unknown;
  pronunciations?: unknown;
  forms?: unknown;
  senses?: unknown;
  synonyms?: unknown;
}

interface FreeDictionaryPayload {
  word?: unknown;
  entries?: unknown;
}

export const FREE_DICTIONARY_API_ENDPOINT = "https://freedictionaryapi.com/api/v1/entries/en/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueStrings(values: Iterable<unknown>, limit?: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = asNonEmptyString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (limit !== undefined && result.length >= limit) break;
  }
  return result;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function toFreeDictionaryLanguage(targetLanguage: TargetLanguage | string): "vi" | "cmn" {
  return targetLanguage === "zh-CN" || targetLanguage === "zh" ? "cmn" : "vi";
}

export async function fetchFreeDictionaryApi(word: string, signal?: AbortSignal): Promise<unknown> {
  const url = `${FREE_DICTIONARY_API_ENDPOINT}${encodeURIComponent(word.trim().toLowerCase())}?translations=true`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`FreeDictionaryAPI request failed with HTTP ${response.status}`);
  }
  return response.json();
}

function walkSenses(value: unknown, visit: (sense: FreeDictionarySense) => void): void {
  for (const item of asArray(value)) {
    if (!isRecord(item)) continue;
    visit(item as FreeDictionarySense);
    walkSenses(item.subsenses, visit);
  }
}

function getEntries(raw: unknown): FreeDictionaryEntry[] {
  if (!isRecord(raw)) return [];
  return asArray(raw.entries).filter(isRecord) as FreeDictionaryEntry[];
}

function getTranslationsFromSense(sense: FreeDictionarySense, languageCodes: string[]): string[] {
  const values: unknown[] = [];
  for (const item of asArray<FreeDictionaryTranslation>(sense.translations)) {
    if (!isRecord(item)) continue;
    const language = isRecord(item.language) ? asNonEmptyString(item.language.code) : undefined;
    const word = asNonEmptyString(item.word);
    if (language && languageCodes.includes(language) && word) values.push(word);
  }
  return uniqueStrings(values);
}

export function parseFreeDictionaryApiTranslations(raw: unknown, targetLanguage: TargetLanguage | string): string[] {
  const languageCodes = targetLanguage === "zh-CN" || targetLanguage === "zh" ? ["cmn", "zh"] : [toFreeDictionaryLanguage(targetLanguage)];
  const values: string[] = [];
  for (const entry of getEntries(raw)) {
    walkSenses(entry.senses, (sense) => {
      values.push(...getTranslationsFromSense(sense, languageCodes));
    });
  }
  return uniqueStrings(values);
}

function getSenseExamples(sense: FreeDictionarySense): string[] {
  const examples: unknown[] = [];
  for (const value of asArray(sense.examples)) {
    if (isRecord(value)) examples.push(value.example);
    else examples.push(value);
  }
  return uniqueStrings(examples, 3);
}

function getSenseDefinitions(entry: FreeDictionaryEntry): FreeDictionarySense[] {
  const senses: FreeDictionarySense[] = [];
  walkSenses(entry.senses, (sense) => senses.push(sense));
  return senses;
}

function getPronunciation(entry: FreeDictionaryEntry, preferUK: boolean): string | undefined {
  const pronunciations = asArray<FreeDictionaryPronunciation>(entry.pronunciations)
    .filter(isRecord) as FreeDictionaryPronunciation[];
  const tagged = pronunciations.find((pronunciation) => {
    const tags = Array.isArray(pronunciation.tags)
      ? pronunciation.tags.map(asNonEmptyString).filter(Boolean).join(" ")
      : asNonEmptyString(pronunciation.tags) ?? "";
    return preferUK ? /uk|british/i.test(tags) : /us|american|general american/i.test(tags);
  });
  const ipa = pronunciations.find((pronunciation) => /ipa/i.test(asNonEmptyString(pronunciation.type) ?? ""));
  return asNonEmptyString((tagged ?? ipa ?? pronunciations[0])?.text);
}

function getForms(raw: unknown): string[] {
  const values: unknown[] = [];
  for (const form of asArray(raw)) {
    if (isRecord(form)) values.push(form.word);
    else values.push(form);
  }
  return uniqueStrings(values, 16);
}

export function parseFreeDictionaryApiSource(raw: unknown, fallbackWord: string): DictionaryEntry | null {
  const payload = isRecord(raw) ? raw as FreeDictionaryPayload : undefined;
  const entries = getEntries(raw);
  if (!payload || entries.length === 0) return null;

  const word = asNonEmptyString(entries[0].word) ?? asNonEmptyString(payload.word) ?? asNonEmptyString(fallbackWord);
  if (!word) return null;

  const meanings = entries.flatMap((entry) => {
    const senses = getSenseDefinitions(entry);
    const firstDefinition = asNonEmptyString(senses[0]?.definition);
    if (!firstDefinition) return [];
    const examples: string[] = [];
    const synonyms: unknown[] = [
      ...asArray(entry.synonyms),
      ...senses.flatMap((sense) => asArray(sense.synonyms)),
    ];
    for (const sense of senses) {
      examples.push(...getSenseExamples(sense));
      if (examples.length >= 3) break;
    }
    const uniqueExamples = uniqueStrings(examples, 3);
    const uniqueSynonyms = uniqueStrings(synonyms, 8);
    return [{
      partOfSpeech: asNonEmptyString(entry.partOfSpeech),
      definition: firstDefinition,
      examples: uniqueExamples.length ? uniqueExamples : undefined,
      synonyms: uniqueSynonyms.length ? uniqueSynonyms : undefined,
    }];
  });

  if (meanings.length === 0) return null;

  const wordForms = uniqueStrings(entries.flatMap((entry) => getForms(entry.forms)), 16);
  const uk = entries.map((entry) => getPronunciation(entry, true)).find(Boolean);
  const us = entries.map((entry) => getPronunciation(entry, false)).find(Boolean);

  return {
    word,
    language: "en",
    phonetics: uk || us ? { uk, us } : undefined,
    wordForms: wordForms.length ? wordForms : undefined,
    meanings,
    source: "free-dictionary-api",
  };
}

export function parseFreeDictionaryApiPartialTranslations(
  raw: unknown,
  sourceEntry: DictionaryEntry,
  targetLanguage: TargetLanguage | string,
): DictionaryEntry | null {
  const languageCodes = targetLanguage === "zh-CN" || targetLanguage === "zh" ? ["cmn", "zh"] : [toFreeDictionaryLanguage(targetLanguage)];
  const byPartOfSpeech = new Map<string, string[]>();
  for (const entry of getEntries(raw)) {
    const partOfSpeech = asNonEmptyString(entry.partOfSpeech) ?? "";
    const values = byPartOfSpeech.get(partOfSpeech) ?? [];
    walkSenses(entry.senses, (sense) => values.push(...getTranslationsFromSense(sense, languageCodes)));
    byPartOfSpeech.set(partOfSpeech, uniqueStrings(values));
  }

  const meanings = sourceEntry.meanings.map((meaning) => {
    const partOfSpeech = asNonEmptyString(meaning.partOfSpeech) ?? "";
    const translation = byPartOfSpeech.get(partOfSpeech)?.join(", ") ?? "";
    return translation ? { ...meaning, translation } : { ...meaning };
  });
  const hasTranslation = meanings.some((meaning) => Boolean(asNonEmptyString(meaning.translation)));
  if (!hasTranslation) return null;

  return {
    ...sourceEntry,
    language: targetLanguage,
    meanings,
  };
}
