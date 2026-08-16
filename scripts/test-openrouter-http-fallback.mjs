import assert from "node:assert/strict";
import { fetchOpenRouterWithReasoningFallback } from "../src/services/openrouter/http.ts";

const requestBodies = [];
const responses = [
  new Response(JSON.stringify({ error: { message: "Invalid parameter: reasoning is not supported by this model." } }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  }),
  new Response("ok", { status: 200 }),
];
const fetchImpl = async (_input, init) => {
  requestBodies.push(JSON.parse(String(init?.body)));
  return responses.shift();
};

const response = await fetchOpenRouterWithReasoningFallback({
  url: "https://openrouter.ai/api/v1/chat/completions",
  headers: { Authorization: "Bearer test-key" },
  body: { model: "custom/reasoning-model", reasoning: { effort: "high" }, max_tokens: 8192 },
  fetchImpl,
});

assert.equal(response.status, 200);
assert.equal(requestBodies.length, 2);
assert.deepEqual(requestBodies[0].reasoning, { effort: "high" });
assert.equal("reasoning" in requestBodies[1], false);
assert.equal(requestBodies[1].max_tokens, 8192);

const noRetryBodies = [];
const noRetryResponse = await fetchOpenRouterWithReasoningFallback({
  url: "https://openrouter.ai/api/v1/chat/completions",
  headers: { Authorization: "Bearer test-key" },
  body: { model: "custom/model", reasoning: { effort: "high" }, max_tokens: 8192 },
  fetchImpl: async (_input, init) => {
    noRetryBodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ error: { message: "maximum context length exceeded" } }), { status: 400 });
  },
});
assert.equal(noRetryResponse.status, 400);
assert.equal(noRetryBodies.length, 1, "unrelated 400 responses must not trigger a reasoning retry");

console.log("PASS: OpenRouter retries once without rejected reasoning options.");
