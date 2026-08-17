import type { VocabularyRecord } from "@/shared/types";

export const VOCABULARY_STORAGE_KEY = "extention-translate:vocabulary";
export const VOCABULARY_MAX_ENTRIES = 200;

export interface VocabularyStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function normalizeRecord(value: unknown): VocabularyRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.word !== "string" || !record.word.trim()) return null;
  return {
    word: record.word,
    translation: typeof record.translation === "string" && record.translation ? record.translation : undefined,
    lookedUpAt: typeof record.lookedUpAt === "number" ? record.lookedUpAt : Date.now(),
    favorite: record.favorite === true,
  };
}

export async function listVocabulary(storage: VocabularyStorageLike): Promise<VocabularyRecord[]> {
  const raw = await storage.get(VOCABULARY_STORAGE_KEY);
  const stored = raw[VOCABULARY_STORAGE_KEY];
  if (!Array.isArray(stored)) return [];
  return stored.map(normalizeRecord).filter((record): record is VocabularyRecord => record !== null);
}

async function save(storage: VocabularyStorageLike, records: VocabularyRecord[]): Promise<void> {
  await storage.set({ [VOCABULARY_STORAGE_KEY]: records });
}

export async function recordVocabularyLookup(
  storage: VocabularyStorageLike,
  word: string,
  translation?: string,
): Promise<VocabularyRecord[]> {
  const trimmed = word.trim();
  if (!trimmed) return listVocabulary(storage);
  const existing = await listVocabulary(storage);
  const previous = existing.find((record) => record.word.toLowerCase() === trimmed.toLowerCase());
  const next: VocabularyRecord = {
    word: trimmed,
    translation: translation ?? previous?.translation,
    lookedUpAt: Date.now(),
    favorite: previous?.favorite ?? false,
  };
  const records = [next, ...existing.filter((record) => record.word.toLowerCase() !== trimmed.toLowerCase())]
    .slice(0, VOCABULARY_MAX_ENTRIES);
  await save(storage, records);
  return records;
}

export async function toggleVocabularyFavorite(storage: VocabularyStorageLike, word: string): Promise<VocabularyRecord[]> {
  const records = await listVocabulary(storage);
  const next = records.map((record) =>
    record.word.toLowerCase() === word.trim().toLowerCase()
      ? { ...record, favorite: !record.favorite }
      : record,
  );
  await save(storage, next);
  return next;
}

export async function removeVocabularyEntry(storage: VocabularyStorageLike, word: string): Promise<VocabularyRecord[]> {
  const records = await listVocabulary(storage);
  const next = records.filter((record) => record.word.toLowerCase() !== word.trim().toLowerCase());
  await save(storage, next);
  return next;
}

export async function clearVocabulary(storage: VocabularyStorageLike): Promise<void> {
  await storage.set({ [VOCABULARY_STORAGE_KEY]: [] });
}
