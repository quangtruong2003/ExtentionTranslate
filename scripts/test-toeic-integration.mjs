import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contentSource, backgroundSource, manifest, settingsNav] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/navigation.ts", import.meta.url), "utf8"),
]);

// Content script handles SHOW_TOEIC_QUIZ and reports TOEIC_QUIZ_DONE
assert.match(contentSource, /SHOW_TOEIC_QUIZ/);
assert.match(contentSource, /showToeicQuiz/);
assert.match(contentSource, /hideToeicQuiz/);
assert.match(contentSource, /TOEIC_QUIZ_DONE/);

// Background initializes quiz controller and handles done
assert.match(backgroundSource, /initToeicQuizController/);
assert.match(backgroundSource, /handleToeicQuizDone/);
assert.match(backgroundSource, /TOEIC_QUIZ_DONE/);

// Manifest has required permissions
const manifestJson = JSON.parse(manifest);
assert.ok(manifestJson.permissions.includes("idle"));
assert.ok(manifestJson.permissions.includes("alarms"));

// Settings navigation includes toeic section
assert.match(settingsNav, /"toeic"/);
assert.match(settingsNav, /GraduationCap/);

console.log("PASS: toeic quiz integration wiring");
