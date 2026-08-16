import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";

async function readSource(path) {
  try {
    return await readFile(new URL(path, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`Missing required source file: ${path}`);
    }
    throw error;
  }
}

const [popupSource, tabsSource, panelSource] = await Promise.all([
  readSource("../src/components/dictionary/DictionaryPopup.tsx"),
  readSource("../src/components/dictionary/PopupTabs.tsx"),
  readSource("../src/components/dictionary/TextTranslationPanel.tsx"),
]);

assert.match(popupSource, /kind: "translation-loading"; sourceText: string/);
assert.match(popupSource, /kind: "translation-ready"; sourceText: string; translatedText: string; provider: "browser" \| "source"/);
assert.match(popupSource, /kind: "translation-error"; sourceText: string; code: "TRANSLATOR_UNAVAILABLE" \| "TRANSLATION_FAILED"/);
assert.match(popupSource, /phase\.kind === "ready" &&/);
assert.match(popupSource, /primaryLabel=\{isTranslationPhase \? labels\.translationTab : undefined\}/);
assert.match(popupSource, /<TextTranslationPanel/);
assert.doesNotMatch(popupSource, /phase\.kind === "translation-[\s\S]{0,240}<DictionaryHeader/);

assert.match(tabsSource, /primaryLabel\?: string/);
assert.match(tabsSource, /label: primaryLabel \?\? copy\.dictionaryTab/);

assert.match(panelSource, /interface Props[\s\S]*targetLanguage: TargetLanguage/);
assert.match(panelSource, /phase: Extract<PopupPhase,[\s\S]*translation-loading[\s\S]*translation-ready[\s\S]*translation-error/);
assert.match(panelSource, /hasApiKey: boolean/);
assert.match(panelSource, /onRetry: \(\) => void/);
assert.match(panelSource, /onAskAI: \(\) => void/);
assert.match(panelSource, /labels\.originalText/);
assert.match(panelSource, /labels\.translatedText/);
assert.match(panelSource, /labels\.browserTranslationBadge/);
assert.match(panelSource, /labels\.translationPreparing/);
assert.match(panelSource, /labels\.translatorUnavailable/);
assert.match(panelSource, /labels\.translationFailed/);
assert.match(panelSource, /labels\.copyOriginal/);
assert.match(panelSource, /labels\.copyTranslation/);
assert.match(panelSource, /whitespace-pre-wrap/);
assert.match(panelSource, /break-words/);
assert.match(panelSource, /min-w-0/);
assert.match(panelSource, /copyText\(phase\.sourceText, labels\)/);
assert.match(panelSource, /copyText\(phase\.translatedText, labels\)/);
assert.match(panelSource, /phase\.provider === "browser"/);
assert.match(panelSource, /hasApiKey &&/);
assert.match(panelSource, /onClick=\{onRetry\}/);
assert.match(panelSource, /onClick=\{onAskAI\}/);

const english = getPopupCopy("en");
const vietnamese = getPopupCopy("vi");
const chinese = getPopupCopy("zh-CN");

assert.equal(english.translationTab, "Translation");
assert.equal(vietnamese.translationTab, "Bản dịch");
assert.equal(chinese.translationTab, "翻译");
assert.equal(english.originalText, "Original text");
assert.equal(vietnamese.originalText, "Văn bản gốc");
assert.equal(chinese.originalText, "原文");
assert.equal(english.translatedText, "Translation");
assert.equal(vietnamese.translatedText, "Bản dịch");
assert.equal(chinese.translatedText, "译文");
assert.equal(english.browserTranslationBadge, "Browser translation");
assert.equal(vietnamese.browserTranslationBadge, "Dịch bằng trình duyệt");
assert.equal(chinese.browserTranslationBadge, "浏览器翻译");
assert.equal(english.translationPreparing, "Preparing translation…");
assert.equal(vietnamese.translationPreparing, "Đang chuẩn bị bản dịch…");
assert.equal(chinese.translationPreparing, "正在准备翻译…");
assert.equal(english.translatorUnavailable, "Browser translation is unavailable for this language pair.");
assert.equal(vietnamese.translatorUnavailable, "Trình duyệt chưa hỗ trợ dịch cặp ngôn ngữ này.");
assert.equal(chinese.translatorUnavailable, "浏览器暂不支持这个语言组合。");
assert.equal(english.translationFailed, "Translation failed. Please try again.");
assert.equal(vietnamese.translationFailed, "Dịch thất bại. Vui lòng thử lại.");
assert.equal(chinese.translationFailed, "翻译失败，请重试。");
assert.equal(english.copyOriginal, "Copy original");
assert.equal(vietnamese.copyOriginal, "Sao chép văn bản gốc");
assert.equal(chinese.copyOriginal, "复制原文");
assert.equal(english.copyTranslation, "Copy translation");
assert.equal(vietnamese.copyTranslation, "Sao chép bản dịch");
assert.equal(chinese.copyTranslation, "复制译文");

console.log("PASS: adaptive translation popup UI contract is implemented.");
