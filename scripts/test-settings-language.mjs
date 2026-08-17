import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SUPPORTED_TARGET_LANGUAGES } from "../src/shared/types.ts";

assert.deepEqual(
  SUPPORTED_TARGET_LANGUAGES,
  [
    { value: "en", label: "English" },
    { value: "vi", label: "Tiếng Việt" },
    { value: "zh-CN", label: "简体中文" },
  ],
);

async function readSettingsSource(path) {
  try {
    return await readFile(new URL(path, import.meta.url), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return `MISSING: ${path}`;
    }
    throw error;
  }
}

const [popupSource, openRouterSource] = await Promise.all([
  readSettingsSource("../src/settings/sections/PopupDictionarySection.tsx"),
  readSettingsSource("../src/settings/sections/OpenRouterSection.tsx"),
]);

assert.match(popupSource, /languageTitle/);
assert.match(popupSource, /languageDescription/);
assert.match(openRouterSource, /systemPromptHint/);
assert.doesNotMatch(openRouterSource, /Ngôn ngữ ưu tiên khi AI giải thích/);

console.log("PASS: settings exposes English, Vietnamese, and Simplified Chinese for the Dictionary tab.");
