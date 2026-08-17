import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/popup.css", import.meta.url), "utf8");
assert.match(css, /@keyframes\s+ext-pop-in/);
assert.match(css, /@keyframes\s+ext-shimmer/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /\.animate-fade-in/);

console.log("test-popup-animation: PASS");
