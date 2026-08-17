import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";

for (const language of ["en", "vi", "zh-CN"]) {
  const copy = getPopupCopy(language);
  assert.ok(copy.speakTranslation?.length > 0, `${language}: speakTranslation copy`);
  assert.ok(copy.speakOriginal?.length > 0, `${language}: speakOriginal copy`);
}

const panelSource = await readFile(new URL("../src/components/dictionary/TextTranslationPanel.tsx", import.meta.url), "utf8");
assert.match(panelSource, /speakPronunciation/);
assert.match(panelSource, /speakTranslation/);
assert.match(panelSource, /speakOriginal/);
// Translation is spoken in the target language, original in its detected source language.
assert.match(panelSource, /targetSpeechLang/);

console.log("test-text-translation-speak: PASS");
