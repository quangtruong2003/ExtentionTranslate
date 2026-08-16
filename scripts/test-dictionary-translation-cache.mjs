import assert from "node:assert/strict";

import {
  DICTIONARY_TRANSLATION_CACHE_KEY,
  getCachedDictionaryTranslation,
  fingerprintDictionaryEntry,
  setCachedDictionaryTranslation,
} from "../src/services/storage/dictionaryTranslationCache.ts";

const sourceEntry = {
  word: "run",
  language: "en",
  phonetics: {
    uk: "/rʌn/",
    us: "/rʌn/",
    audioUk: "https://audio.example/current-uk.mp3",
    audioUs: "https://audio.example/current-us.mp3",
  },
  wordForms: ["runs", "running", "ran"],
  meanings: [
    {
      partOfSpeech: "verb",
      translation: "chạy",
      definition: "to move quickly on foot",
      examples: ["They run every morning."],
      synonyms: ["jog"],
    },
  ],
  source: "free-api",
};

const vietnameseEntry = {
  word: "run",
  language: "vi",
  phonetics: {
    uk: "/stale-uk/",
    us: "/stale-us/",
    audioUk: "https://audio.example/stale-uk.mp3",
    audioUs: "https://audio.example/stale-us.mp3",
  },
  wordForms: ["stale-form"],
  meanings: [
    {
      partOfSpeech: "động từ",
      translation: "di chuyển nhanh bằng chân",
      definition: "di chuyển nhanh bằng chân",
      examples: ["Họ chạy mỗi sáng."],
      synonyms: ["phi nước đại"],
    },
  ],
  source: "cache",
};

const changedSourceEntry = {
  ...sourceEntry,
  meanings: [
    {
      ...sourceEntry.meanings[0],
      definition: "to move quickly by foot",
    },
  ],
};

function createStorage(initialState = {}) {
  const state = structuredClone(initialState);
  return {
    state,
    async get(key) {
      return { [key]: structuredClone(state[key]) };
    },
    async set(items) {
      Object.assign(state, structuredClone(items));
    },
  };
}

const storage = createStorage();

assert.notEqual(fingerprintDictionaryEntry(sourceEntry), fingerprintDictionaryEntry(changedSourceEntry));

await setCachedDictionaryTranslation(storage, sourceEntry, vietnameseEntry, "vi", 1_000);

const hit = await getCachedDictionaryTranslation(storage, sourceEntry, "vi", 1_001);
assert.equal(hit?.meanings[0].definition, "di chuyển nhanh bằng chân");
assert.equal(hit?.phonetics?.audioUk, sourceEntry.phonetics.audioUk);
assert.equal(hit?.phonetics?.audioUs, sourceEntry.phonetics.audioUs);
assert.deepEqual(hit?.wordForms, sourceEntry.wordForms);
assert.equal(hit?.language, "vi");

assert.equal(await getCachedDictionaryTranslation(storage, changedSourceEntry, "vi", 1_001), null);
assert.equal(
  await getCachedDictionaryTranslation(storage, sourceEntry, "vi", 1_000 + 30 * 24 * 60 * 60 * 1000 + 1),
  null,
);

const capacityStorage = createStorage();
for (let index = 0; index < 201; index += 1) {
  await setCachedDictionaryTranslation(
    capacityStorage,
    { ...sourceEntry, word: `word-${index}` },
    { ...vietnameseEntry, word: `word-${index}` },
    "vi",
    10_000 + index,
  );
}

assert.equal(await getCachedDictionaryTranslation(capacityStorage, { ...sourceEntry, word: "word-0" }, "vi", 20_000), null);
const retainedWord1 = await getCachedDictionaryTranslation(capacityStorage, { ...sourceEntry, word: "word-1" }, "vi", 20_000);
const retainedWord200 = await getCachedDictionaryTranslation(capacityStorage, { ...sourceEntry, word: "word-200" }, "vi", 20_000);
assert.equal(retainedWord1?.word, "word-1");
assert.equal(retainedWord200?.word, "word-200");

const corruptStorage = createStorage({
  [DICTIONARY_TRANSLATION_CACHE_KEY]: {
    records: {
      "vi::run": {
        fingerprint: 123,
        savedAt: "oops",
        expiresAt: null,
        entry: null,
      },
    },
  },
});

assert.equal(await getCachedDictionaryTranslation(corruptStorage, sourceEntry, "vi", 1_001), null);

console.log("PASS: dictionary translation cache validates fingerprint, expiry, capacity, and source metadata refresh.");
