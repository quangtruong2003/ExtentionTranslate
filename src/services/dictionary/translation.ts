import type { DictionaryEntry, DictionaryMeaning, DictionaryPhrase, TargetLanguage, TranslationStatus } from "@/shared/types";
import { normalizeDictionaryPresentation } from "./presentation.ts";

export interface DictionaryTranslationResult {
  entry: DictionaryEntry;
  status: TranslationStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return values.length > 0 ? values : undefined;
}

function normalizePhrase(value: unknown): DictionaryPhrase | null {
  if (!isRecord(value)) return null;
  const phrase = optionalString(value.phrase);
  if (!phrase) return null;
  return {
    phrase,
    translation: optionalString(value.translation),
    meaning: optionalString(value.meaning),
  };
}

function normalizeMeaning(value: unknown, sourceMeaning: DictionaryMeaning | undefined): DictionaryMeaning | null {
  if (!isRecord(value)) return null;
  const definition = optionalString(value.definition);
  if (!definition) return null;
  const phrases = Array.isArray(value.phrases)
    ? value.phrases.map(normalizePhrase).filter((phrase): phrase is DictionaryPhrase => phrase !== null)
    : undefined;
  const meaning: DictionaryMeaning = { definition };
  const partOfSpeech = optionalString(value.partOfSpeech) ?? sourceMeaning?.partOfSpeech;
  const cefr = optionalString(value.cefr) ?? sourceMeaning?.cefr;
  const translation = optionalString(value.translation) ?? sourceMeaning?.translation;
  const examples = stringArray(value.examples) ?? sourceMeaning?.examples;
  const resolvedPhrases = phrases?.length ? phrases : sourceMeaning?.phrases;
  const synonyms = stringArray(value.synonyms) ?? sourceMeaning?.synonyms;

  if (partOfSpeech !== undefined) meaning.partOfSpeech = partOfSpeech;
  if (cefr !== undefined) meaning.cefr = cefr;
  if (translation !== undefined) meaning.translation = translation;
  if (examples !== undefined) meaning.examples = examples;
  if (resolvedPhrases !== undefined) meaning.phrases = resolvedPhrases;
  if (synonyms !== undefined) meaning.synonyms = synonyms;
  return meaning;
}

export function normalizeTranslatedEntry(
  raw: unknown,
  sourceEntry: DictionaryEntry,
  targetLanguage: TargetLanguage,
): DictionaryEntry | null {
  if (!isRecord(raw) || !Array.isArray(raw.meanings)) return null;
  const meanings = raw.meanings
    .map((meaning, index) => normalizeMeaning(meaning, sourceEntry.meanings[index]))
    .filter((meaning): meaning is DictionaryMeaning => meaning !== null);
  if (meanings.length !== sourceEntry.meanings.length) return null;

  return normalizeDictionaryPresentation({
    word: sourceEntry.word,
    language: targetLanguage,
    phonetics: sourceEntry.phonetics,
    wordForms: sourceEntry.wordForms,
    meanings,
    source: sourceEntry.source,
  }, targetLanguage);
}

export async function translateDictionaryEntry(
  sourceEntry: DictionaryEntry,
  targetLanguage: TargetLanguage,
  translate: (entry: DictionaryEntry, targetLanguage: Exclude<TargetLanguage, "en">) => Promise<unknown>,
): Promise<DictionaryTranslationResult> {
  if (targetLanguage === "en") {
    return { entry: sourceEntry, status: "source" };
  }

  try {
    const raw = await translate(sourceEntry, targetLanguage);
    const entry = normalizeTranslatedEntry(raw, sourceEntry, targetLanguage);
    if (entry) return { entry, status: "translated" };
  } catch {
    // Translation is optional; the source dictionary entry remains usable.
  }

  return { entry: sourceEntry, status: "fallback" };
}
