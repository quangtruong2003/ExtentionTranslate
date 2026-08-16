import assert from "node:assert/strict";
import { consumeOpenRouterSSE, consumeOpenRouterStream } from "../src/services/openrouter/sse.ts";
import { buildDictionaryTranslationMessages, buildOpenRouterMessages, buildOpenRouterStreamBody } from "../src/services/openrouter/messages.ts";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";
import { ERROR_CODES, mapOpenRouterErrorCode } from "../src/shared/errors.ts";

function streamFromText(text, chunkSize = text.length || 1) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < encoded.length; offset += chunkSize) {
        controller.enqueue(encoded.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
}

const promptMessages = buildOpenRouterMessages("Use only the configured system prompt.", {
  word: "run",
  sentence: "They run every day.",
  targetLanguage: "vi",
});
assert.equal(promptMessages[0].content, "Use only the configured system prompt.");
assert.match(promptMessages[1].content, /Selected text: run/);
assert.doesNotMatch(promptMessages[1].content, /Target language:/);
const thinkingBody = buildOpenRouterStreamBody("openrouter/auto", promptMessages, true);
assert.equal(thinkingBody.stream, true);
assert.equal(thinkingBody.max_tokens, 1600);
assert.equal("reasoning" in thinkingBody, false, "dynamic routers must omit reasoning options");
assert.equal("response_format" in thinkingBody, false);

const noThinkingBody = buildOpenRouterStreamBody("openrouter/auto", promptMessages, false);
assert.equal("reasoning" in noThinkingBody, false, "dynamic routers must omit reasoning options when disabled");
const freeRouterBody = buildOpenRouterStreamBody("openrouter/free", promptMessages, true, { reasoningEffort: "high" });
assert.equal("reasoning" in freeRouterBody, false, "free dynamic routers must omit reasoning options");
const mediumBody = buildOpenRouterStreamBody("openrouter/auto", promptMessages, true, { reasoningEffort: "medium", maxTokens: 2400 });
assert.equal(mediumBody.max_tokens, 2400);
assert.equal("reasoning" in mediumBody, false, "dynamic routers must omit selected effort");
const exactBudgetBody = buildOpenRouterStreamBody(
  "openrouter/auto",
  promptMessages,
  true,
  { reasoningEffort: "high", reasoningMaxTokens: 1200, maxTokens: 2400 },
);
assert.equal("reasoning" in exactBudgetBody, false, "dynamic routers must omit exact reasoning budgets");
const fixedReasoningBody = buildOpenRouterStreamBody("openai/o3-mini", promptMessages, true, {
  reasoningEffort: "high",
  maxTokens: 8192,
});
assert.deepEqual(fixedReasoningBody.reasoning, { effort: "high" });

const translationMessages = buildDictionaryTranslationMessages({ word: "run", meanings: [] }, "vi");
assert.match(translationMessages[0].content, /Vietnamese/);
assert.match(translationMessages[1].content, /"word":"run"/);

const first = consumeOpenRouterSSE(
  'data: {"choices":[{"delta":{"content":"xin "}}]}\n\ndata: {"choices":[{"delta":{"content":"chào"}}]}\n\n',
);
assert.deepEqual(first.events, [{ type: "chunk", text: "xin " }, { type: "chunk", text: "chào" }]);
assert.equal(first.remainder, "");

const split = consumeOpenRouterSSE('data: {"choices":[{"delta":{"content":"thế ');
assert.deepEqual(split.events, []);
assert.equal(split.remainder, 'data: {"choices":[{"delta":{"content":"thế ');

const second = consumeOpenRouterSSE(
  `${split.remainder}giới"}}]}\n\ndata: [DONE]\n\n`,
);
assert.deepEqual(second.events, [{ type: "chunk", text: "thế giới" }, { type: "done" }]);
assert.equal(second.remainder, "");

const truncated = consumeOpenRouterSSE(
  'data: {"choices":[{"delta":{"content":"partial answer"},"finish_reason":"length"}]}'
  + "\n\n",
);
assert.deepEqual(truncated.events, [
  { type: "chunk", text: "partial answer" },
  { type: "error", code: "TRUNCATED_RESPONSE", message: "OpenRouter response reached the token limit." },
]);
const truncatedChunks = [];
await assert.rejects(
  () => consumeOpenRouterStream(
    streamFromText('data: {"choices":[{"delta":{"content":"partial answer"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'),
    (text) => truncatedChunks.push(text),
  ),
  (error) => error?.code === "TRUNCATED_RESPONSE",
);
assert.deepEqual(truncatedChunks, ["partial answer"]);

const ignored = consumeOpenRouterSSE(
  'data: {"choices":[{"delta":{}}]}\n\ndata: {"choices":[]}\n\n',
);
assert.deepEqual(ignored.events, []);

const normalizedParts = consumeOpenRouterSSE(
  [
    'data: {"choices":[{"delta":{"content":[{"type":"text","text":"array "},{"type":"text","text":"parts"}]}}]}',
    'data: {"choices":[{"delta":{"content":{"type":"text","text":" object"}}}]}',
    'data: {"choices":[{"delta":{"text":" fallback"}}]}',
    'data: {"choices":[{"delta":{"output_text":[{"type":"text","text":" output"}]}}]}',
    "data: [DONE]",
    "",
  ].join("\n\n"),
);
assert.deepEqual(normalizedParts.events, [
  { type: "chunk", text: "array parts" },
  { type: "chunk", text: " object" },
  { type: "chunk", text: " fallback" },
  { type: "chunk", text: " output" },
  { type: "done" },
]);

const malformed = consumeOpenRouterSSE(
  'data: {not valid json}\n\ndata: {"choices":[{"delta":{"content":"kept"}}]}\n\n',
);
assert.deepEqual(malformed.events, [{ type: "chunk", text: "kept" }]);

const reasoning = consumeOpenRouterSSE(
  [
    'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"Check context. "}]}}]}',
    'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.summary","summary":"Context checked."}]}}]}',
    'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.encrypted","data":"secret"}],"reasoning":"Legacy duplicate"}}]}',
    'data: {"choices":[{"delta":{"reasoning_content":"Reasoning content. "}}]}',
    'data: {"choices":[{"delta":{"reasoning":"Legacy thought. "}}]}',
    'data: {"choices":[{"delta":{"content":"Final **answer**."}}]}',
    "data: [DONE]",
    "",
  ].join("\n\n"),
);
assert.deepEqual(reasoning.events, [
  { type: "thinking", text: "Check context. " },
  { type: "thinking", text: "Context checked." },
  { type: "thinking", text: "Legacy duplicate" },
  { type: "thinking", text: "Reasoning content. " },
  { type: "thinking", text: "Legacy thought. " },
  { type: "chunk", text: "Final **answer**." },
  { type: "done" },
]);

const tagged = consumeOpenRouterSSE(
  [
    'data: {"choices":[{"delta":{"content":"Answer before. "}}]}',
    'data: {"choices":[{"delta":{"content":"<think>Check the context. </think>Answer after."}}]}',
    'data: {"choices":[{"delta":{"content":" <thinking>One more check.</thinking> Done."}}]}',
    "data: [DONE]",
    "",
  ].join("\n\n"),
);
assert.deepEqual(tagged.events, [
  { type: "chunk", text: "Answer before. " },
  { type: "thinking", text: "Check the context. " },
  { type: "chunk", text: "Answer after." },
  { type: "chunk", text: " " },
  { type: "thinking", text: "One more check." },
  { type: "chunk", text: " Done." },
  { type: "done" },
]);

const eofMessageChunks = [];
const eofMessageResult = await consumeOpenRouterStream(
  streamFromText('data: {"choices":[{"message":{"content":[{"type":"text","text":"final "},{"type":"text","text":"message"}]}}]}'),
  (text) => eofMessageChunks.push(text),
);
assert.equal(eofMessageResult.raw, "final message");
assert.equal(eofMessageResult.sawDone, false);
assert.deepEqual(eofMessageChunks, ["final message"]);

const eofChoiceTextChunks = [];
const eofChoiceTextResult = await consumeOpenRouterStream(
  streamFromText('data: {"choices":[{"text":{"text":"choice text"}}]}'),
  (text) => eofChoiceTextChunks.push(text),
);
assert.equal(eofChoiceTextResult.raw, "choice text");
assert.equal(eofChoiceTextResult.sawDone, false);
assert.deepEqual(eofChoiceTextChunks, ["choice text"]);

const eofDeltaChunks = [];
const eofDeltaResult = await consumeOpenRouterStream(
  streamFromText('data: {"choices":[{"delta":{"content":"delta at EOF"}}]}', 11),
  (text) => eofDeltaChunks.push(text),
);
assert.equal(eofDeltaResult.raw, "delta at EOF");
assert.equal(eofDeltaResult.sawDone, false);
assert.deepEqual(eofDeltaChunks, ["delta at EOF"]);

const finalAnswerChunks = [];
const finalAnswerThinking = [];
const finalAnswerResult = await consumeOpenRouterStream(
  streamFromText([
    'data: {"choices":[{"delta":{"reasoning_content":"Private reasoning."}}]}',
    'data: {"choices":[{"message":{"content":"Public answer."}}]}',
  ].join("\n\n"), 13),
  (text) => finalAnswerChunks.push(text),
  (text) => finalAnswerThinking.push(text),
);
assert.equal(finalAnswerResult.raw, "Public answer.");
assert.equal(finalAnswerResult.thinking, "Private reasoning.");
assert.deepEqual(finalAnswerChunks, ["Public answer."]);
assert.deepEqual(finalAnswerThinking, ["Private reasoning."]);

const snapshotChunks = [];
const snapshotResult = await consumeOpenRouterStream(
  streamFromText([
    'data: {"choices":[{"delta":{"content":"Final answer."}}]}',
    'data: {"choices":[{"message":{"content":"Final answer."}}]}',
  ].join("\n\n"), 17),
  (text) => snapshotChunks.push(text),
);
assert.equal(snapshotResult.raw, "Final answer.");
assert.deepEqual(snapshotChunks, ["Final answer."]);

const extendingSnapshotChunks = [];
const extendingSnapshotResult = await consumeOpenRouterStream(
  streamFromText([
    'data: {"choices":[{"delta":{"content":"Final "}}]}',
    'data: {"choices":[{"message":{"content":"Final answer."}}]}',
  ].join("\n\n")),
  (text) => extendingSnapshotChunks.push(text),
);
assert.equal(extendingSnapshotResult.raw, "Final answer.");
assert.deepEqual(extendingSnapshotChunks, ["Final ", "answer."]);

const taggedSnapshotChunks = [];
const taggedSnapshotThinking = [];
const taggedSnapshotResult = await consumeOpenRouterStream(
  streamFromText([
    'data: {"choices":[{"delta":{"content":"<think>reason</think>Answer"}}]}',
    'data: {"choices":[{"message":{"content":"<think>reason</think>Answer"}}]}',
  ].join("\n\n"), 8),
  (text) => taggedSnapshotChunks.push(text),
  (text) => taggedSnapshotThinking.push(text),
);
assert.equal(taggedSnapshotResult.raw, "Answer");
assert.equal(taggedSnapshotResult.thinking, "reason");
assert.deepEqual(taggedSnapshotChunks, ["Answer"]);
assert.deepEqual(taggedSnapshotThinking, ["reason"]);

const extendingTaggedSnapshotChunks = [];
const extendingTaggedSnapshotThinking = [];
const extendingTaggedSnapshotResult = await consumeOpenRouterStream(
  streamFromText([
    'data: {"choices":[{"delta":{"content":"<think>reason</think>Answer"}}]}',
    'data: {"choices":[{"message":{"content":"<think>reason</think>Answer extended"}}]}',
  ].join("\n\n"), 10),
  (text) => extendingTaggedSnapshotChunks.push(text),
  (text) => extendingTaggedSnapshotThinking.push(text),
);
assert.equal(extendingTaggedSnapshotResult.raw, "Answer extended");
assert.equal(extendingTaggedSnapshotResult.thinking, "reason");
assert.deepEqual(extendingTaggedSnapshotChunks, ["Answer", " extended"]);
assert.deepEqual(extendingTaggedSnapshotThinking, ["reason"]);

const partialBeforeErrorChunks = [];
await assert.rejects(
  () => consumeOpenRouterStream(
    streamFromText([
      'data: {"choices":[{"delta":{"content":"Partial answer."}}]}',
      'data: {"error":{"code":502,"message":"Provider disconnected."}}',
    ].join("\n\n"), 9),
    (text) => partialBeforeErrorChunks.push(text),
  ),
  (error) => error?.code === "BAD_RESPONSE",
);
assert.deepEqual(partialBeforeErrorChunks, ["Partial answer."]);

const streamed = [];
const streamedThinking = [];
const encoded = new TextEncoder().encode(
  'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"nghĩ "}]}}]}\n\ndata: {"choices":[{"delta":{"content":"stream "}}]}\n\ndata: {"choices":[{"delta":{"content":"thật"}}]}\n\ndata: [DONE]\n\n',
);
const body = new ReadableStream({
  start(controller) {
    controller.enqueue(encoded.slice(0, 19));
    controller.enqueue(encoded.slice(19, 47));
    controller.enqueue(encoded.slice(47));
    controller.close();
  },
});
const streamedResult = await consumeOpenRouterStream(
  body,
  (text) => streamed.push(text),
  (text) => streamedThinking.push(text),
);
assert.equal(streamedResult.sawDone, true);
assert.equal(streamedResult.raw, "stream thật");
assert.equal(streamedResult.thinking, "nghĩ ");
assert.deepEqual(streamed, ["stream ", "thật"]);
assert.deepEqual(streamedThinking, ["nghĩ "]);

const splitTagStreamChunks = [];
const splitTagStreamThinking = [];
const splitTagStreamPayload = [
  'data: {"choices":[{"delta":{"content":"<thin"}}]}',
  'data: {"choices":[{"delta":{"content":"king>streamed reasoning"}}]}',
  'data: {"choices":[{"delta":{"content":"</think"}}]}',
  'data: {"choices":[{"delta":{"content":"ing>final answer"}}]}',
  "data: [DONE]",
  "",
].join("\n\n");
const splitTagStreamEncoded = new TextEncoder().encode(splitTagStreamPayload);
const splitTagBody = new ReadableStream({
  start(controller) {
    for (let offset = 0; offset < splitTagStreamEncoded.length; offset += 7) {
      controller.enqueue(splitTagStreamEncoded.slice(offset, offset + 7));
    }
    controller.close();
  },
});
const splitTagResult = await consumeOpenRouterStream(
  splitTagBody,
  (text) => splitTagStreamChunks.push(text),
  (text) => splitTagStreamThinking.push(text),
);
assert.equal(splitTagResult.sawDone, true);
assert.equal(splitTagResult.raw, "final answer");
assert.equal(splitTagResult.thinking, "streamed reasoning");
assert.deepEqual(splitTagStreamChunks, ["final answer"]);
assert.deepEqual(splitTagStreamThinking, ["streamed reasoning"]);

const thinkingOnlyChunks = [];
const thinkingOnlyStream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(
      'data: {"choices":[{"delta":{"reasoning_content":"Only reasoning, but still useful."}}]}\n\ndata: [DONE]\n\n',
    ));
    controller.close();
  },
});
await assert.rejects(
  () => consumeOpenRouterStream(thinkingOnlyStream, (text) => thinkingOnlyChunks.push(text)),
  (error) => error?.code === "EMPTY_RESPONSE",
);
assert.deepEqual(thinkingOnlyChunks, []);

