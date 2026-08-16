import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, normalizeSettings, toPopupSettings } from "../src/shared/types.ts";

assert.equal(DEFAULT_SETTINGS.autoAskAIOnPopup, false);
assert.equal(normalizeSettings({}).autoAskAIOnPopup, false);
assert.equal(normalizeSettings({ autoAskAIOnPopup: true }).autoAskAIOnPopup, true);
assert.equal(DEFAULT_SETTINGS.includeSelectionContext, true);
assert.equal(normalizeSettings({}).includeSelectionContext, true);
assert.equal(normalizeSettings({ includeSelectionContext: false }).includeSelectionContext, false);

const withKey = toPopupSettings({
  ...DEFAULT_SETTINGS,
  autoAskAIOnPopup: true,
  openRouterApiKey: "secret",
});
assert.equal(withKey.autoAskAIOnPopup, true);
assert.equal(withKey.includeSelectionContext, true);
assert.equal(withKey.hasOpenRouterApiKey, true);

const withoutKey = toPopupSettings({
  ...DEFAULT_SETTINGS,
  autoAskAIOnPopup: true,
  openRouterApiKey: "   ",
});
assert.equal(withoutKey.autoAskAIOnPopup, true);
assert.equal(withoutKey.hasOpenRouterApiKey, false);

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

const [settingsSource, popupSettingsSource] = await Promise.all([
  readSettingsSource("../src/settings/App.tsx"),
  readSettingsSource("../src/settings/sections/PopupDictionarySection.tsx"),
]);
assert.match(popupSettingsSource, /id="auto-ask-ai"/);
assert.match(popupSettingsSource, /checked=\{settings\.autoAskAIOnPopup\}/);
assert.match(settingsSource, /autoAskAIOnPopup: settings\.autoAskAIOnPopup/);

const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");
const openPopupStart = contentSource.indexOf("async function openPopup");
const handleAskAIStart = contentSource.indexOf("async function handleAskAI");
assert.ok(openPopupStart >= 0 && handleAskAIStart > openPopupStart);
const openPopupSource = contentSource.slice(openPopupStart, handleAskAIStart);
assert.match(openPopupSource, /if \(shouldAutoAsk && settings\.autoAskAIOnPopup && settings\.hasOpenRouterApiKey\)/);
assert.match(openPopupSource, /void handleAskAI\(\{ revealTab: false \}\);/);
assert.match(contentSource, /void openPopup\(sel, true\)/);
assert.match(contentSource, /void openPopup\(currentSelectionInfo, false\)/);
assert.match(contentSource, /void openPopup\(currentSelectionInfo, false\);/);

const handleAskAI = contentSource.slice(handleAskAIStart, contentSource.indexOf("function handleRetry"));
assert.match(handleAskAI, /async function handleAskAI\(\{ revealTab = true \}: \{ revealTab\?: boolean \} = \{\}\)/);
assert.match(handleAskAI, /\.\.\.\(revealTab \? \{ activeTab: "ai" \} : \{\}\)/);
assert.match(handleAskAI, /aiRequested:\s*true/);
assert.match(handleAskAI, /settings\.includeSelectionContext/);
assert.match(handleAskAI, /\.\.\.\(settings\.includeSelectionContext \?/);
assert.match(handleAskAI, /let settled = false/);
assert.match(handleAskAI, /port\.onDisconnect\.addListener\([\s\S]*?setState\(\{ aiLoading: false, aiError: "INTERNAL" \}\)/);
const onMessageSource = handleAskAI.slice(
  handleAskAI.indexOf("port.onMessage.addListener"),
  handleAskAI.indexOf("port.onDisconnect.addListener"),
);
assert.match(onMessageSource, /if \(myId !== currentRequestId \|\| aiPort !== port \|\| !state\) return;/);
assert.doesNotMatch(handleAskAI, /setState\(\{\s*activeTab: "ai"/);

const stopAIStreamSource = contentSource.slice(contentSource.indexOf("function stopAIStream"), contentSource.indexOf("function addOutsideListeners"));
assert.ok(stopAIStreamSource.indexOf("aiPort = null") < stopAIStreamSource.indexOf("port.disconnect()"));

console.log("PASS: auto-ask setting and one-shot popup trigger contract are covered.");
