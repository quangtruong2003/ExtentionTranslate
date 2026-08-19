import assert from "node:assert/strict";
import { gradeQuiz, getTotalTimeSeconds, SECONDS_PER_QUESTION } from "../src/content/toeic/quizState.ts";

assert.equal(SECONDS_PER_QUESTION, 30);
assert.equal(getTotalTimeSeconds(5), 150);
assert.equal(getTotalTimeSeconds(10), 300);

const questions = [
  { id: 1, text: "Q1", options: ["a","b","c","d"], correctIndex: 2, explanation: "E1", relatedKnowledge: "K1" },
  { id: 2, text: "Q2", options: ["a","b","c","d"], correctIndex: 0, explanation: "E2", relatedKnowledge: "K2" },
  { id: 3, text: "Q3", options: ["a","b","c","d"], correctIndex: 1, explanation: "E3", relatedKnowledge: "K3" },
];

// All answered
const results = gradeQuiz(questions, [2, 1, 1]);
assert.equal(results[0].correct, true);
assert.equal(results[1].correct, false);
assert.equal(results[2].correct, true);
assert.equal(results[0].selectedIndex, 2);
assert.equal(results[1].selectedIndex, 1);

// Unanswered (null) counts as incorrect
const withNull = gradeQuiz(questions, [2, null, null]);
assert.equal(withNull[0].correct, true);
assert.equal(withNull[1].correct, false);
assert.equal(withNull[1].selectedIndex, null);
assert.equal(withNull[2].correct, false);

// Shorter answers array treated as unanswered
const short = gradeQuiz(questions, [2]);
assert.equal(short[0].correct, true);
assert.equal(short[1].correct, false);
assert.equal(short[2].correct, false);

console.log("PASS: toeic quiz state helpers");
