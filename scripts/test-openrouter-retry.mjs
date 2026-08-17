import assert from "node:assert/strict";
import { computeRetryDelayMs, fetchWithRetry } from "../src/shared/retry.ts";

// Delay: exponential with cap; Retry-After seconds win when larger.
assert.equal(computeRetryDelayMs(0), 500);
assert.equal(computeRetryDelayMs(1), 1000);
assert.equal(computeRetryDelayMs(2), 2000);
assert.equal(computeRetryDelayMs(10), 4000, "delay is capped");
assert.equal(computeRetryDelayMs(0, "3"), 3000, "Retry-After seconds honored");
assert.ok(computeRetryDelayMs(0, "Wed, 21 Oct 2026 07:28:00 GMT") <= 4000, "HTTP-date bounded by cap");

// Reject non-http(s) URLs and private/loopback hosts.
await assert.rejects(fetchWithRetry("ftp://openrouter.ai/api", {}), /http/);
await assert.rejects(fetchWithRetry("https://localhost/x", {}), /host/i);
await assert.rejects(fetchWithRetry("https://127.0.0.1/x", {}), /host/i);
await assert.rejects(fetchWithRetry("https://10.0.0.5/x", {}), /host/i);
await assert.rejects(fetchWithRetry("https://192.168.1.10/x", {}), /host/i);

// 429 retried, then success.
let calls = 0;
const fakeFetch = async () => {
  calls += 1;
  if (calls === 1) return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
  return new Response("ok", { status: 200 });
};
const ok = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", { method: "POST" }, { fetchImpl: fakeFetch, baseDelayMs: 1 });
assert.equal(ok.status, 200);
assert.equal(calls, 2);

// 5xx retried up to maxRetries, then last response returned.
calls = 0;
const alwaysFail = async () => { calls += 1; return new Response("boom", { status: 503 }); };
const failed = await fetchWithRetry("https://openrouter.ai/x", {}, { fetchImpl: alwaysFail, maxRetries: 2, baseDelayMs: 1 });
assert.equal(failed.status, 503);
assert.equal(calls, 3, "initial attempt + 2 retries");

// 4xx (non-429) is not retried.
calls = 0;
const unauthorized = async () => { calls += 1; return new Response("no", { status: 401 }); };
await fetchWithRetry("https://openrouter.ai/x", {}, { fetchImpl: unauthorized, baseDelayMs: 1 });
assert.equal(calls, 1);

// AbortSignal aborts between retries.
const controller = new AbortController();
calls = 0;
const rateLimitedForever = async () => {
  calls += 1;
  controller.abort();
  return new Response("rate limited", { status: 429 });
};
await assert.rejects(
  fetchWithRetry("https://openrouter.ai/x", { signal: controller.signal }, { fetchImpl: rateLimitedForever, baseDelayMs: 1 }),
);
assert.equal(calls, 1);

console.log("test-openrouter-retry: PASS");
