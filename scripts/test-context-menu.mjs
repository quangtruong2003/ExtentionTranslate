import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.CONTEXT_LOOKUP, "CONTEXT_LOOKUP");

const [manifest, backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.ok(manifest.permissions.includes("contextMenus"), "manifest declares contextMenus");
assert.match(backgroundSource, /chrome\.contextMenus\.create/);
assert.match(backgroundSource, /ext-lookup-word/);
assert.match(backgroundSource, /ext-translate-text/);
assert.match(backgroundSource, /chrome\.tabs\.sendMessage/);
assert.match(contentSource, /CONTEXT_LOOKUP/);

console.log("test-context-menu: PASS");
