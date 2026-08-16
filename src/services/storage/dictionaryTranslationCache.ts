import type { DictionaryEntry, DictionaryPhrase, TargetLanguage } from "@/shared/types";

export const DICTIONARY_TRANSLATION_CACHE_KEY = "extention-translate:dictionary-translations:v1";
export const DICTIONARY_TRANSLATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DICTIONARY_TRANSLATION_CACHE_MAX_ENTRIES = 200;

type NonEnglishTargetLanguage = Exclude<TargetLanguage, "en">;

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface CacheEnvelope {
  records: Record<string, CacheRecord>;
}

interface CacheRecord {
  fingerprint: number;
  savedAt: number;
  expiresAt: number;
  entry: unknown;
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

function normalizeWord(word: string): string {
  return word.toLowerCase().trim();
}

function cacheEntryKey(sourceEntry: DictionaryEntry, targetLanguage: NonEnglishTargetLanguage): string {
  return `${targetLanguage}::${normalizeWord(sourceEntry.word)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasPhrase(value: DictionaryPhrase | null): value is DictionaryPhrase {
  return value !== null;
}

function loadEnvelope(storage: Record<string, unknown>): CacheEnvelope | null {
  const raw = storage[DICTIONARY_TRANSLATION_CACHE_KEY];
  if (!isRecord(raw) || !isRecord(raw.records)) return null;
  return { records: raw.records as Record<string, CacheRecord> };
}

function saveEnvelope(storage: StorageArea, envelope: CacheEnvelope): Promise<void> {
  return storage.set({ [DICTIONARY_TRANSLATION_CACHE_KEY]: envelope });
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function fingerprintDictionaryEntry(entry: DictionaryEntry): number {
  return fnv1a(JSON.stringify(entry) ?? "");
}

function normalizeRecord(value: unknown): CacheRecord | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumber(value.fingerprint)) return null;
  if (!isFiniteNumber(value.savedAt)) return null;
  if (!isFiniteNumber(value.expiresAt)) return null;
  return {
    fingerprint: value.fingerprint,
    savedAt: value.savedAt,
    expiresAt: value.expiresAt,
    entry: value.entry,
  };
}

function normalizeCachedEntry(raw: unknown, sourceEntry: DictionaryEntry, targetLanguage: NonEnglishTargetLanguage): DictionaryEntry | null {
  if (!isRecord(raw) || !Array.isArray(raw.meanings)) return null;
  if (raw.meanings.length !== sourceEntry.meanings.length) return null;

  const meanings = raw.meanings.map((meaning, index) => {
    if (!isRecord(meaning)) return null;
    const definition = optionalString(meaning.definition);
    if (!definition) return null;

    const sourceMeaning = sourceEntry.meanings[index];
    return {
      partOfSpeech: optionalString(meaning.partOfSpeech) ?? sourceMeaning?.partOfSpeech,
      cefr: optionalString(meaning.cefr) ?? sourceMeaning?.cefr,
      translation: optionalString(meaning.translation) ?? sourceMeaning?.translation,
      definition,
      examples: stringArray(meaning.examples) ?? sourceMeaning?.examples,
      phrases: Array.isArray(meaning.phrases)
        ? meaning.phrases
            .filter(isRecord)
            .map((phrase): DictionaryPhrase | null => {
              const phraseText = optionalString(phrase.phrase);
              if (!phraseText) return null;
              return {
                phrase: phraseText,
                translation: optionalString(phrase.translation),
                meaning: optionalString(phrase.meaning),
              };
            })
            .filter(hasPhrase)
        : sourceMeaning?.phrases,
      synonyms: stringArray(meaning.synonyms) ?? sourceMeaning?.synonyms,
    };
  });

  if (meanings.some((meaning) => meaning === null)) return null;

  return {
    word: sourceEntry.word,
    language: targetLanguage,
    phonetics: sourceEntry.phonetics,
    wordForms: sourceEntry.wordForms,
    meanings: meanings as DictionaryEntry["meanings"],
    source: sourceEntry.source,
  };
}

export async function getCachedDictionaryTranslation(
  storage: StorageArea,
  sourceEntry: DictionaryEntry,
  targetLanguage: NonEnglishTargetLanguage,
  now = Date.now(),
): Promise<DictionaryEntry | null> {
  const storageRecord = await storage.get(DICTIONARY_TRANSLATION_CACHE_KEY);
  const envelope = loadEnvelope(storageRecord);
  if (!envelope) return null;

  const cached = normalizeRecord(envelope.records[cacheEntryKey(sourceEntry, targetLanguage)]);
  if (!cached) return null;
  if (cached.expiresAt <= now) return null;
  if (cached.fingerprint !== fingerprintDictionaryEntry(sourceEntry)) return null;

  return normalizeCachedEntry(cached.entry, sourceEntry, targetLanguage);
}

export async function setCachedDictionaryTranslation(
  storage: StorageArea,
  sourceEntry: DictionaryEntry,
  translatedEntry: DictionaryEntry,
  targetLanguage: NonEnglishTargetLanguage,
  now = Date.now(),
): Promise<void> {
  const storageRecord = await storage.get(DICTIONARY_TRANSLATION_CACHE_KEY);
  const envelope = loadEnvelope(storageRecord) ?? { records: {} };
  const records: Array<[string, CacheRecord]> = [];

  for (const [key, value] of Object.entries(envelope.records)) {
    const record = normalizeRecord(value);
    if (!record || record.expiresAt <= now) continue;
    records.push([key, record]);
  }

  const key = cacheEntryKey(sourceEntry, targetLanguage);
  records.push([
    key,
    {
      fingerprint: fingerprintDictionaryEntry(sourceEntry),
      savedAt: now,
      expiresAt: now + DICTIONARY_TRANSLATION_CACHE_TTL_MS,
      entry: normalizeCachedEntry(translatedEntry, sourceEntry, targetLanguage),
    },
  ]);

  records.sort((left, right) => left[1].savedAt - right[1].savedAt);
  const retained = records.slice(-DICTIONARY_TRANSLATION_CACHE_MAX_ENTRIES);

  await saveEnvelope(storage, {
    records: Object.fromEntries(retained),
  });
}
