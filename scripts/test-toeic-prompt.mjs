import assert from "node:assert/strict";
import { buildToeicQuizPrompt } from "../src/services/toeic/prompt.ts";

const prompt = buildToeicQuizPrompt(5, "vi");
assert.match(prompt, /QUESTION_COUNT = 5/);
assert.match(prompt, /TOEIC Part 5/);
assert.match(prompt, /Vietnamese/);
assert.match(prompt, /"questions"/);
assert.match(prompt, /"correctIndex"/);
assert.match(prompt, /"explanation"/);
assert.match(prompt, /"relatedKnowledge"/);

const enPrompt = buildToeicQuizPrompt(10, "en");
assert.match(enPrompt, /QUESTION_COUNT = 10/);
assert.match(enPrompt, /English/);

const zhPrompt = buildToeicQuizPrompt(3, "zh-CN");
assert.match(zhPrompt, /QUESTION_COUNT = 3/);
assert.match(zhPrompt, /Simplified Chinese/);

console.log("PASS: toeic quiz prompt builder");
