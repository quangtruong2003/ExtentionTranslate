import assert from "node:assert/strict";
import { resolveDictionaryRemoteFallback } from "../src/services/dictionary/remoteFallback.ts";

const sourceEntry = {
  word: "run",
  language: "en",
  phonetics: { us: "/rʌn/", audioUs: "https://api.dictionaryapi.dev/media/pronunciations/en/run-us.mp3" },
  meanings: [{ partOfSpeech: "verb", definition: "to move quickly", examples: ["They run."] }],
  source: "free-api",
};

const freeApiRaw = {
  word: "run",
  entries: [{
    partOfSpeech: "verb",
    senses: [{ translations: [{ language: { code: "vi" }, word: "chạy" }] }],
  }],
};

let openRouterCalls = 0;
const partial = await resolveDictionaryRemoteFallback({
  word: "run",
  sourceEntry,
  targetLanguage: "vi",
  fetchFreeDictionaryApi: async () => freeApiRaw,
  translateWithOpenRouter: async () => {
    openRouterCalls += 1;
    throw new Error("must not call OpenRouter when FreeDictionaryAPI has a translation");
  },
  generateWithOpenRouter: async () => {
    throw new Error("must not call OpenRouter when FreeDictionaryAPI has a translation");
  },
});
assert.equal(partial.provider, "free-dictionary-api");
assert.equal(partial.status, "partial");
assert.equal(partial.entry?.meanings[0].definition, "to move quickly");
assert.equal(partial.entry?.meanings[0].translation, "chạy");
assert.equal(partial.entry?.phonetics?.audioUs, sourceEntry.phonetics.audioUs);
assert.equal(openRouterCalls, 0);

let translatedInput = null;
const translated = await resolveDictionaryRemoteFallback({
  word: "run",
  sourceEntry,
  targetLanguage: "zh-CN",
  fetchFreeDictionaryApi: async () => { throw new Error("FreeDictionaryAPI unavailable"); },
  translateWithOpenRouter: async (entry, language) => {
    translatedInput = { entry, language };
    return { ...entry, language, meanings: [{ ...entry.meanings[0], definition: "快速移动" }] };
  },
  generateWithOpenRouter: async () => { throw new Error("source exists"); },
});
assert.equal(translated.provider, "openrouter");
assert.equal(translated.status, "translated");
assert.equal(translated.entry?.language, "zh-CN");
assert.equal(translated.entry?.meanings[0].definition, "快速移动");
assert.equal(translatedInput?.entry, sourceEntry);
assert.equal(translatedInput?.language, "zh-CN");

const generated = await resolveDictionaryRemoteFallback({
  word: "especially",
  targetLanguage: "vi",
  fetchFreeDictionaryApi: async () => { throw new Error("both dictionary providers unavailable"); },
  translateWithOpenRouter: async () => { throw new Error("no source entry"); },
  generateWithOpenRouter: async (word, language) => ({
    word,
    language,
    meanings: [{ partOfSpeech: "adverb", definition: "đặc biệt" }],
    source: "ai",
  }),
});
assert.equal(generated.provider, "openrouter");
assert.equal(generated.status, "translated");
assert.equal(generated.entry?.word, "especially");
assert.equal(generated.entry?.source, "ai");

const fallback = await resolveDictionaryRemoteFallback({
  word: "run",
  sourceEntry,
  targetLanguage: "vi",
  fetchFreeDictionaryApi: async () => { throw new Error("unavailable"); },
  translateWithOpenRouter: async () => { throw new Error("unavailable"); },
  generateWithOpenRouter: async () => { throw new Error("unavailable"); },
});
assert.equal(fallback.provider, "fallback");
assert.equal(fallback.status, "fallback");
assert.equal(fallback.entry, sourceEntry);

let abortedOpenRouterCalls = 0;
const abortController = new AbortController();
abortController.abort();
await assert.rejects(
  () => resolveDictionaryRemoteFallback({
    word: "run",
    sourceEntry,
    targetLanguage: "vi",
    signal: abortController.signal,
    fetchFreeDictionaryApi: async () => { throw new DOMException("Aborted", "AbortError"); },
    translateWithOpenRouter: async () => {
      abortedOpenRouterCalls += 1;
      return sourceEntry;
    },
    generateWithOpenRouter: async () => {
      abortedOpenRouterCalls += 1;
      return sourceEntry;
    },
  }),
  (error) => error?.name === "AbortError",
);
assert.equal(abortedOpenRouterCalls, 0);

console.log("PASS: remote dictionary fallback orders FreeDictionaryAPI before OpenRouter and preserves source fallback.");
