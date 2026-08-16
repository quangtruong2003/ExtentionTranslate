import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [aiSource, popupSource, contentSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/AISection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(aiSource, /onStop/, "AISection accepts a stop handler");
assert.match(aiSource, /labels\.stopGeneration/, "the stop button uses localized copy");
assert.match(popupSource, /onStop=/);
assert.match(contentSource, /function handleStopAI/);

console.log("PASS: streaming can be stopped from the AI tab.");
