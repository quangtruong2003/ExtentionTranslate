import assert from "node:assert/strict";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";

const english = getPopupCopy("en");
const vietnamese = getPopupCopy("vi");
const chinese = getPopupCopy("zh-CN");

assert.equal(english.dictionaryTab, "Dictionary");
assert.equal(vietnamese.dictionaryTab, "Từ điển");
assert.equal(chinese.dictionaryTab, "词典");
assert.equal(english.relatedPhrases, "Related phrases");
assert.equal(vietnamese.relatedPhrases, "Cụm từ liên quan");
assert.equal(chinese.relatedPhrases, "相关短语");
assert.equal(english.dialogLabel("run"), "Dictionary lookup for run");
assert.equal(vietnamese.dialogLabel("run"), "Tra từ run");
assert.equal(chinese.dialogLabel("run"), "查询 run");
assert.equal(english.translationDialogLabel("Hello world"), "Translation for Hello world");
assert.equal(vietnamese.translationDialogLabel("Xin chào"), "Bản dịch cho Xin chào");
assert.equal(chinese.translationDialogLabel("你好"), "翻译 你好");
assert.equal(english.aiThinking, "AI is thinking…");
assert.equal(vietnamese.aiThinking, "AI đang suy nghĩ…");
assert.equal(chinese.aiThinking, "AI 正在思考…");
assert.equal(english.generatingResponse, "Generating response…");
assert.equal(vietnamese.thinking, "Suy luận");
assert.equal(chinese.thinking, "思考过程");

console.log("PASS: popup labels follow English, Vietnamese, and Simplified Chinese settings.");
