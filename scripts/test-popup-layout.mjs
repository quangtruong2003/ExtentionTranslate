import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [tabsSource, headerSource, popupSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/PopupTabs.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
]);

assert.match(tabsSource, /grid-cols-2/);
assert.match(tabsSource, /w-full/);
assert.doesNotMatch(headerSource, /\bX\b/);
assert.doesNotMatch(headerSource, /onClose/);
assert.match(popupSource, /max-w-\[min\(560px,calc\(100vw-24px\)\)\]/);

console.log("PASS: popup tabs are balanced, the visible close action is removed, and the responsive width boundary remains.");
