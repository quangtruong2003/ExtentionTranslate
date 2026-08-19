import assert from "node:assert/strict";
import { buildListeningQuiz } from "../src/services/toeic/listening.ts";

const records = [
  { word: "agenda", translation: "chương trình", lookedUpAt: 1, favorite: false },
  { word: "invoice", translation: "hóa đơn", lookedUpAt: 2, favorite: false },
  { word: "quota", translation: "chỉ tiêu", lookedUpAt: 3, favorite: false },
  { word: "vendor", translation: "nhà cung cấp", lookedUpAt: 4, favorite: false },
  { word: "bare", translation: undefined, lookedUpAt: 5, favorite: false },
];

// Basic shape: 4 options, correctIndex points at the target word.
const quiz = buildListeningQuiz(records, { questionCount: 3, seed: 9 });
assert.equal(quiz.length, 3);
for (const question of quiz) {
  assert.equal(question.options.length, 4);
  assert.ok(question.correctIndex >= 0 && question.correctIndex <= 3);
  assert.equal(question.options[question.correctIndex], question.word);
  assert.equal(new Set(question.options).size, 4, "no duplicate options");
}

// Deterministic per seed.
const quiz2 = buildListeningQuiz(records, { questionCount: 3, seed: 9 });
assert.deepEqual(quiz, quiz2);

// Question count capped by available words.
const capped = buildListeningQuiz(records, { questionCount: 50, seed: 1 });
assert.equal(capped.length, records.length);

// Fewer than 4 words: options shrink to what is available.
const tiny = buildListeningQuiz(
  [{ word: "solo", translation: "đơn", lookedUpAt: 1, favorite: false }],
  { questionCount: 1, seed: 1 },
);
assert.equal(tiny.length, 1);
assert.deepEqual(tiny[0].options, ["solo"]);
assert.equal(tiny[0].correctIndex, 0);

// Empty input.
assert.deepEqual(buildListeningQuiz([], { questionCount: 5, seed: 1 }), []);
assert.deepEqual(buildListeningQuiz(records, { questionCount: 0, seed: 1 }), []);

console.log("PASS: toeic listening quiz building");
