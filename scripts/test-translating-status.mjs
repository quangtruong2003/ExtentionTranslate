import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [popupSource, tabsSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/PopupTabs.tsx", import.meta.url), "utf8"),
]);

// Spinner + aria-live status row while translating.
assert.match(popupSource, /aria-live="polite"/);
assert.match(popupSource, /Loader2/);
// Tab bar shows a translating dot on the dictionary tab.
assert.match(tabsSource, /dictionaryTranslating/);

console.log("test-translating-status: PASS");
