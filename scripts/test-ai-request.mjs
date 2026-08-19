import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOpenRouterMessages } from "../src/services/openrouter/messages.ts";

// Single-shot lookup: system prompt plus one user message, no history.
const messages = buildOpenRouterMessages("SYSTEM", {
  word: "run",
  sentence: "I run daily.",
});
assert.equal(messages.length, 2);
assert.equal(messages[0].role, "system");
assert.equal(messages[0].content, "SYSTEM");
assert.equal(messages[1].role, "user");
assert.match(messages[1].content, /Selected text: run/);
assert.match(messages[1].content, /Sentence: I run daily\./);

// Without context the shape is unchanged (system + one user message).
const plain = buildOpenRouterMessages("SYSTEM", { word: "run" });
assert.equal(plain.length, 2);

const [contentSource, sectionSource] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/AISection.tsx", import.meta.url), "utf8"),
]);
assert.match(contentSource, /handleAskAI/);
assert.doesNotMatch(contentSource, /handleSendAIMessage/);
assert.doesNotMatch(contentSource, /aiMessages/);
assert.doesNotMatch(sectionSource, /onSendMessage/);
assert.doesNotMatch(sectionSource, /chatPlaceholder/);

console.log("test-ai-request: PASS");
