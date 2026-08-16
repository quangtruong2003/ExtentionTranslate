import assert from "node:assert/strict";
import { computePopupPosition, computeSelectionTriggerPosition, constrainPopupSize } from "../src/content/positioning.ts";

assert.deepEqual(
  constrainPopupSize({ width: 2400, height: 1400 }, { width: 1280, height: 800 }),
  { width: 560, height: 680 },
);
assert.deepEqual(
  constrainPopupSize({ width: 900, height: 900 }, { width: 360, height: 480 }),
  { width: 336, height: 456 },
);

const viewport = { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 };
const popup = { width: 300, height: 240 };

const right = computePopupPosition(
  { left: 300, right: 340, top: 200, bottom: 230 },
  popup,
  viewport,
);
assert.equal(right.placement, "right");
assert.equal(right.left, 352);
assert.equal(right.top, 200);

const left = computePopupPosition(
  { left: 1080, right: 1110, top: 200, bottom: 230 },
  popup,
  viewport,
);
assert.equal(left.placement, "left");
assert.equal(left.left, 768);

const narrow = computePopupPosition(
  { left: 390, right: 410, top: 300, bottom: 320 },
  { width: 500, height: 260 },
  { width: 800, height: 700, offsetLeft: 0, offsetTop: 0 },
);
assert.equal(narrow.placement, "below");
assert.equal(narrow.left, 288);

const above = computePopupPosition(
  { left: 390, right: 410, top: 620, bottom: 650 },
  { width: 500, height: 260 },
  { width: 800, height: 700, offsetLeft: 0, offsetTop: 0 },
);
assert.equal(above.placement, "above");
assert.equal(above.left, 288);

const offset = computePopupPosition(
  { left: 400, right: 430, top: 100, bottom: 130 },
  { width: 240, height: 180 },
  { width: 600, height: 500, offsetLeft: 120, offsetTop: 40 },
);
assert.equal(offset.placement, "right");
assert.equal(offset.left, 442);
assert.equal(offset.top, 100);

const triggerRight = computeSelectionTriggerPosition(
  { left: 100, right: 140, top: 200, bottom: 230, width: 40, height: 30 },
  { width: 36, height: 36 },
  viewport,
);
assert.equal(triggerRight.placement, "right");
assert.equal(triggerRight.left, 148);

const triggerLeft = computeSelectionTriggerPosition(
  { left: 1140, right: 1170, top: 200, bottom: 230, width: 30, height: 30 },
  { width: 36, height: 36 },
  viewport,
);
assert.equal(triggerLeft.placement, "left");
assert.equal(triggerLeft.left, 1096);

const triggerBelow = computeSelectionTriggerPosition(
  { left: 10, right: 790, top: 380, bottom: 410, width: 780, height: 30 },
  { width: 36, height: 36 },
  { width: 800, height: 500, offsetLeft: 0, offsetTop: 0 },
);
assert.equal(triggerBelow.placement, "below");
assert.equal(triggerBelow.left, 382);

const triggerAbove = computeSelectionTriggerPosition(
  { left: 10, right: 790, top: 460, bottom: 490, width: 780, height: 30 },
  { width: 36, height: 36 },
  { width: 800, height: 500, offsetLeft: 0, offsetTop: 0 },
);
assert.equal(triggerAbove.placement, "above");
assert.equal(triggerAbove.top, 416);

const triggerOffset = computeSelectionTriggerPosition(
  { left: 400, right: 430, top: 100, bottom: 130, width: 30, height: 30 },
  { width: 36, height: 36 },
  { width: 600, height: 500, offsetLeft: 120, offsetTop: 40 },
);
assert.equal(triggerOffset.placement, "right");
assert.equal(triggerOffset.left, 438);
assert.equal(triggerOffset.top, 97);

console.log("PASS: popup positioning chooses side placement and respects viewport offsets.");
