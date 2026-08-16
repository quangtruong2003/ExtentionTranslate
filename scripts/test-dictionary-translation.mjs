import assert from "node:assert/strict";
import { normalizeTranslatedEntry, translateDictionaryEntry } from "../src/services/dictionary/translation.ts";

const sourceEntry = {
  word: "run",
  language: "en",
  phonetics: {
    uk: "/rʌn/",
    us: "/rʌn/",
    audioUk: "https://api.dictionaryapi.dev/media/pronunciations/en/run-uk.mp3",
    audioUs: "https://api.dictionaryapi.dev/media/pronunciations/en/run-us.mp3",
  },
  meanings: [{
    partOfSpeech: "verb",
    definition: "to move quickly on foot",
    examples: ["They run every morning."],
    synonyms: ["jog"],
  }],
  source: "free-api",
};

const translated = normalizeTranslatedEntry({
  language: "vi",
  meanings: [{
    partOfSpeech: "động từ",
    definition: "di chuyển nhanh bằng chân",
    examples: ["Họ chạy bộ mỗi sáng."],
    synonyms: ["chạy bộ"],
  }],
}, sourceEntry, "vi");

assert.equal(translated?.word, "run");
assert.equal(translated?.language, "vi");
assert.equal(translated?.phonetics?.audioUk, sourceEntry.phonetics.audioUk);
assert.equal(translated?.phonetics?.audioUs, sourceEntry.phonetics.audioUs);
assert.equal(translated?.meanings[0].definition, "Di chuyển nhanh bằng chân.");

const simplifiedChinese = normalizeTranslatedEntry({
  language: "zh-CN",
  meanings: [{ definition: "快速用脚移动" }],
}, sourceEntry, "zh-CN");
assert.equal(simplifiedChinese?.language, "zh-CN");
assert.equal(simplifiedChinese?.meanings[0].definition, "快速用脚移动。");

const minimalSourceEntry = {
  word: "run",
  meanings: [{ definition: "to move quickly" }],
  source: "free-api",
};
const minimalTranslation = normalizeTranslatedEntry(
  { meanings: [{ definition: "chạy nhanh" }] },
  minimalSourceEntry,
  "vi",
);
assert.deepEqual(minimalTranslation?.meanings[0], { definition: "Chạy nhanh." });

assert.equal(normalizeTranslatedEntry({ language: "vi", meanings: [] }, sourceEntry, "vi"), null);
assert.equal(normalizeTranslatedEntry({ language: "vi" }, sourceEntry, "vi"), null);

const sourceResult = await translateDictionaryEntry(sourceEntry, "en", async () => {
  throw new Error("English should not call the translation provider");
});
assert.equal(sourceResult.status, "source");
assert.equal(sourceResult.entry, sourceEntry);

const translatedResult = await translateDictionaryEntry(sourceEntry, "vi", async (_entry, language) => {
  assert.equal(language, "vi");
  return { language: "vi", meanings: [{ definition: "di chuyển nhanh bằng chân" }] };
});
assert.equal(translatedResult.status, "translated");
assert.equal(translatedResult.entry.meanings[0].definition, "Di chuyển nhanh bằng chân.");
assert.deepEqual(translatedResult.entry.meanings[0].examples, sourceEntry.meanings[0].examples);
assert.deepEqual(translatedResult.entry.meanings[0].synonyms, sourceEntry.meanings[0].synonyms);

const incompleteTranslation = normalizeTranslatedEntry(
  { language: "vi", meanings: [{ definition: "chạy" }] },
  sourceEntry,
  "vi",
);
assert.deepEqual(incompleteTranslation?.meanings[0].examples, sourceEntry.meanings[0].examples);
assert.deepEqual(incompleteTranslation?.meanings[0].synonyms, sourceEntry.meanings[0].synonyms);
assert.equal(
  normalizeTranslatedEntry({ language: "vi", meanings: [{ definition: "chạy" }] }, { ...sourceEntry, meanings: [sourceEntry.meanings[0], sourceEntry.meanings[0]] }, "vi"),
  null,
  "a translation that drops a meaning must fall back to the source entry",
);

const fallbackResult = await translateDictionaryEntry(sourceEntry, "zh-CN", async () => {
  throw new Error("translation unavailable");
});
assert.equal(fallbackResult.status, "fallback");
assert.equal(fallbackResult.entry, sourceEntry);

console.log("PASS: dictionary translation contracts preserve source metadata and fallback safely.");
