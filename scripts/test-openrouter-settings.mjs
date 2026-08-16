import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, getOpenRouterSettingsValidationError, normalizeSettings } from "../src/shared/types.ts";

assert.equal(DEFAULT_SETTINGS.openRouterReasoningEffort, "low");
assert.equal(DEFAULT_SETTINGS.openRouterReasoningMaxTokens, null);
assert.equal(DEFAULT_SETTINGS.openRouterMaxTokens, 1600);

const legacy = normalizeSettings({ openRouterApiKey: "old" });
assert.equal(legacy.openRouterReasoningEffort, "low");
assert.equal(legacy.openRouterReasoningMaxTokens, null);
assert.equal(legacy.openRouterMaxTokens, 1600);

assert.equal(normalizeSettings({ openRouterReasoningEffort: "high" }).openRouterReasoningEffort, "high");
assert.equal(normalizeSettings({ openRouterReasoningEffort: "invalid" }).openRouterReasoningEffort, "low");
assert.equal(normalizeSettings({ openRouterMaxTokens: 4096 }).openRouterMaxTokens, 4096);
assert.equal(normalizeSettings({ openRouterMaxTokens: 511 }).openRouterMaxTokens, 1600);
assert.equal(normalizeSettings({ openRouterReasoningMaxTokens: 2048, openRouterMaxTokens: 3200 }).openRouterReasoningMaxTokens, 2048);
assert.equal(normalizeSettings({ openRouterReasoningMaxTokens: 1024, openRouterMaxTokens: 1024 }).openRouterReasoningMaxTokens, null);

assert.equal(getOpenRouterSettingsValidationError({ ...DEFAULT_SETTINGS, openRouterMaxTokens: 511 }), "Max output tokens phải nằm trong khoảng 512–8192.");
assert.equal(getOpenRouterSettingsValidationError({ ...DEFAULT_SETTINGS, openRouterReasoningMaxTokens: 1024, openRouterMaxTokens: 1024 }), "Reasoning budget phải nhỏ hơn Max output tokens.");
assert.equal(getOpenRouterSettingsValidationError(DEFAULT_SETTINGS), null);

console.log("PASS: OpenRouter reasoning and token settings default, migrate, and validate safely.");
