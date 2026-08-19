import assert from "node:assert/strict";
import { parseToeicQuizResponse } from "../src/services/toeic/generator.ts";

// Valid response
const valid = parseToeicQuizResponse(JSON.stringify({
  questions: [
    { id: 1, text: "The team ______ the project.", options: ["complete", "completes", "completed", "completing"], correctIndex: 2, explanation: "Past tense needed.", relatedKnowledge: "Verb tenses." },
    { id: 2, text: "She is ______ than her peer.", options: ["more efficient", "most efficient", "efficient", "efficiency"], correctIndex: 0, explanation: "Comparative form.", relatedKnowledge: "Comparatives." },
  ],
}), 2);
assert.ok(valid);
assert.equal(valid.questions.length, 2);
assert.equal(valid.questions[0].correctIndex, 2);
assert.equal(valid.questions[0].options.length, 4);
assert.equal(valid.questions[0].id, 1);
assert.equal(valid.questions[1].id, 2);

// Wrong count
const wrongCount = parseToeicQuizResponse(JSON.stringify({
  questions: [{ id: 1, text: "Q", options: ["a","b","c","d"], correctIndex: 0, explanation: "E", relatedKnowledge: "K" }],
}), 3);
assert.equal(wrongCount, null);

// Invalid correctIndex
const badIndex = parseToeicQuizResponse(JSON.stringify({
  questions: [{ id: 1, text: "Q", options: ["a","b","c","d"], correctIndex: 5, explanation: "E", relatedKnowledge: "K" }],
}), 1);
assert.equal(badIndex, null);

// Missing text
const missingFields = parseToeicQuizResponse(JSON.stringify({
  questions: [{ id: 1, text: "", options: ["a","b","c","d"], correctIndex: 0, explanation: "E", relatedKnowledge: "K" }],
}), 1);
assert.equal(missingFields, null);

// Wrong option count
const badOptions = parseToeicQuizResponse(JSON.stringify({
  questions: [{ id: 1, text: "Q", options: ["a","b","c"], correctIndex: 0, explanation: "E", relatedKnowledge: "K" }],
}), 1);
assert.equal(badOptions, null);

// Code fence stripping
const fenced = parseToeicQuizResponse('```json\n{"questions":[{"id":1,"text":"Q","options":["a","b","c","d"],"correctIndex":0,"explanation":"E","relatedKnowledge":"K"}]}\n```', 1);
assert.ok(fenced);
assert.equal(fenced.questions.length, 1);

// Not JSON
const notJson = parseToeicQuizResponse("This is not JSON at all", 1);
assert.equal(notJson, null);

console.log("PASS: toeic quiz generator parsing");
