import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.PREFETCH_DICTIONARY, "PREFETCH_DICTIONARY");

const [backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

// Background handles the prefetch by warming the lookup cache, swallowing errors.
assert.match(backgroundSource, /MESSAGE_TYPES\.PREFETCH_DICTIONARY/);
const prefetchHandler = backgroundSource.slice(
  backgroundSource.indexOf("MESSAGE_TYPES.PREFETCH_DICTIONARY"),
  backgroundSource.indexOf("MESSAGE_TYPES.PRONUNCIATION_FETCH"),
);
assert.match(prefetchHandler, /lookupDictionarySource/);

// Content script prefetches word selections once the debounce settles.
assert.match(contentSource, /MESSAGE_TYPES\.PREFETCH_DICTIONARY/);
const selectionHandler = contentSource.slice(
  contentSource.indexOf("function onSelectionEvent"),
  contentSource.indexOf("async function refreshSettings"),
);
assert.match(selectionHandler, /PREFETCH_DICTIONARY/);
assert.match(selectionHandler, /classifySelection/);

console.log("test-dictionary-prefetch: PASS");
