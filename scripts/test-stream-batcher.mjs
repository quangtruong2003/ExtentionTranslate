import assert from "node:assert/strict";
import { createStreamBatcher } from "../src/shared/streamBatcher.ts";

// Deterministic scheduler: callbacks run only when we tick().
let scheduled = [];
const schedule = (cb) => { scheduled.push(cb); return scheduled.length; };
const cancel = (id) => { scheduled[id - 1] = null; };
const tick = () => { const queue = scheduled; scheduled = []; queue.forEach((cb) => cb && cb()); };

const flushes = [];
const batcher = createStreamBatcher((pending) => flushes.push(pending), { scheduleFrame: schedule, cancelFrame: cancel });

batcher.appendText("Hello ");
batcher.appendText("world");
batcher.appendThinking("step 1 ");
assert.equal(flushes.length, 0, "no flush before the frame fires");

tick();
assert.deepEqual(flushes, [{ text: "Hello world", thinking: "step 1 " }]);

batcher.appendThinking("step 2");
batcher.flushNow();
assert.deepEqual(flushes[1], { text: "", thinking: "step 2" });
assert.equal(flushes.length, 2);

// dispose cancels any pending frame and prevents later flushes.
batcher.appendText("late");
batcher.dispose();
tick();
assert.equal(flushes.length, 2, "disposed batcher never flushes");

console.log("test-stream-batcher: PASS");
