import assert from "node:assert/strict";
import { TOEIC_WORD_LIST, getTodayWord, pickWordOfDay } from "../src/services/toeic/wordOfDay.ts";

// The curated list is non-trivial and well-formed.
assert.ok(TOEIC_WORD_LIST.length >= 50, "enough words for daily rotation");
for (const item of TOEIC_WORD_LIST) {
  assert.ok(item.word.trim(), "word present");
  assert.ok(item.partOfSpeech.trim(), "part of speech present");
  assert.ok(item.definition.trim(), "definition present");
  assert.ok(item.example.trim(), "example present");
  assert.ok(item.translationVi.trim(), "Vietnamese translation present");
  assert.ok(item.translationZh.trim(), "Chinese translation present");
}
const words = TOEIC_WORD_LIST.map((item) => item.word.toLowerCase());
assert.equal(new Set(words).size, words.length, "no duplicate words");

// Deterministic per date key.
const first = pickWordOfDay("2026-08-20");
const again = pickWordOfDay("2026-08-20");
assert.ok(first);
assert.deepEqual(first, again);

// Different days rotate to different words (over a full cycle every word appears).
const seen = new Set();
for (let i = 0; i < TOEIC_WORD_LIST.length; i += 1) {
  const date = new Date(2026, 0, 1 + i);
  const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
  const pick = pickWordOfDay(key);
  assert.ok(pick);
  seen.add(pick.word);
}
assert.equal(seen.size, TOEIC_WORD_LIST.length, "full cycle covers every word exactly once");

// Invalid date key returns null.
assert.equal(pickWordOfDay("not-a-date"), null);
assert.equal(pickWordOfDay("2026-08-20", []), null);

// getTodayWord returns a valid entry.
const today = getTodayWord(new Date(2026, 7, 20));
assert.ok(today);
assert.ok(TOEIC_WORD_LIST.includes(today));

console.log("PASS: toeic word of the day");
