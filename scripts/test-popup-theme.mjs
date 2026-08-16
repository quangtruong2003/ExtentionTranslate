import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, normalizeSettings, toPopupSettings } from "../src/shared/types.ts";

const [popupCss, contentSource, sectionSource, appSource] = await Promise.all([
  readFile(new URL("../src/styles/popup.css", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/sections/PopupDictionarySection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/App.tsx", import.meta.url), "utf8"),
]);

// Auto theme via the OS, plus forced light/dark from the Settings preference.
assert.match(popupCss, /prefers-color-scheme: dark/, "popup tokens flip with the OS theme");
assert.match(popupCss, /:host\(\.ext-theme-dark\)/, "dark tokens can be forced");
assert.match(popupCss, /:host\(:not\(\.ext-theme-light\)\)/, "forced light overrides the OS dark theme");
assert.match(popupCss, /--popover: 222\.2 47% 8%/, "dark popover background");
assert.match(contentSource, /bg-background\/95/, "the selection trigger sits on a themed pill");
assert.match(contentSource, /shadow-md/, "the selection trigger is visible on any page background");

// The theme preference round-trips through settings.
assert.equal(DEFAULT_SETTINGS.theme, "auto", "new installs follow the system theme");
assert.equal(normalizeSettings({}).theme, "auto", "missing theme falls back to auto");
assert.equal(normalizeSettings({ theme: "blue" }).theme, "auto", "invalid theme values fall back to auto");
assert.equal(normalizeSettings({ theme: "dark" }).theme, "dark");
assert.equal(toPopupSettings({ ...DEFAULT_SETTINGS, theme: "light" }).theme, "light");

// The content script applies the preference to the shadow host.
assert.match(contentSource, /function applyHostTheme/, "content script owns the host theme class");
assert.match(contentSource, /ext-theme-dark/);
assert.match(contentSource, /ext-theme-light/);

// Settings exposes all three preferences and follows the choice itself.
assert.match(sectionSource, /Giao diện & ngôn ngữ/, "settings exposes the theme control");
assert.match(sectionSource, /value: "auto", label: "Tự động/);
assert.match(sectionSource, /value: "light", label: "Sáng"/);
assert.match(sectionSource, /value: "dark", label: "Tối"/);
assert.match(appSource, /classList\.toggle\("dark"/, "the settings page follows the effective theme");
assert.match(appSource, /matchMedia\("\(prefers-color-scheme: dark\)"\)/, "auto mode tracks the OS");

console.log("PASS: theme auto/light/dark works in settings, the popup, and the trigger.");
