import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES, KEEP_WARM_INTERVAL_MS } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.KEEP_WARM, "KEEP_WARM");
assert.equal(KEEP_WARM_INTERVAL_MS, 20000);

const [backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(backgroundSource, /MESSAGE_TYPES\.KEEP_WARM/);
assert.match(contentSource, /startKeepWarm/);
assert.match(contentSource, /stopKeepWarm/);
// Keep-warm must stop when the popup closes.
const closePopupBody = contentSource.slice(contentSource.indexOf("function closePopup"), contentSource.indexOf("function stopAIStream"));
assert.match(closePopupBody, /stopKeepWarm\(\)/);

console.log("test-keep-warm: PASS");