const emptyStream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
  },
});
await assert.rejects(
  () => consumeOpenRouterStream(emptyStream, () => undefined),
  (error) => error?.code === "EMPTY_RESPONSE",
);

function streamBody(payload) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`));
      controller.close();
    },
  });
}

await assert.rejects(
  () => consumeOpenRouterStream(
    streamBody({ error: { code: 502, message: "Provider disconnected before producing a response." } }),
    () => undefined,
  ),
  (error) => error?.code === "BAD_RESPONSE" && error?.retryable === true,
);

await assert.rejects(
  () => consumeOpenRouterStream(
    streamBody({ error: { code: 429, message: "Rate limit exceeded." } }),
    () => undefined,
  ),
  (error) => error?.code === "RATE_LIMITED" && error?.retryable === true,
);

await assert.rejects(
  () => consumeOpenRouterStream(
    streamBody({ choices: [{ finish_reason: "error" }] }),
    () => undefined,
  ),
  (error) => error?.code === "BAD_RESPONSE",
);

assert.equal(getPopupCopy("en").errorMessage("EMPTY_RESPONSE"), "The AI returned an empty response. Please try again.");
assert.equal(getPopupCopy("vi").errorMessage("EMPTY_RESPONSE"), "AI trả về phản hồi trống. Vui lòng thử lại.");
assert.equal(getPopupCopy("zh-CN").errorMessage("EMPTY_RESPONSE"), "AI 返回了空响应，请重试。");
assert.equal(getPopupCopy("vi").errorMessage("TRUNCATED_RESPONSE"), "Phản hồi AI bị cắt do giới hạn token. Vui lòng thử lại.");
assert.equal(mapOpenRouterErrorCode("max_tokens_exceeded", ""), ERROR_CODES.TRUNCATED_RESPONSE);

console.log("PASS: OpenRouter SSE parser keeps answer and readable thinking streams separate.");
