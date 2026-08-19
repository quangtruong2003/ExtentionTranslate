import type { VocabularyRecord } from "@/shared/types";

export interface Flashcard {
  word: string;
  translation?: string;
}

export interface FlashcardDeckOptions {
  limit: number;
  seed: number;
}

/** Deterministic mulberry32 PRNG so decks are reproducible per seed. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRandom<T>(items: T[], rng: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled;
}

/**
 * Build a flashcard deck from saved vocabulary. Records with a translation are
 * preferred so the flip side has content; the rest is filled from the tail.
 */
export function buildFlashcardDeck(
  records: VocabularyRecord[],
  options: FlashcardDeckOptions,
): Flashcard[] {
  const usable = records.filter((record) => record.word.trim());
  if (usable.length === 0 || options.limit <= 0) return [];
  const withTranslation = usable.filter((record) => record.translation?.trim());
  const withoutTranslation = usable.filter((record) => !record.translation?.trim());
  const rng = createSeededRandom(options.seed);
  const ordered = [
    ...shuffleWithRandom(withTranslation, rng),
    ...shuffleWithRandom(withoutTranslation, rng),
  ];
  return ordered.slice(0, options.limit).map((record) => ({
    word: record.word,
    translation: record.translation,
  }));
}
