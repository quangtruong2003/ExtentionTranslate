import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Break this catches: a multi-word selection enters the dictionary lookup path
// before being classified as raw text translation.
const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  const asyncStart = source.indexOf(`async function ${name}`);
  const functionStart = [start, asyncStart].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  assert.ok(functionStart >= 0, `${name} is declared`);

  const openBrace = source.indexOf("{", functionStart);
  assert.ok(openBrace > functionStart, `${name} has a body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(functionStart, index + 1);
    }
  }
  assert.fail(`${name} body is balanced`);
}

function extractIfBlock(source, condition) {
  const conditionIndex = source.indexOf(condition);
  assert.ok(conditionIndex >= 0, `found branch ${condition}`);
  const openBrace = source.indexOf("{", conditionIndex);
  assert.ok(openBrace > conditionIndex, `branch ${condition} has a body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(conditionIndex, index + 1);
    }
  }
  assert.fail(`branch ${condition} body is balanced`);
}

assert.match(contentSource, /import \{[^}]*classifySelection[^}]*normalizeBrowserSourceLanguage[^}]*\} from "\.\/selectionMode"/);

const openPopup = extractFunction(contentSource, "openPopup");
const classificationIndex = openPopup.indexOf("classifySelection(info.text)");
const dictionaryLookupIndex = openPopup.indexOf("MESSAGE_TYPES.DICTIONARY_LOOKUP");
assert.ok(classificationIndex >= 0, "openPopup classifies the selection");
assert.ok(dictionaryLookupIndex >= 0, "openPopup still owns the dictionary lookup");
assert.ok(
  classificationIndex < dictionaryLookupIndex,
  "openPopup classifies before sending DICTIONARY_LOOKUP",
);

assert.match(openPopup, /word:\s*selectionMode\.sourceText/);
assert.match(openPopup, /if \(settings\.targetLanguage !== "en"\)[\s\S]*browserDictionaryTranslator\.warm\(settings\.targetLanguage\)/);
assert.match(openPopup, /if \(shouldAutoAsk && settings\.autoAskAIOnPopup && settings\.hasOpenRouterApiKey\)/);
assert.match(openPopup, /void handleAskAI\(\{ revealTab: false \}\);/);

const textBranch = extractIfBlock(openPopup, 'if (selectionMode.kind === "text")');
assert.match(openPopup, /phase:\s*selectionMode\.kind === "text"\s*\?\s*\{\s*kind:\s*"translation-loading",\s*sourceText:\s*selectionMode\.sourceText\s*\}\s*:\s*\{\s*kind:\s*"loading"\s*\}/);
assert.match(openPopup, /activeTab:\s*"dictionary"/);
assert.match(textBranch, /void translateSelectedText\(info,\s*selectionMode\.sourceText,\s*myId\)/);
assert.match(textBranch, /return;/);
assert.doesNotMatch(textBranch, /MESSAGE_TYPES\.DICTIONARY_LOOKUP/);

assert.match(openPopup, /MESSAGE_TYPES\.DICTIONARY_LOOKUP,[\s\S]*word:\s*selectionMode\.lookupText/);
assert.match(openPopup, /language:\s*info\.pageLanguage/);
assert.match(openPopup, /targetLanguage:\s*settings\.targetLanguage/);

const translateSelectedText = extractFunction(contentSource, "translateSelectedText");
assert.match(translateSelectedText, /async function translateSelectedText\(info: SelectionInfo,\s*sourceText: string,\s*requestId: number\): Promise<void>/);
assert.match(translateSelectedText, /stopDictionaryTranslation\(\)/);
assert.match(translateSelectedText, /const controller = new AbortController\(\)/);
assert.match(translateSelectedText, /translationController = controller/);
assert.match(translateSelectedText, /translationRequestId = requestId/);
assert.match(translateSelectedText, /normalizeBrowserSourceLanguage\(info\.pageLanguage\) \?\? "en"/);
assert.match(translateSelectedText, /const targetLanguage = toBrowserTextTargetLanguage\(settings\.targetLanguage\)/);
assert.match(translateSelectedText, /if \(sourceLanguage === targetLanguage\)/);
assert.match(translateSelectedText, /provider:\s*"source"/);
assert.match(translateSelectedText, /browserDictionaryTranslator\.translateText\(\s*sourceText,\s*sourceLanguage,\s*targetLanguage,\s*controller\.signal,?\s*\)/);
assert.match(translateSelectedText, /provider:\s*"browser"/);
assert.match(translateSelectedText, /TRANSLATOR_UNAVAILABLE/);
assert.match(translateSelectedText, /TRANSLATION_FAILED/);
assert.match(translateSelectedText, /requestId !== currentRequestId \|\| controller\.signal\.aborted \|\| !state/);

const applySettings = extractFunction(contentSource, "applySettings");
assert.match(applySettings, /targetLanguageChanged && popupWasOpened && currentSelectionInfo/);
assert.match(applySettings, /void openPopup\(currentSelectionInfo,\s*false\)/);

console.log("PASS: adaptive selection content flow contract is implemented.");
