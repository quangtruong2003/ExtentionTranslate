import assert from "node:assert/strict";
import { fetchFreeDictionaryApi, parseFreeDictionaryApiSource, parseFreeDictionaryApiTranslations, toFreeDictionaryLanguage } from "../src/services/dictionary/freeDictionaryApi.ts";

const sourceEntry = {
  word: "run",
  language: "en",
  phonetics: {
    uk: "/rʌn/",
    us: "/rʌn/",
    audioUk: "https://api.dictionaryapi.dev/media/pronunciations/en/run-uk.mp3",
    audioUs: "https://api.dictionaryapi.dev/media/pronunciations/en/run-us.mp3",
  },
  wordForms: ["running", "ran"],
  meanings: [
    { partOfSpeech: "verb", definition: "to move quickly", examples: ["They run every day."], synonyms: ["jog"] },
    { partOfSpeech: "noun", definition: "an act of running", examples: ["She went for a run."], synonyms: ["sprint"] },
  ],
  source: "free-api",
};

const raw = {
  word: "run",
  entries: [
    {
      language: { code: "en", name: "English" },
      partOfSpeech: "verb",
      pronunciations: [{ type: "ipa", text: "/ɹʌn/", tags: ["General American"] }],
      forms: [{ word: "running", tags: ["participle"] }],
      senses: [
        {
          definition: "To move swiftly.",
          translations: [],
          subsenses: [{
            definition: "To move quickly.",
            translations: [
              { language: { code: "vi", name: "Vietnamese" }, word: "chạy" },
              { language: { code: "cmn", name: "Chinese Mandarin" }, word: "跑" },
              { language: { code: "vi", name: "Vietnamese" }, word: "chạy" },
            ],
          }],
        },
      ],
      synonyms: ["gallop"],
      antonyms: [],
    },
  ],
  source: { name: "Wiktionary" },
};

assert.equal(toFreeDictionaryLanguage("vi"), "vi");
assert.equal(toFreeDictionaryLanguage("zh-CN"), "cmn");
assert.deepEqual(parseFreeDictionaryApiTranslations(raw, "vi"), ["chạy"]);
assert.deepEqual(parseFreeDictionaryApiTranslations(raw, "zh-CN"), ["跑"]);
assert.deepEqual(
  parseFreeDictionaryApiTranslations({ entries: [{ senses: [{ translations: [{ language: { code: "zh" }, word: "奔跑" }] }] }] }, "zh-CN"),
  ["奔跑"],
);
assert.deepEqual(parseFreeDictionaryApiTranslations(raw, "vi"), ["chạy"]);
assert.deepEqual(parseFreeDictionaryApiTranslations(raw, "zh-CN"), ["跑"]);
assert.equal(parseFreeDictionaryApiTranslations(raw, "vi").length, 1);
assert.equal(parseFreeDictionaryApiTranslations(raw, "zh-CN").length, 1);

const fallback = parseFreeDictionaryApiSource(raw, "run");
assert.equal(fallback?.word, "run");
assert.equal(fallback?.language, "en");
assert.equal(fallback?.meanings[0].partOfSpeech, "verb");
assert.equal(fallback?.meanings[0].definition, "To move swiftly.");
assert.deepEqual(fallback?.wordForms, ["running"]);
assert.equal(fallback?.phonetics?.us, "/ɹʌn/");
assert.equal(fallback?.source, "free-dictionary-api");
assert.equal(parseFreeDictionaryApiSource({ entries: [] }, "missing"), null);

const originalFetch = globalThis.fetch;
let fetchedUrl = "";
globalThis.fetch = async (input) => {
  fetchedUrl = String(input);
  return new Response(JSON.stringify(raw), { status: 200, headers: { "content-type": "application/json" } });
};
const fetched = await fetchFreeDictionaryApi("run fast");
assert.equal(fetched.word, "run");
assert.match(fetchedUrl, /freedictionaryapi\.com\/api\/v1\/entries\/en\/run%20fast\?translations=true$/);
globalThis.fetch = originalFetch;

console.log("PASS: FreeDictionaryAPI.com parser handles nested sense translations and source fallback.");
