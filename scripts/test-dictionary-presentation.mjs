import assert from "node:assert/strict";
import {
  normalizeDictionaryPresentation,
  normalizeSentencePresentation,
} from "../src/services/dictionary/presentation.ts";

assert.equal(normalizeSentencePresentation("  để bật ", "vi"), "Để bật.");
assert.equal(normalizeSentencePresentation("đến trạng thái hoạt động.", "vi"), "Đến trạng thái hoạt động.");
assert.equal(normalizeSentencePresentation("turn it on!", "en"), "Turn it on!");
assert.equal(normalizeSentencePresentation("快速移动", "zh-CN"), "快速移动。");
assert.equal(normalizeSentencePresentation("V2/V3", "vi"), "V2/V3");
assert.equal(normalizeSentencePresentation("V2", "vi"), "V2");
assert.equal(normalizeSentencePresentation("V3", "vi"), "V3");
assert.equal(normalizeSentencePresentation("N", "vi"), "N");
assert.equal(normalizeSentencePresentation("run", "en"), "Run.");
assert.equal(normalizeSentencePresentation("bật", "vi"), "Bật.");

const entry = {
  word: "run",
  language: "vi",
  phonetics: { uk: "/rʌn/", audioUk: "https://audio.example/run.mp3" },
  wordForms: ["runs", "running", "ran"],
  meanings: [{
    partOfSpeech: "động từ",
    cefr: "A2",
    definition: "  chạy   nhanh ",
    translation: "  chạy ",
    examples: ["  tôi   chạy ", "V2/V3"],
    phrases: [{ phrase: "run fast", translation: "chạy nhanh", meaning: "di chuyển nhanh" }],
    synonyms: ["phi nước đại"],
  }],
  source: "cache",
};
const original = structuredClone(entry);

const normalized = normalizeDictionaryPresentation(entry, "vi");

assert.deepEqual(entry, original, "presentation normalization must not mutate provider or cache entries");
assert.notEqual(normalized, entry);
assert.notEqual(normalized.meanings, entry.meanings);
assert.equal(normalized.meanings[0].definition, "Chạy nhanh.");
assert.equal(normalized.meanings[0].translation, "Chạy.");
assert.deepEqual(normalized.meanings[0].examples, ["Tôi chạy.", "V2/V3"]);
assert.equal(normalized.word, entry.word);
assert.equal(normalized.language, entry.language);
assert.equal(normalized.phonetics, entry.phonetics);
assert.equal(normalized.wordForms, entry.wordForms);
assert.equal(normalized.meanings[0].partOfSpeech, entry.meanings[0].partOfSpeech);
assert.equal(normalized.meanings[0].cefr, entry.meanings[0].cefr);
assert.equal(normalized.meanings[0].phrases, entry.meanings[0].phrases);
assert.equal(normalized.meanings[0].synonyms, entry.meanings[0].synonyms);

const entryWithoutOptionalSentenceFields = {
  ...entry,
  meanings: [{ definition: "chạy" }],
};
const normalizedWithoutOptionalSentenceFields = normalizeDictionaryPresentation(entryWithoutOptionalSentenceFields, "vi");
assert.equal("translation" in normalizedWithoutOptionalSentenceFields.meanings[0], false);
assert.equal("examples" in normalizedWithoutOptionalSentenceFields.meanings[0], false);

console.log("PASS: dictionary presentation localizes sentence fields without mutating provider metadata.");
