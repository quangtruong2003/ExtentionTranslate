import assert from "node:assert/strict";
import {
  TOEIC_STATS_STORAGE_KEY,
  clearToeicStats,
  computeStreak,
  listToeicStats,
  recordToeicQuizOutcome,
  summarizeToeicStats,
  toDateKey,
} from "../src/services/toeic/stats.ts";

function createMemoryStorage() {
  const data = {};
  return {
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => { Object.assign(data, items); },
    _data: data,
  };
}

// toDateKey formats with zero padding.
assert.equal(toDateKey(new Date(2026, 0, 5)), "2026-01-05");
assert.equal(toDateKey(new Date(2026, 7, 20)), "2026-08-20");

const storage = createMemoryStorage();
assert.equal(TOEIC_STATS_STORAGE_KEY, "extention-translate:toeic-stats");
assert.deepEqual(await listToeicStats(storage), []);

// Recording accumulates into the same day.
const day = new Date(2026, 7, 20);
await recordToeicQuizOutcome(storage, { kind: "part5", correct: 3, total: 5 }, day);
await recordToeicQuizOutcome(storage, { kind: "listening", correct: 2, total: 4 }, day);
let days = await listToeicStats(storage);
assert.equal(days.length, 1);
assert.equal(days[0].date, "2026-08-20");
assert.equal(days[0].part5Correct, 3);
assert.equal(days[0].part5Total, 5);
assert.equal(days[0].listeningCorrect, 2);
assert.equal(days[0].listeningTotal, 4);

// A second day appends a new entry, sorted by date.
await recordToeicQuizOutcome(storage, { kind: "part5", correct: 5, total: 5 }, new Date(2026, 7, 21));
days = await listToeicStats(storage);
assert.equal(days.length, 2);
assert.deepEqual(days.map((d) => d.date), ["2026-08-20", "2026-08-21"]);

// Streaks: consecutive days ending today.
let streak = computeStreak(days, "2026-08-21");
assert.equal(streak.current, 2);
assert.equal(streak.best, 2);

// Streak ending yesterday still counts as current.
streak = computeStreak(days, "2026-08-22");
assert.equal(streak.current, 2);

// Gap breaks the current streak.
streak = computeStreak(days, "2026-08-24");
assert.equal(streak.current, 0);
assert.equal(streak.best, 2);

// Best streak across a gap.
const gapped = [
  { date: "2026-08-01", part5Correct: 1, part5Total: 1, listeningCorrect: 0, listeningTotal: 0 },
  { date: "2026-08-02", part5Correct: 1, part5Total: 1, listeningCorrect: 0, listeningTotal: 0 },
  { date: "2026-08-03", part5Correct: 1, part5Total: 1, listeningCorrect: 0, listeningTotal: 0 },
  { date: "2026-08-10", part5Correct: 1, part5Total: 1, listeningCorrect: 0, listeningTotal: 0 },
];
streak = computeStreak(gapped, "2026-08-10");
assert.equal(streak.best, 3);
assert.equal(streak.current, 1);

// Summary aggregates totals and accuracy.
const summary = summarizeToeicStats(days, "2026-08-21");
assert.equal(summary.totalAnswered, 14);
assert.equal(summary.totalCorrect, 10);
assert.ok(Math.abs(summary.accuracy - 10 / 14) < 1e-9);
assert.equal(summary.currentStreak, 2);

// Empty stats => null accuracy, zero streaks.
const empty = summarizeToeicStats([], "2026-08-20");
assert.equal(empty.accuracy, null);
assert.equal(empty.currentStreak, 0);
assert.equal(empty.bestStreak, 0);

// Corrupt entries are dropped on read.
storage._data[TOEIC_STATS_STORAGE_KEY] = [
  { date: "2026-08-20", part5Correct: 1, part5Total: 2, listeningCorrect: 0, listeningTotal: 0 },
  { date: "not-a-date" },
  null,
  { part5Total: 3 },
];
days = await listToeicStats(storage);
assert.equal(days.length, 1);
assert.equal(days[0].date, "2026-08-20");

await clearToeicStats(storage);
assert.deepEqual(await listToeicStats(storage), []);

console.log("PASS: toeic study stats and streaks");
