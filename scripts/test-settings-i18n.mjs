import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SETTINGS_LOCALES, getSettingsCopy } from "../src/settings/locales/index.ts";

const languages = ["en", "vi", "zh-CN"];
const referenceKeys = Object.keys(SETTINGS_LOCALES.vi).sort();
assert.ok(referenceKeys.length >= 30, "locale map covers the settings surface");

for (const language of languages) {
  const copy = getSettingsCopy(language);
  assert.deepEqual(Object.keys(copy).sort(), referenceKeys, `${language} has the same keys as vi`);
  for (const [key, value] of Object.entries(copy)) {
    assert.ok(typeof value === "string" && value.length > 0, `${language}.${key} is a non-empty string`);
  }
}

// Settings components consume the locale helper, not hardcoded Vietnamese.
const files = [
  "../src/settings/App.tsx",
  "../src/settings/sections/OverviewSection.tsx",
  "../src/settings/sections/PopupDictionarySection.tsx",
  "../src/settings/sections/OpenRouterSection.tsx",
  "../src/settings/sections/AboutSection.tsx",
];
for (const file of files) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  assert.match(source, /getSettingsCopy/, `${file} uses getSettingsCopy`);
}

console.log("test-settings-i18n: PASS");
