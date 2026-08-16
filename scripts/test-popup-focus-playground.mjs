import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [popupSource, sectionSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/sections/PopupDictionarySection.tsx", import.meta.url), "utf8"),
]);

assert.match(popupSource, /aria-modal="true"/, "the dialog announces modality");
assert.match(popupSource, /handleTabTrap/, "Tab wraps inside the popup");
assert.match(sectionSource, /PREVIEW_ENTRY/, "settings embeds a preview entry");
assert.match(sectionSource, /<DictionaryPopup/, "the preview renders the real popup component");

console.log("PASS: popup traps focus and settings previews the popup.");
