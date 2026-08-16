import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contentSource, headerSource, panelSource] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/TextTranslationPanel.tsx", import.meta.url), "utf8"),
]);

assert.match(contentSource, /position="bottom-center"/, "errors surface near the popup, not mid-page");
assert.doesNotMatch(contentSource, /position="top-center"/);
assert.doesNotMatch(headerSource, /toast\.success\(labels\.copied\)/, "copy success is inline, not a toast");
assert.match(headerSource, /copied/);
assert.match(panelSource, /copiedTranslation/);
assert.match(panelSource, /copiedOriginal/);

console.log("PASS: copy feedback is inline and toasts move to the bottom.");
