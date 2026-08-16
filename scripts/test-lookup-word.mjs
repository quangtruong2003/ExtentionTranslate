import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [meaningSource, popupSource, contentSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/MeaningSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(meaningSource, /onLookupWord\?\.\(p\.phrase\)/, "phrases trigger a new lookup");
assert.match(meaningSource, /onLookupWord\?\.\(s\)/, "synonyms trigger a new lookup");
assert.match(meaningSource, /lookupWord\(/, "chips are labelled for screen readers");
assert.match(popupSource, /onLookupWord/);
assert.match(contentSource, /function handleLookupWord/, "content script owns the lookup handler");
assert.match(contentSource, /function runWordLookup/, "the lookup pipeline is shared by selection and chips");
assert.match(contentSource, /word: state\.word,/, "AI requests follow the currently displayed word");

console.log("PASS: synonyms and phrases look up in place.");
