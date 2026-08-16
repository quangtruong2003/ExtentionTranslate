import assert from "node:assert/strict";
import { DictionaryRemoteRequestRegistry } from "../src/background/remoteRequestRegistry.ts";

const registry = new DictionaryRemoteRequestRegistry();
const first = new AbortController();
registry.set(7, first);
assert.equal(registry.cancel(7), true);
assert.equal(first.signal.aborted, true);
assert.equal(registry.cancel(7), false);

const second = new AbortController();
registry.set(8, second);
registry.finish(8, second);
assert.equal(registry.cancel(8), false);
assert.equal(second.signal.aborted, false);

const replacement = new AbortController();
registry.set(9, first);
registry.set(9, replacement);
registry.finish(9, first);
assert.equal(registry.cancel(9), true);
assert.equal(replacement.signal.aborted, true);

console.log("PASS: remote dictionary request registry cancels only the current request.");
