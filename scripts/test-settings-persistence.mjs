import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, backgroundSource] = await Promise.all([
  readFile(new URL("../src/settings/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
]);

const sendMessageSource = appSource.slice(appSource.indexOf("function sendMessage"), appSource.indexOf("function getProjectIconUrl"));
assert.match(sendMessageSource, /const lastError = chrome\.runtime\.lastError;/);
assert.match(sendMessageSource, /if \(lastError\) \{[\s\S]*?reject\(new Error\(lastError\.message \|\| "Không thể liên hệ tiện ích\."\)\);/);
assert.match(sendMessageSource, /if \(!response\?\.ok\) \{[\s\S]*?reject\(new Error\(response\?\.error \|\| "Tiện ích không xác nhận yêu cầu\."\)\);/);

const initializationSource = appSource.slice(appSource.indexOf("useEffect"), appSource.indexOf("async function handleSave"));
assert.match(initializationSource, /try \{[\s\S]*?await sendMessage<ExtensionSettings>\("GET_SETTINGS"\)[\s\S]*?\} catch \{[\s\S]*?setSettings\(DEFAULT_SETTINGS\)[\s\S]*?setApiKey\(DEFAULT_SETTINGS\.openRouterApiKey\)[\s\S]*?setModel\(DEFAULT_SETTINGS\.openRouterModel\)[\s\S]*?setSystemPrompt\(DEFAULT_SETTINGS\.systemPrompt\)[\s\S]*?setLoaded\(true\);/);

const saveSource = appSource.slice(appSource.indexOf("async function handleSave"), appSource.indexOf("function handleResetSystemPrompt"));
const payloadSource = saveSource.slice(saveSource.indexOf("const next: ExtensionSettings"), saveSource.indexOf('await sendMessage("SAVE_SETTINGS", next)'));
for (const field of [
  "selectionTriggerMode",
  "autoAskAIOnPopup",
  "targetLanguage",
  "openRouterApiKey",
  "openRouterModel",
  "openRouterThinkingEnabled",
  "systemPrompt",
]) {
  assert.match(payloadSource, new RegExp(`\\b${field}:`));
}
assert.doesNotMatch(payloadSource, /showPopupOnSelection/);
assert.match(saveSource, /await sendMessage\("SAVE_SETTINGS", next\);[\s\S]*?setSettings\(next\);[\s\S]*?setSaveState\("saved"\);[\s\S]*?toast\.success\("Đã lưu cài đặt"\);/);
assert.match(saveSource, /catch \{[\s\S]*?setSaveState\("error"\);[\s\S]*?toast\.error\("Không thể lưu cài đặt"\);/);

assert.match(backgroundSource, /import \{ getSettings, saveSettings \} from "@\/services\/storage\/settings";/);
const backgroundSaveSource = backgroundSource.slice(backgroundSource.indexOf("if (type === MESSAGE_TYPES.SAVE_SETTINGS)"), backgroundSource.indexOf("if (type === MESSAGE_TYPES.OPEN_SETTINGS)"));
assert.match(backgroundSaveSource, /void \(async \(\) => \{[\s\S]*?await saveSettings\(payload as ExtensionSettings\);[\s\S]*?sendResponse\(\{ ok: true \}\);/);
assert.match(backgroundSaveSource, /catch \(error\) \{[\s\S]*?const message = error instanceof Error && error\.message \? error\.message : "Không thể lưu cài đặt\.";[\s\S]*?sendResponse\(\{ ok: false, error: message \}\);/);
assert.match(backgroundSaveSource, /return true;/);

console.log("PASS: settings persistence waits for a successful background acknowledgement and surfaces failed requests.");
