import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPartOfSpeechLabels, localizePartOfSpeech } from "../src/components/dictionary/partOfSpeech.ts";

const radioactive = {
  meanings: [
    { partOfSpeech: "noun", definition: "Any radioactive substance." },
    { partOfSpeech: "adjective", definition: "Exhibiting radioactivity." },
    { partOfSpeech: " noun ", definition: "A radioactive material." },
    { partOfSpeech: "NOUN", definition: "A radioactive material, again." },
  ],
};

assert.deepEqual(
  getPartOfSpeechLabels(radioactive),
  ["noun", "adjective"],
  "the header must expose every distinct part of speech instead of only the first meaning",
);
assert.deepEqual(getPartOfSpeechLabels({ meanings: [{ definition: "No grammar label." }] }), []);
assert.deepEqual(getPartOfSpeechLabels({ meanings: [] }), []);

const headerSource = await readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8");
assert.match(headerSource, /getPartOfSpeechLabels\(entry/);
assert.doesNotMatch(headerSource, /entry\.meanings\[0\]\.partOfSpeech/);

assert.deepEqual(
  getPartOfSpeechLabels(radioactive, "vi"),
  ["danh từ", "tính từ"],
  "Vietnamese display localizes every distinct part of speech",
);
assert.deepEqual(
  getPartOfSpeechLabels(radioactive, "zh-CN"),
  ["名词", "形容词"],
  "Simplified Chinese display localizes every distinct part of speech",
);
assert.equal(localizePartOfSpeech("noun", "vi"), "danh từ");
assert.equal(localizePartOfSpeech("determiner", "vi"), "hạn định từ");
assert.equal(localizePartOfSpeech("noun", "en"), "noun");
assert.equal(localizePartOfSpeech("somethingexotic", "vi"), "somethingexotic", "unknown labels fall back to the source");
const meaningSource = await readFile(new URL("../src/components/dictionary/MeaningSection.tsx", import.meta.url), "utf8");
assert.match(meaningSource, /localizePartOfSpeech\(meaning\.partOfSpeech, targetLanguage\)/);

console.log("PASS: dictionary header preserves every distinct part of speech.");
