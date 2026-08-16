import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, normalizeSettings, toPopupSettings } from "../src/shared/types.ts";

assert.equal(DEFAULT_SETTINGS.openRouterThinkingEnabled, true);
assert.equal(normalizeSettings({ openRouterApiKey: "old" }).openRouterThinkingEnabled, true);
assert.equal(normalizeSettings({ openRouterThinkingEnabled: false }).openRouterThinkingEnabled, false);

const popupSettings = toPopupSettings({ ...DEFAULT_SETTINGS, openRouterApiKey: "secret" });
assert.equal(popupSettings.hasOpenRouterApiKey, true);
assert.equal("openRouterApiKey" in popupSettings, false);

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

const openRouterSource = await readSettingsSource("../src/settings/sections/OpenRouterSection.tsx");
assert.match(openRouterSource, /id="openrouter-thinking"/);
assert.match(openRouterSource, /checked=\{settings\.openRouterThinkingEnabled\}/);

console.log("PASS: thinking setting defaults and migration are stable.");
