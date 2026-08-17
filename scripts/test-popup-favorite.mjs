import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";

for (const language of ["en", "vi", "zh-CN"]) {
  const copy = getPopupCopy(language);
  assert.ok(copy.favoriteAdd?.length > 0, `${language}: favoriteAdd`);
  assert.ok(copy.favoriteRemove?.length > 0, `${language}: favoriteRemove`);
}

const headerSource = await readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8");
assert.match(headerSource, /VOCABULARY_TOGGLE_FAVORITE/);
assert.match(headerSource, /Star/);
assert.match(headerSource, /isFavorite/);

console.log("test-popup-favorite: PASS");
