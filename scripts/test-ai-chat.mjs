import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOpenRouterMessages } from "../src/services/openrouter/messages.ts";

// Follow-up: history pairs are inserted between system and the lookup message,
// and the follow-up question is appended to the final user message.
const messages = buildOpenRouterMessages("SYSTEM", {
  word: "run",
  sentence: "I run daily.",
  history: [
    { role: "user", content: "run" },
    { role: "assistant", content: "To move quickly on foot." },
  ],
  followUpQuestion: "What is the past tense?",
});
assert.equal(messages[0].role, "system");
assert.equal(messages[0].content, "SYSTEM");
assert.equal(messages[1].role, "user");
assert.equal(messages[1].content, "run");
assert.equal(messages[2].role, "assistant");
assert.equal(messages[2].content, "To move quickly on foot.");
assert.equal(messages[3].role, "user");
assert.match(messages[3].content, /Selected text: run/);
assert.match(messages[3].content, /Follow-up question: What is the past tense\?/);

// Without history the shape is unchanged (system + one user message).
const plain = buildOpenRouterMessages("SYSTEM", { word: "run" });
assert.equal(plain.length, 2);
assert.doesNotMatch(plain[1].content, /Follow-up question/);

const [contentSource, sectionSource, copyModule] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/AISection.tsx", import.meta.url), "utf8"),
  import("../src/components/dictionary/copy.ts"),
]);
assert.match(contentSource, /aiMessages/);
assert.match(contentSource, /handleSendAIMessage/);
assert.match(sectionSource, /onSendMessage/);
for (const language of ["en", "vi", "zh-CN"]) {
  const copy = copyModule.getPopupCopy(language);
  assert.ok(copy.chatPlaceholder?.length > 0, `${language}: chatPlaceholder`);
  assert.ok(copy.chatSend?.length > 0, `${language}: chatSend`);
}

console.log("test-ai-chat: PASS");
