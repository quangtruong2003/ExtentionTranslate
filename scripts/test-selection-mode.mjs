import assert from "node:assert/strict";
import { classifySelection, normalizeBrowserSourceLanguage } from "../src/content/selectionMode.ts";
import { MAX_SELECTION_LENGTH } from "../src/shared/constants.ts";

assert.deepEqual(classifySelection("Uranium"), {
  kind: "word",
  sourceText: "Uranium",
  lookupText: "Uranium",
});

assert.deepEqual(classifySelection("don't"), {
  kind: "word",
  sourceText: "don't",
  lookupText: "don't",
});

assert.deepEqual(classifySelection("state-of-the-art"), {
  kind: "word",
  sourceText: "state-of-the-art",
  lookupText: "state-of-the-art",
});

assert.deepEqual(classifySelection("run."), {
  kind: "word",
  sourceText: "run.",
  lookupText: "run",
});

assert.deepEqual(classifySelection("run away"), {
  kind: "text",
  sourceText: "run away",
});

assert.deepEqual(classifySelection("Uranium is a radioactive material."), {
  kind: "text",
  sourceText: "Uranium is a radioactive material.",
});

assert.deepEqual(classifySelection("First line.\r\nSecond line."), {
  kind: "text",
  sourceText: "First line.\nSecond line.",
});

assert.deepEqual(classifySelection("https://example.com/run"), {
  kind: "text",
  sourceText: "https://example.com/run",
});

assert.deepEqual(classifySelection("+1,234.56%"), {
  kind: "text",
  sourceText: "+1,234.56%",
});

assert.deepEqual(classifySelection("  repeated   spaces  "), {
  kind: "text",
  sourceText: "repeated spaces",
});

assert.equal(normalizeBrowserSourceLanguage("en-US"), "en");
assert.equal(normalizeBrowserSourceLanguage("vi-VN"), "vi");
assert.equal(normalizeBrowserSourceLanguage("zh-CN"), "zh");
assert.equal(normalizeBrowserSourceLanguage("fr-FR"), undefined);
assert.equal(MAX_SELECTION_LENGTH, 2000);

console.log("PASS: selection mode classification, page-language normalization, and selection length bounds are covered.");
