import assert from "node:assert/strict";
import { raceDictionarySources, InflightDedupe } from "../src/shared/inflight.ts";

const primaryEntry = { word: "run", language: "en", meanings: [{ definition: "move fast" }], source: "free-api" };
const secondaryEntry = { word: "run", language: "en", meanings: [{ definition: "operate" }], source: "free-dictionary-api" };

// 1. Both succeed -> primary (dictionaryapi.dev) wins.
let winner = await raceDictionarySources({
  word: "run",
  fetchPrimary: async () => primaryEntry,
  fetchSecondary: async () => secondaryEntry,
});
assert.equal(winner.source, "free-api");

// 2. Primary fails -> secondary used.
winner = await raceDictionarySources({
  word: "run",
  fetchPrimary: async () => { throw new Error("NO_RESULT"); },
  fetchSecondary: async () => secondaryEntry,
});
assert.equal(winner.source, "free-dictionary-api");

// 3. Secondary fails -> primary used.
winner = await raceDictionarySources({
  word: "run",
  fetchPrimary: async () => primaryEntry,
  fetchSecondary: async () => { throw new Error("offline"); },
});
assert.equal(winner.source, "free-api");

// 4. Both fail -> primary's error is rethrown.
await assert.rejects(
  raceDictionarySources({
    word: "run",
    fetchPrimary: async () => { throw new Error("primary-error"); },
    fetchSecondary: async () => { throw new Error("secondary-error"); },
  }),
  /primary-error/,
);

// 5. Abort propagates immediately.
const controller = new AbortController();
controller.abort();
await assert.rejects(
  raceDictionarySources({
    word: "run",
    fetchPrimary: async () => primaryEntry,
    fetchSecondary: async () => secondaryEntry,
    signal: controller.signal,
  }),
);

// 6. InflightDedupe shares one run per key and clears after settle.
const dedupe = new InflightDedupe();
let runs = 0;
const factory = () => { runs += 1; return new Promise((resolve) => setTimeout(() => resolve("value"), 10)); };
const [a, b] = await Promise.all([dedupe.run("k", factory), dedupe.run("k", factory)]);
assert.equal(a, "value");
assert.equal(b, "value");
assert.equal(runs, 1);
await dedupe.run("k", factory);
assert.equal(runs, 2, "key is released after the first run settles");

// 7. InflightDedupe does not cache rejections.
let failures = 0;
const failing = () => { failures += 1; return Promise.reject(new Error("boom")); };
await assert.rejects(dedupe.run("bad", failing));
await assert.rejects(dedupe.run("bad", failing));
assert.equal(failures, 2);

console.log("test-dictionary-source-race: PASS");
