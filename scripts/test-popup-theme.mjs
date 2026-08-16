import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [popupCss, contentSource] = await Promise.all([
  readFile(new URL("../src/styles/popup.css", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(popupCss, /prefers-color-scheme: dark/, "popup tokens flip with the OS theme");
assert.match(popupCss, /--popover: 222\.2 47% 8%/, "dark popover background");
assert.match(contentSource, /bg-background\/95/, "the selection trigger sits on a themed pill");
assert.match(contentSource, /shadow-md/, "the selection trigger is visible on any page background");

console.log("PASS: popup and trigger adapt to dark mode with a visible pill.");
