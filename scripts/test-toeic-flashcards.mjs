import assert from "node:assert/strict";
import { buildFlashcardDeck, createSeededRandom, shuffleWithRandom } from "../src/services/toeic/flashcards.ts";

// Seeded RNG is deterministic.
const a = createSeededRandom(42);
const b = createSeededRandom(42);
for (let i = 0; i < 10; i += 1) {
  assert.equal(a(), b(), "same seed produces same sequence");
}
const c = createSeededRandom(43);
const firstA = createSeededRandom(42)();
assert.notEqual(firstA, c(), "different seeds diverge");

// shuffleWithRandom preserves elements.
const items = [1, 2, 3, 4, 5];
const shuffled = shuffleWithRandom(items, createSeededRandom(7));
assert.deepEqual([...shuffled].sort((x, y) => x - y), items);
assert.deepEqual(items, [1, 2, 3, 4, 5], "original array untouched");

// Deck building prefers words with translations and respects the limit.
const records = [
  { word: "agenda", translation: "chương trình", lookedUpAt: 1, favorite: false },
  { word: "invoice", translation: "hóa đơn", lookedUpAt: 2, favorite: false },
  { word: "bare", translation: undefined, lookedUpAt: 3, favorite: false },
  { word: "quota", translation: "chỉ tiêu", lookedUpAt: 4, favorite: false },
];
const deck = buildFlashcardDeck(records, { limit: 2, seed: 1 });
assert.equal(deck.length, 2);
assert.ok(deck.every((card) => card.translation), "translated words preferred");

// Same seed => same deck order.
const deck2 = buildFlashcardDeck(records, { limit: 4, seed: 1 });
const deck3 = buildFlashcardDeck(records, { limit: 4, seed: 1 });
assert.deepEqual(deck2, deck3);
assert.equal(deck2.length, 4);

// Empty input and zero limit.
assert.deepEqual(buildFlashcardDeck([], { limit: 5, seed: 1 }), []);
assert.deepEqual(buildFlashcardDeck(records, { limit: 0, seed: 1 }), []);

// Whitespace-only words are dropped.
const dirty = [{ word: "   ", translation: "x", lookedUpAt: 1, favorite: false }];
assert.deepEqual(buildFlashcardDeck(dirty, { limit: 5, seed: 1 }), []);

console.log("PASS: toeic flashcard deck building");
