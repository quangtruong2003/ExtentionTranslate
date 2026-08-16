import assert from "node:assert/strict";
import { translateDictionaryEntryInBrowser } from "../src/services/dictionary/translationWorkflow.ts";

const sourceEntry = {
  word: "run",
  language: "en",
  phonetics: { us: "/rʌn/", audioUs: "https://api.dictionaryapi.dev/audio/run.mp3" },
  meanings: [{ partOfSpeech: "verb", definition: "to move quickly" }],
  source: "free-api",
};

const browserEntry = { ...sourceEntry, language: "vi", meanings: [{ ...sourceEntry.meanings[0], definition: "chạy nhanh" }] };
const remoteEntry = { ...sourceEntry, language: "vi", meanings: [{ ...sourceEntry.meanings[0], definition: "di chuyển nhanh" }] };

let cacheWrites = 0;
const cached = await translateDictionaryEntryInBrowser({
  sourceEntry,
  targetLanguage: "vi",
  browserTranslator: { translate: async () => browserEntry },
  getCached: async () => browserEntry,
  setCached: async () => { cacheWrites += 1; },
  translateRemote: async () => { throw new Error("cache should stop the workflow"); },
});
assert.equal(cached.status, "translated");
assert.equal(cached.provider, "cache");
assert.notEqual(cached.entry, browserEntry);
assert.equal(cached.entry.meanings[0].definition, "Chạy nhanh.");
assert.equal(cacheWrites, 0);

const browser = await translateDictionaryEntryInBrowser({
  sourceEntry,
  targetLanguage: "vi",
  browserTranslator: { translate: async () => browserEntry },
  getCached: async () => null,
  setCached: async (_source, entry) => {
    assert.notEqual(entry, browserEntry);
    assert.equal(entry.meanings[0].definition, "Chạy nhanh.");
    cacheWrites += 1;
  },
  translateRemote: async () => { throw new Error("browser translator should stop the workflow"); },
});
assert.equal(browser.status, "translated");
assert.equal(browser.provider, "browser");
assert.equal(browser.entry.meanings[0].definition, "Chạy nhanh.");
assert.equal(cacheWrites, 1);

const remote = await translateDictionaryEntryInBrowser({
  sourceEntry,
  targetLanguage: "vi",
  browserTranslator: { translate: async () => null },
  getCached: async () => null,
  setCached: async () => undefined,
  translateRemote: async () => ({ entry: remoteEntry, status: "partial", provider: "free-dictionary-api" }),
});
assert.equal(remote.status, "partial");
assert.equal(remote.provider, "free-dictionary-api");
assert.notEqual(remote.entry, remoteEntry);
assert.equal(remote.entry.meanings[0].definition, "Di chuyển nhanh.");

const fallback = await translateDictionaryEntryInBrowser({
  sourceEntry,
  targetLanguage: "vi",
  browserTranslator: { translate: async () => { throw new Error("Translator unavailable"); } },
  getCached: async () => null,
  setCached: async () => undefined,
  translateRemote: async () => ({ entry: sourceEntry, status: "fallback", provider: "fallback" }),
});
assert.equal(fallback.status, "fallback");
assert.equal(fallback.provider, "fallback");
assert.equal(fallback.entry, sourceEntry);

const english = await translateDictionaryEntryInBrowser({
  sourceEntry,
  targetLanguage: "en",
  browserTranslator: { translate: async () => { throw new Error("English should not translate"); } },
  getCached: async () => { throw new Error("English should not read cache"); },
  setCached: async () => { throw new Error("English should not write cache"); },
  translateRemote: async () => { throw new Error("English should not call remote"); },
});
assert.equal(english.status, "source");
assert.equal(english.provider, "source");
assert.equal(english.entry, sourceEntry);

console.log("PASS: dictionary translation workflow prioritizes cache, browser Translator, FreeDictionaryAPI, then fallback.");
