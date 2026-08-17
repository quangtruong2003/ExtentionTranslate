import assert from "node:assert/strict";
import {
  VOCABULARY_STORAGE_KEY,
  VOCABULARY_MAX_ENTRIES,
  listVocabulary,
  recordVocabularyLookup,
  toggleVocabularyFavorite,
  removeVocabularyEntry,
  clearVocabulary,
} from "../src/services/storage/vocabulary.ts";

function createMemoryStorage() {
  const data = {};
  return {
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => { Object.assign(data, items); },
    _data: data,
  };
}

const storage = createMemoryStorage();
assert.equal(VOCABULARY_STORAGE_KEY, "extention-translate:vocabulary");
assert.equal(VOCABULARY_MAX_ENTRIES, 200);

assert.deepEqual(await listVocabulary(storage), []);

await recordVocabularyLookup(storage, "run", "chạy");
await recordVocabularyLookup(storage, "beautiful", "đẹp");
let list = await listVocabulary(storage);
assert.equal(list.length, 2);
assert.equal(list[0].word, "beautiful", "newest first");
assert.equal(list[0].translation, "đẹp");
assert.equal(list[0].favorite, false);

// Re-recording an existing word refreshes timestamp/translation, no duplicate.
await recordVocabularyLookup(storage, "run", "vận hành");
list = await listVocabulary(storage);
assert.equal(list.length, 2);
assert.equal(list[0].word, "run");
assert.equal(list[0].translation, "vận hành");

// Favorite toggle survives re-record.
await toggleVocabularyFavorite(storage, "run");
list = await listVocabulary(storage);
assert.equal(list.find((item) => item.word === "run").favorite, true);
await recordVocabularyLookup(storage, "run");
list = await listVocabulary(storage);
assert.equal(list.find((item) => item.word === "run").favorite, true, "favorite preserved on re-record");

await removeVocabularyEntry(storage, "run");
assert.deepEqual((await listVocabulary(storage)).map((item) => item.word), ["beautiful"]);

// Cap at VOCABULARY_MAX_ENTRIES.
for (let index = 0; index < 205; index += 1) {
  await recordVocabularyLookup(storage, `word-${index}`);
}
list = await listVocabulary(storage);
assert.equal(list.length, VOCABULARY_MAX_ENTRIES);
assert.equal(list[0].word, "word-204");

await clearVocabulary(storage);
assert.deepEqual(await listVocabulary(storage), []);

console.log("test-vocabulary-storage: PASS");
