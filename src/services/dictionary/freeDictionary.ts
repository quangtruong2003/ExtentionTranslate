import { ExtensionError, ERROR_CODES } from "@/shared/errors";
import { FREE_DICTIONARY_ENDPOINT } from "@/shared/constants";
import type { DictionaryEntry, DictionaryMeaning } from "@/shared/types";
import { safeJSONParse, normalizeWhitespace } from "@/shared/utils";

interface RawPhonetic {
  text?: string;
  audio?: string;
}

interface RawMeaning {
  partOfSpeech?: string;
  definitions?: Array<{
    definition?: string;
    example?: string;
  }>;
  synonyms?: string[];
  antonyms?: string[];
}

interface RawEntry {
  word?: string;
  phonetic?: string;
  phonetics?: RawPhonetic[];
  origin?: string;
  meanings?: RawMeaning[];
}

function pickUK(phonetics: RawPhonetic[] | undefined): RawPhonetic | undefined {
  if (!phonetics) return undefined;
  return (
    phonetics.find((p) => /uk|british/i.test(p.audio ?? "")) ||
    phonetics.find((p) => /uk|british/i.test(p.text ?? "")) ||
    phonetics[0]
  );
}

function pickUS(phonetics: RawPhonetic[] | undefined): RawPhonetic | undefined {
  if (!phonetics) return undefined;
  return (
    phonetics.find((p) => /us|american/i.test(p.audio ?? "")) ||
    phonetics.find((p) => /us|american/i.test(p.text ?? "")) ||
    phonetics[1] ||
    phonetics[0]
  );
}

function cleanExample(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const trimmed = normalizeWhitespace(s);
  if (trimmed.length < 3) return undefined;
  return trimmed;
}

export function parseFreeDictionaryResponse(raw: unknown, fallbackWord: string): DictionaryEntry | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0] as RawEntry;
  const word = (first.word ?? fallbackWord).trim();
  if (!word) return null;

  const allPhonetics = Array.isArray(first.phonetics) ? first.phonetics : [];
  const uk = pickUK(allPhonetics);
  const us = pickUS(allPhonetics);
  const fallbackPhonetic = first.phonetic;

  const meanings: DictionaryMeaning[] = [];
  for (const m of first.meanings ?? []) {
    const definitions = m.definitions ?? [];
    const mainDef = definitions.find((d) => d.definition)?.definition;
    if (!mainDef) continue;
    const examples: string[] = [];
    for (const d of definitions) {
      const ex = cleanExample(d.example);
      if (ex && !examples.includes(ex)) examples.push(ex);
      if (examples.length >= 3) break;
    }
    const synonyms = (m.synonyms ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 8);
    meanings.push({
      partOfSpeech: m.partOfSpeech,
      definition: normalizeWhitespace(mainDef),
      examples,
      synonyms: synonyms.length ? synonyms : undefined,
    });
  }

  if (meanings.length === 0) return null;

  return {
    word,
    language: "en",
    phonetics: {
      uk: uk?.text || fallbackPhonetic,
      us: us?.text || fallbackPhonetic,
      audioUk: uk?.audio,
      audioUs: us?.audio,
    },
    meanings,
    source: "free-api",
  };
}

export async function fetchFreeDictionary(word: string, signal?: AbortSignal): Promise<DictionaryEntry> {
  const url = `${FREE_DICTIONARY_ENDPOINT}${encodeURIComponent(word.toLowerCase())}`;
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }

  if (response.status === 404) {
    throw new ExtensionError(ERROR_CODES.NO_RESULT, "", false);
  }
  if (!response.ok) {
    throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, `HTTP ${response.status}`, true);
  }

  const text = await response.text();
  const json = safeJSONParse<unknown>(text);
  if (!json) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);

  const entry = parseFreeDictionaryResponse(json, word);
  if (!entry) throw new ExtensionError(ERROR_CODES.NO_RESULT, "", false);
  return entry;
}