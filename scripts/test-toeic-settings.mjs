import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings, TOEIC_QUIZ_INTERVAL, TOEIC_QUIZ_QUESTIONS } from "../src/shared/types.ts";

// Defaults
assert.equal(DEFAULT_SETTINGS.toeicQuizEnabled, false);
assert.equal(DEFAULT_SETTINGS.toeicQuizIntervalMinutes, 15);
assert.equal(DEFAULT_SETTINGS.toeicQuizQuestionCount, 5);

// normalizeSettings preserves valid values
const valid = normalizeSettings({ toeicQuizEnabled: true, toeicQuizIntervalMinutes: 30, toeicQuizQuestionCount: 10 });
assert.equal(valid.toeicQuizEnabled, true);
assert.equal(valid.toeicQuizIntervalMinutes, 30);
assert.equal(valid.toeicQuizQuestionCount, 10);

// normalizeSettings clamps out-of-range values
const clamped = normalizeSettings({ toeicQuizIntervalMinutes: 999, toeicQuizQuestionCount: 0 });
assert.equal(clamped.toeicQuizIntervalMinutes, TOEIC_QUIZ_INTERVAL.default);
assert.equal(clamped.toeicQuizQuestionCount, TOEIC_QUIZ_QUESTIONS.default);

// normalizeSettings handles missing values
const missing = normalizeSettings({});
assert.equal(missing.toeicQuizEnabled, false);
assert.equal(missing.toeicQuizIntervalMinutes, 15);
assert.equal(missing.toeicQuizQuestionCount, 5);

// toeicQuizEnabled only accepts boolean true
const notBool = normalizeSettings({ toeicQuizEnabled: "yes" });
assert.equal(notBool.toeicQuizEnabled, false);

console.log("PASS: toeic quiz settings normalization");
