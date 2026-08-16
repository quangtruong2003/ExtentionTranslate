import assert from "node:assert/strict";
import { runAIStreamOnPort } from "../src/background/streaming.ts";

const request = { word: "run", sentence: "They run every day.", targetLanguage: "vi" };
const events = [];
const port = { postMessage(event) { events.push(event); } };
let runnerRequest;

await runAIStreamOnPort(port, request, async (nextRequest, _signal, onChunk, onThinking) => {
  runnerRequest = nextRequest;
  onThinking("Check ");
  onThinking("context.");
  onChunk("Final ");
  onChunk("answer.");
  return { raw: "Final answer.", thinking: "Check context." };
});

assert.equal(runnerRequest.targetLanguage, undefined, "AI stream must not inject dictionary target language");
assert.deepEqual(events, [
  { type: "thinking", text: "Check " },
  { type: "thinking", text: "context." },
  { type: "chunk", text: "Final " },
  { type: "chunk", text: "answer." },
  { type: "done", raw: "Final answer.", thinking: "Check context." },
]);

const errorEvents = [];
await runAIStreamOnPort({ postMessage: (event) => errorEvents.push(event) }, request, async () => {
  throw Object.assign(new Error("bad key"), { code: "INVALID_API_KEY" });
});
assert.deepEqual(errorEvents, [{ type: "error", code: "INVALID_API_KEY" }]);

const partialErrorEvents = [];
await runAIStreamOnPort({ postMessage: (event) => partialErrorEvents.push(event) }, request, async (_request, _signal, onChunk) => {
  onChunk("Partial answer.");
  throw Object.assign(new Error("provider disconnected"), { code: "BAD_RESPONSE" });
});
assert.deepEqual(partialErrorEvents, [
  { type: "chunk", text: "Partial answer." },
  { type: "error", code: "BAD_RESPONSE" },
]);

console.log("PASS: background stream contract strips target language and orders port events.");
