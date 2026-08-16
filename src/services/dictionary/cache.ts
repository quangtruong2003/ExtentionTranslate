import { CACHE_MAX_ENTRIES, CACHE_TTL_MS } from "@/shared/constants";
import type { DictionaryEntry } from "@/shared/types";

interface CacheEntry {
  value: DictionaryEntry;
  expires: number;
}

const store = new Map<string, CacheEntry>();

export function cacheKey(word: string, language?: string): string {
  return `${language || "en"}::${word.toLowerCase().trim()}`;
}

export function getCached(word: string, language?: string): DictionaryEntry | null {
  const key = cacheKey(word, language);
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached(entry: DictionaryEntry): void {
  const key = cacheKey(entry.word, entry.language);
  store.set(key, { value: entry, expires: Date.now() + CACHE_TTL_MS });
  if (store.size > CACHE_MAX_ENTRIES) {
    // Evict the oldest by insertion order.
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
}

export function clearCache(): void {
  store.clear();
}