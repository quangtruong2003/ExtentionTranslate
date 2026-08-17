import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");
const watcher = contentSource.slice(
  contentSource.indexOf("function startViewportWatcher"),
  contentSource.indexOf("function schedulePopupPlacement"),
);
assert.ok(watcher.length > 0, "located viewport watcher");

// The watcher reacts to resize events instead of relying on a tight poll.
assert.match(watcher, /addEventListener\("resize"/);
// The residual safety poll runs at most 4 times per second.
assert.match(watcher, /250/);
assert.doesNotMatch(watcher, /setTimeout\(watch,\s*50\)/, "50ms tight poll removed");

console.log("test-viewport-watcher: PASS");
