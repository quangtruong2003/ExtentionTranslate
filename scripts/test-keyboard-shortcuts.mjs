import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.TOGGLE_POPUP, "TOGGLE_POPUP");

const [manifest, backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.ok(manifest.commands?.["toggle-popup"], "manifest declares toggle-popup command");
assert.match(backgroundSource, /chrome\.commands\.onCommand/);
assert.match(backgroundSource, /TOGGLE_POPUP/);
assert.match(contentSource, /altKey/);
assert.match(contentSource, /MESSAGE_TYPES\.TOGGLE_POPUP/);

console.log("test-keyboard-shortcuts: PASS");
