# TOEIC Part 5 Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in TOEIC Part 5 quiz that triggers after accumulated active browsing time, shows a full-screen non-dismissible overlay with AI-generated questions, and forces the user to read explanations before closing.

**Architecture:** Background service worker accumulates active time via `chrome.alarms` + `chrome.idle`, prefetches questions from OpenRouter at 80% threshold, and sends a message to the content script at 100%. The content script renders a full-screen Shadow DOM overlay with a stepper UI and results list. Settings are stored in `chrome.storage.local` alongside existing extension settings.

**Tech Stack:** React 18, TypeScript, Chrome Extension MV3 (alarms, idle, storage), OpenRouter API, Tailwind CSS, existing Shadow DOM infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-20-toeic-quiz-design.md`

## Global Constraints

- Time per question is fixed at 30 seconds (not configurable).
- Total quiz time = `questionCount × 30`.
- Questions are generated in a single non-streaming OpenRouter call with `response_format: { type: "json_object" }`.
- Thinking/reasoning is disabled for quiz generation calls.
- Explanations and related knowledge are written in the user's `targetLanguage`.
- The overlay blocks all page interaction (scroll, click) while active.
- The "Close" button only appears after the user scrolls to the bottom of results.
- Timer resets after quiz completion or timeout.
- `chrome.storage.session` holds accumulated time (auto-clears on browser close).
- Manifest permissions: add `"idle"` and `"alarms"`.
- All UI strings must support vi, en, zh-CN.
- Follow existing code patterns: `ExtensionError` for errors, `extractFirstJSONObject` for JSON parsing, `normalizeSettings` for settings validation.

---

### Task 1: Settings types and normalization

**Files:**
- Modify: `src/shared/types.ts`
- Test: `scripts/test-toeic-settings.mjs`

**Interfaces:**
- Consumes: existing `ExtensionSettings`, `DEFAULT_SETTINGS`, `normalizeSettings`, `isIntegerInRange`
- Produces: `toeicQuizEnabled: boolean`, `toeicQuizIntervalMinutes: number`, `toeicQuizQuestionCount: number` on `ExtensionSettings`; constants `TOEIC_QUIZ_INTERVAL` and `TOEIC_QUIZ_QUESTIONS` with min/max/default

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/test-toeic-settings.mjs
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

console.log("PASS: toeic quiz settings normalization");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-toeic-settings.mjs`
Expected: FAIL — `TOEIC_QUIZ_INTERVAL` is not exported

- [ ] **Step 3: Implement settings fields**

In `src/shared/types.ts`:

Add constants after existing `OPENROUTER_REASONING_MAX_TOKENS`:
```typescript
export const TOEIC_QUIZ_INTERVAL = { min: 5, max: 120, default: 15 } as const;
export const TOEIC_QUIZ_QUESTIONS = { min: 3, max: 20, default: 5 } as const;
```

Add to `ExtensionSettings` interface:
```typescript
  toeicQuizEnabled: boolean;
  toeicQuizIntervalMinutes: number;
  toeicQuizQuestionCount: number;
```

Add to `DEFAULT_SETTINGS`:
```typescript
  toeicQuizEnabled: false,
  toeicQuizIntervalMinutes: TOEIC_QUIZ_INTERVAL.default,
  toeicQuizQuestionCount: TOEIC_QUIZ_QUESTIONS.default,
```

In `normalizeSettings`, add before the return statement:
```typescript
  const toeicQuizIntervalMinutes = isIntegerInRange(raw.toeicQuizIntervalMinutes, TOEIC_QUIZ_INTERVAL.min, TOEIC_QUIZ_INTERVAL.max)
    ? raw.toeicQuizIntervalMinutes
    : TOEIC_QUIZ_INTERVAL.default;
  const toeicQuizQuestionCount = isIntegerInRange(raw.toeicQuizQuestionCount, TOEIC_QUIZ_QUESTIONS.min, TOEIC_QUIZ_QUESTIONS.max)
    ? raw.toeicQuizQuestionCount
    : TOEIC_QUIZ_QUESTIONS.default;
```

And include in the returned object:
```typescript
    toeicQuizEnabled: raw.toeicQuizEnabled === true,
    toeicQuizIntervalMinutes,
    toeicQuizQuestionCount,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-toeic-settings.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts scripts/test-toeic-settings.mjs
git commit -m "feat: add TOEIC quiz settings fields and normalization"
```

---

### Task 2: Quiz types and prompt builder

**Files:**
- Create: `src/services/toeic/types.ts`
- Create: `src/services/toeic/prompt.ts`
- Test: `scripts/test-toeic-prompt.mjs`

**Interfaces:**
- Consumes: `TargetLanguage` from `@/shared/types`
- Produces: `ToeicQuestion`, `ToeicQuizPayload`, `buildToeicQuizPrompt(count, language)`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/test-toeic-prompt.mjs
import assert from "node:assert/strict";
import { buildToeicQuizPrompt } from "../src/services/toeic/prompt.ts";

const prompt = buildToeicQuizPrompt(5, "vi");
assert.match(prompt, /QUESTION_COUNT = 5/);
assert.match(prompt, /TOEIC Part 5/);
assert.match(prompt, /Vietnamese/);
assert.match(prompt, /"questions"/);
assert.match(prompt, /"correctIndex"/);
assert.match(prompt, /"explanation"/);
assert.match(prompt, /"relatedKnowledge"/);

const enPrompt = buildToeicQuizPrompt(10, "en");
assert.match(enPrompt, /QUESTION_COUNT = 10/);
assert.match(enPrompt, /English/);

const zhPrompt = buildToeicQuizPrompt(3, "zh-CN");
assert.match(zhPrompt, /QUESTION_COUNT = 3/);
assert.match(zhPrompt, /Simplified Chinese/);

console.log("PASS: toeic quiz prompt builder");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-toeic-prompt.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement types and prompt**

Create `src/services/toeic/types.ts`:
```typescript
export interface ToeicQuestion {
  id: number;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  relatedKnowledge: string;
}

export interface ToeicQuizPayload {
  questions: ToeicQuestion[];
}
```

Create `src/services/toeic/prompt.ts`:
```typescript
import type { TargetLanguage } from "@/shared/types";

const LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  en: "English",
  vi: "Vietnamese",
  "zh-CN": "Simplified Chinese",
};

export function buildToeicQuizPrompt(count: number, language: TargetLanguage): string {
  const langLabel = LANGUAGE_LABELS[language] ?? "English";
  return `You are a **TOEIC Part 5 Question Generator**, specializing in creating practice questions in the style of the **current ETS TOEIC Listening & Reading** exam.

## Configuration

\`QUESTION_COUNT = ${count}\`

Generate exactly **${count} TOEIC Part 5 — Incomplete Sentences** questions.

## Requirements

Each question must:
* Have **1 blank** represented as \`______\`.
* Have exactly **4 options A/B/C/D**.
* Have exactly **1 clearly correct answer**.
* Be natural, grammatically correct, and set in realistic TOEIC contexts: companies, HR, recruitment, meetings, emails, customers, contracts, schedules, shipping, marketing, finance, office, events, services...
* Not copy verbatim from ETS questions or copyrighted test materials.
* Not create ambiguous questions where 2 answers could both be valid.

## Question type distribution

Mix diverse common types:
* Word form
* Vocabulary
* Collocation
* Preposition
* Conjunction
* Verb tense / Verb form
* Active / Passive
* Pronoun / Determiner
* Relative clause
* Gerund / Infinitive
* Participles
* Sentence structure / Grammar

Do not create too many consecutive questions of the same type.

## Difficulty

Create a mix:
* **30% easy**
* **50% medium**
* **20% hard**

Hard questions must be hard due to **context, structure, collocation, or good distractors**, not obscure vocabulary.

## Distractors

Wrong answers must be **plausibly misleading**, for example:
* Same word family: \`success / successful / successfully / succeed\`
* Near-synonyms with different usage
* Different preposition/collocation
* Different verb form
* Conjunction vs preposition
* Adjective vs participle
* Correct meaning but wrong structure

Avoid obviously wrong distractors that can be eliminated without thinking.

## Output format

Return **strict JSON** matching this exact schema:

\`\`\`json
{
  "questions": [
    {
      "id": 1,
      "text": "The company plans to ______ its operations in Southeast Asia next year.",
      "options": ["expansion", "expansive", "expand", "expanded"],
      "correctIndex": 2,
      "explanation": "After 'plans to', a base verb is needed. 'expand' is the correct verb form.",
      "relatedKnowledge": "Structure: plan to + V-inf. Related: expansion (noun), expansive (adjective), successfully (adverb)."
    }
  ]
}
\`\`\`

Rules:
* \`correctIndex\` is 0-based (0=A, 1=B, 2=C, 3=D).
* \`explanation\` and \`relatedKnowledge\` must be written in **${langLabel}**.
* Return ONLY the JSON object. No markdown fences, no extra text.
* The \`questions\` array must contain exactly ${count} items.

Before outputting, silently verify each question:
1. Is there exactly one correct answer?
2. Is the answer correct in **grammar + meaning + collocation**?
3. Are the distractors plausible?
4. Is the sentence natural for a workplace English context?
5. Is there structural/collocation overlap with previous questions?
6. Does the total count equal exactly ${count}?

Prioritize **quality and resemblance to real TOEIC questions** over complexity.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-toeic-prompt.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/toeic/types.ts src/services/toeic/prompt.ts scripts/test-toeic-prompt.mjs
git commit -m "feat: add TOEIC quiz types and prompt builder"
```

---

### Task 3: Quiz generator (OpenRouter call + parse/validate)

**Files:**
- Create: `src/services/toeic/generator.ts`
- Test: `scripts/test-toeic-generator.mjs`

**Interfaces:**
- Consumes: `ToeicQuestion`, `ToeicQuizPayload` from `./types`; `buildToeicQuizPrompt` from `./prompt`; `extractFirstJSONObject` from `@/shared/utils`; `OPENROUTER_ENDPOINT` from `@/shared/constants`; `ExtensionError` from `@/shared/errors`
- Produces: `generateToeicQuiz(config): Promise<ToeicQuizPayload>`, `parseToeicQuizResponse(raw, expectedCount): ToeicQuizPayload | null`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/test-toeic-generator.mjs
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

// Missing fields
const missingFields = parseToeicQuizResponse(JSON.stringify({
  questions: [{ id: 1, text: "", options: ["a","b","c","d"], correctIndex: 0, explanation: "E", relatedKnowledge: "K" }],
}), 1);
assert.equal(missingFields, null);

// Code fence stripping
const fenced = parseToeicQuizResponse('```json\n{"questions":[{"id":1,"text":"Q","options":["a","b","c","d"],"correctIndex":0,"explanation":"E","relatedKnowledge":"K"}]}\n```', 1);
assert.ok(fenced);
assert.equal(fenced.questions.length, 1);

// Not JSON
const notJson = parseToeicQuizResponse("This is not JSON at all", 1);
assert.equal(notJson, null);

console.log("PASS: toeic quiz generator parsing");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-toeic-generator.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement generator**

Create `src/services/toeic/generator.ts`:
```typescript
import { OPENROUTER_ENDPOINT } from "@/shared/constants";
import { ExtensionError, ERROR_CODES } from "@/shared/errors";
import { extractFirstJSONObject } from "@/shared/utils";
import type { TargetLanguage } from "@/shared/types";
import { buildToeicQuizPrompt } from "./prompt";
import type { ToeicQuestion, ToeicQuizPayload } from "./types";

export interface ToeicQuizConfig {
  apiKey: string;
  model: string;
  questionCount: number;
  targetLanguage: TargetLanguage;
  signal?: AbortSignal;
}

export function parseToeicQuizResponse(raw: string, expectedCount: number): ToeicQuizPayload | null {
  const parsed = extractFirstJSONObject<{ questions?: unknown }>(raw);
  if (!parsed || !Array.isArray(parsed.questions)) return null;
  if (parsed.questions.length !== expectedCount) return null;

  const questions: ToeicQuestion[] = [];
  for (let i = 0; i < parsed.questions.length; i++) {
    const item = parsed.questions[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") return null;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) return null;
    if (!Array.isArray(item.options) || item.options.length !== 4) return null;
    const options = item.options.map((o) => (typeof o === "string" ? o.trim() : ""));
    if (options.some((o) => !o)) return null;
    const correctIndex = typeof item.correctIndex === "number" ? item.correctIndex : -1;
    if (correctIndex < 0 || correctIndex > 3) return null;
    const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
    if (!explanation) return null;
    const relatedKnowledge = typeof item.relatedKnowledge === "string" ? item.relatedKnowledge.trim() : "";
    if (!relatedKnowledge) return null;
    questions.push({
      id: i + 1,
      text,
      options: options as [string, string, string, string],
      correctIndex,
      explanation,
      relatedKnowledge,
    });
  }
  return { questions };
}

export async function generateToeicQuiz(config: ToeicQuizConfig): Promise<ToeicQuizPayload> {
  if (!config.apiKey) throw new ExtensionError(ERROR_CODES.MISSING_API_KEY, "", false);
  if (!config.model) throw new ExtensionError(ERROR_CODES.UNKNOWN_MODEL, "", false);

  const systemPrompt = buildToeicQuizPrompt(config.questionCount, config.targetLanguage);
  const body = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate ${config.questionCount} TOEIC Part 5 questions now.` },
    ],
    temperature: 0.7,
    max_tokens: Math.max(2000, config.questionCount * 500),
    response_format: { type: "json_object" },
  };

  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: config.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://extention-translate.local",
        "X-Title": "ExtentionTranslate",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }

  if (response.status === 401) throw new ExtensionError(ERROR_CODES.INVALID_API_KEY, "", false);
  if (response.status === 429) throw new ExtensionError(ERROR_CODES.RATE_LIMITED, "", true);
  if (!response.ok) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, `HTTP ${response.status}`, true);

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (json.error?.message) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, json.error.message, true);

  const content = json.choices?.[0]?.message?.content ?? "";
  const result = parseToeicQuizResponse(content, config.questionCount);
  if (!result) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "Invalid quiz JSON", true);
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-toeic-generator.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/toeic/generator.ts scripts/test-toeic-generator.mjs
git commit -m "feat: add TOEIC quiz generator with parse and validation"
```

---

### Task 4: Quiz state helpers (grading, timeout)

**Files:**
- Create: `src/content/toeic/quizState.ts`
- Test: `scripts/test-toeic-quiz-state.mjs`

**Interfaces:**
- Consumes: `ToeicQuestion` from `@/services/toeic/types`
- Produces: `gradeQuiz(questions, answers): QuizResult[]`, `getTotalTimeSeconds(questionCount): number`, `type QuizResult`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/test-toeic-quiz-state.mjs
import assert from "node:assert/strict";
import { gradeQuiz, getTotalTimeSeconds } from "../src/content/toeic/quizState.ts";

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

// Unanswered (null)
const withNull = gradeQuiz(questions, [2, null, null]);
assert.equal(withNull[0].correct, true);
assert.equal(withNull[1].correct, false);
assert.equal(withNull[1].selectedIndex, null);
assert.equal(withNull[2].correct, false);

console.log("PASS: toeic quiz state helpers");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-toeic-quiz-state.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement quiz state**

Create `src/content/toeic/quizState.ts`:
```typescript
import type { ToeicQuestion } from "@/services/toeic/types";

export const SECONDS_PER_QUESTION = 30;

export interface QuizResult {
  question: ToeicQuestion;
  selectedIndex: number | null;
  correct: boolean;
}

export function getTotalTimeSeconds(questionCount: number): number {
  return questionCount * SECONDS_PER_QUESTION;
}

export function gradeQuiz(questions: ToeicQuestion[], answers: Array<number | null>): QuizResult[] {
  return questions.map((question, i) => {
    const selectedIndex = answers[i] ?? null;
    return {
      question,
      selectedIndex,
      correct: selectedIndex === question.correctIndex,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-toeic-quiz-state.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/toeic/quizState.ts scripts/test-toeic-quiz-state.mjs
git commit -m "feat: add TOEIC quiz grading and timeout helpers"
```

---

### Task 5: Message types and constants

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Consumes: existing `MESSAGE_TYPES`
- Produces: `MESSAGE_TYPES.SHOW_TOEIC_QUIZ`, `MESSAGE_TYPES.TOEIC_QUIZ_DONE`, `ToeicQuizMessage` type

- [ ] **Step 1: Add message types to constants**

In `src/shared/constants.ts`, add to `MESSAGE_TYPES`:
```typescript
  SHOW_TOEIC_QUIZ: "SHOW_TOEIC_QUIZ",
  TOEIC_QUIZ_DONE: "TOEIC_QUIZ_DONE",
```

- [ ] **Step 2: Add quiz message type to types.ts**

In `src/shared/types.ts`, add after `AIResponse`:
```typescript
export interface ToeicQuizMessage {
  type: "SHOW_TOEIC_QUIZ";
  payload: import("@/services/toeic/types").ToeicQuizPayload;
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/constants.ts src/shared/types.ts
git commit -m "feat: add TOEIC quiz message types"
```

---

### Task 6: Background quiz controller

**Files:**
- Create: `src/background/toeicQuiz.ts`
- Modify: `src/background/index.ts`
- Modify: `public/manifest.json`

**Interfaces:**
- Consumes: `getSettings` from `@/services/storage/settings`; `generateToeicQuiz` from `@/services/toeic/generator`; `MESSAGE_TYPES` from `@/shared/constants`; `ToeicQuizPayload` from `@/services/toeic/types`
- Produces: `initToeicQuizController()` called from background/index.ts

- [ ] **Step 1: Add manifest permissions**

In `public/manifest.json`, add `"idle"` and `"alarms"` to the `permissions` array:
```json
"permissions": [
  "storage",
  "contextMenus",
  "idle",
  "alarms"
],
```

- [ ] **Step 2: Implement background controller**

Create `src/background/toeicQuiz.ts`:
```typescript
import { MESSAGE_TYPES } from "@/shared/constants";
import { getSettings } from "@/services/storage/settings";
import { generateToeicQuiz } from "@/services/toeic/generator";
import type { ToeicQuizPayload } from "@/services/toeic/types";

const ALARM_NAME = "toeic-quiz-timer";
const SESSION_KEY = "toeic-quiz-accumulated-minutes";

let cachedQuiz: ToeicQuizPayload | null = null;
let prefetchStarted = false;
let quizActive = false;

async function getAccumulatedMinutes(): Promise<number> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as number) ?? 0;
}

async function setAccumulatedMinutes(minutes: number): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: minutes });
}

async function resetTimer(): Promise<void> {
  cachedQuiz = null;
  prefetchStarted = false;
  quizActive = false;
  await setAccumulatedMinutes(0);
}

async function handleAlarmTick(): Promise<void> {
  const settings = await getSettings();
  if (!settings.toeicQuizEnabled || !settings.openRouterApiKey) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  if (quizActive) return;

  const state = await chrome.idle.queryState(60);
  if (state !== "active") return;

  const accumulated = await getAccumulatedMinutes();
  const next = accumulated + 1;
  await setAccumulatedMinutes(next);

  const interval = settings.toeicQuizIntervalMinutes;
  const prefetchThreshold = Math.floor(interval * 0.8);

  // Prefetch at 80%
  if (next >= prefetchThreshold && !cachedQuiz && !prefetchStarted) {
    prefetchStarted = true;
    generateToeicQuiz({
      apiKey: settings.openRouterApiKey,
      model: settings.openRouterModel,
      questionCount: settings.toeicQuizQuestionCount,
      targetLanguage: settings.targetLanguage,
    })
      .then((quiz) => { cachedQuiz = quiz; })
      .catch(() => { prefetchStarted = false; });
  }

  // Trigger at 100%
  if (next >= interval) {
    await triggerQuiz(settings.toeicQuizQuestionCount, settings.targetLanguage, settings.openRouterApiKey, settings.openRouterModel);
  }
}

async function triggerQuiz(
  questionCount: number,
  targetLanguage: "en" | "vi" | "zh-CN",
  apiKey: string,
  model: string,
): Promise<void> {
  let quiz = cachedQuiz;
  if (!quiz) {
    try {
      quiz = await generateToeicQuiz({ apiKey, model, questionCount, targetLanguage });
    } catch {
      await resetTimer();
      return;
    }
  }

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url || /^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url)) {
    // Can't inject on this page; wait for next tick.
    return;
  }

  quizActive = true;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.SHOW_TOEIC_QUIZ,
      payload: quiz,
    });
  } catch {
    // Content script not available; reset and retry next cycle.
    quizActive = false;
    await resetTimer();
  }
}

export function initToeicQuizController(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    void handleAlarmTick();
  });

  // Start or stop the alarm based on settings changes.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    void (async () => {
      const settings = await getSettings();
      if (settings.toeicQuizEnabled && settings.openRouterApiKey) {
        const existing = await chrome.alarms.get(ALARM_NAME);
        if (!existing) {
          await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        }
      } else {
        await chrome.alarms.clear(ALARM_NAME);
        await resetTimer();
      }
    })();
  });

  // Initialize alarm state on service worker startup.
  void (async () => {
    const settings = await getSettings();
    if (settings.toeicQuizEnabled && settings.openRouterApiKey) {
      const existing = await chrome.alarms.get(ALARM_NAME);
      if (!existing) {
        await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
      }
    }
  })();
}

export function handleToeicQuizDone(): void {
  void resetTimer();
  // Restart the alarm for the next cycle.
  void (async () => {
    const settings = await getSettings();
    if (settings.toeicQuizEnabled && settings.openRouterApiKey) {
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    }
  })();
}
```

- [ ] **Step 3: Wire into background/index.ts**

At the top of `src/background/index.ts`, add import:
```typescript
import { initToeicQuizController, handleToeicQuizDone } from "./toeicQuiz";
```

At the bottom (before `export {}`), add:
```typescript
initToeicQuizController();
```

Inside the `chrome.runtime.onMessage.addListener` handler, add before the final `return false`:
```typescript
  if (type === MESSAGE_TYPES.TOEIC_QUIZ_DONE) {
    handleToeicQuizDone();
    sendResponse({ ok: true });
    return false;
  }
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add public/manifest.json src/background/toeicQuiz.ts src/background/index.ts
git commit -m "feat: add background TOEIC quiz controller with alarm and idle tracking"
```

---

### Task 7: Quiz overlay React component

**Files:**
- Create: `src/content/toeic/QuizOverlay.tsx`
- Create: `src/content/toeic/index.ts`
- Modify: `src/content/index.tsx`

**Interfaces:**
- Consumes: `ToeicQuizPayload` from `@/services/toeic/types`; `gradeQuiz`, `getTotalTimeSeconds`, `QuizResult` from `./quizState`; `getPopupCopy` from `@/components/dictionary/copy`; `TargetLanguage` from `@/shared/types`
- Produces: `showToeicQuiz(payload, targetLanguage, onDone)` mounts the overlay; `hideToeicQuiz()` removes it

- [ ] **Step 1: Implement QuizOverlay component**

Create `src/content/toeic/QuizOverlay.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import type { ToeicQuizPayload } from "@/services/toeic/types";
import type { TargetLanguage } from "@/shared/types";
import { gradeQuiz, getTotalTimeSeconds, type QuizResult } from "./quizState";

interface QuizOverlayProps {
  payload: ToeicQuizPayload;
  targetLanguage: TargetLanguage;
  onDone: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export function QuizOverlay({ payload, targetLanguage, onDone }: QuizOverlayProps) {
  const { questions } = payload;
  const totalTime = getTotalTimeSeconds(questions.length);
  const [phase, setPhase] = useState<"answering" | "results">("answering");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [canClose, setCanClose] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const finishQuiz = useCallback((finalAnswers: Array<number | null>) => {
    setResults(gradeQuiz(questions, finalAnswers));
    setPhase("results");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [questions]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishQuiz(answers);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [answers, finishQuiz]);

  function handleSelect(index: number) {
    setSelected(index);
  }

  function handleNext() {
    if (selected === null) return;
    const nextAnswers = [...answers];
    nextAnswers[currentIndex] = selected;
    setAnswers(nextAnswers);
    setSelected(null);
    if (currentIndex + 1 >= questions.length) {
      finishQuiz(nextAnswers);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function handleResultsScroll() {
    const el = resultsRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setCanClose(true);
    }
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const score = results.filter((r) => r.correct).length;

  if (phase === "answering") {
    const question = questions[currentIndex];
    return (
      <div className="fixed inset-0 z-2147483647 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-lg rounded-xl border bg-popover p-6 shadow-2xl text-popover-foreground">
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{currentIndex + 1} / {questions.length}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {timeDisplay}
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed">{question.text}</p>
          <div className="mb-4 space-y-2">
            {question.options.map((option, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(i)}
                className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected === i
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <span className="shrink-0 font-semibold">{OPTION_LABELS[i]}.</span>
                <span>{option}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleNext}
            disabled={selected === null}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {currentIndex + 1 >= questions.length ? "Xem kết quả" : "Câu tiếp theo"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-2147483647 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border bg-popover shadow-2xl text-popover-foreground">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            Kết quả: {score}/{questions.length} câu đúng
          </h2>
        </div>
        <div
          ref={resultsRef}
          onScroll={handleResultsScroll}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
        >
          {results.map((result, i) => (
            <div key={i} className={`rounded-lg border p-3 ${result.correct ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <div className="mb-1 flex items-center gap-2">
                {result.correct
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  : <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
                <span className="text-xs font-medium text-muted-foreground">Câu {i + 1}</span>
              </div>
              <p className="mb-2 text-sm">{result.question.text}</p>
              {!result.correct && (
                <p className="mb-1 text-xs text-muted-foreground">
                  Bạn chọn: <strong>{result.selectedIndex !== null ? `${OPTION_LABELS[result.selectedIndex]}. ${result.question.options[result.selectedIndex]}` : "Không trả lời"}</strong>
                  {" · "}Đáp án đúng: <strong className="text-green-700">{OPTION_LABELS[result.question.correctIndex]}. {result.question.options[result.question.correctIndex]}</strong>
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">{result.question.explanation}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">💡 {result.question.relatedKnowledge}</p>
            </div>
          ))}
          <div className="pb-2 text-center text-xs text-muted-foreground">— Hết —</div>
        </div>
        <div className="border-t px-6 py-4">
          <button
            type="button"
            onClick={onDone}
            disabled={!canClose}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {canClose ? "Đóng" : "Cuộn xuống để đọc hết giải thích…"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement mount/unmount helper**

Create `src/content/toeic/index.ts`:
```typescript
import { createElement } from "react";
import type { Root } from "react-dom/client";
import type { ToeicQuizPayload } from "@/services/toeic/types";
import type { TargetLanguage } from "@/shared/types";
import { QuizOverlay } from "./QuizOverlay";

let quizRoot: Root | null = null;
let quizHost: HTMLElement | null = null;

export function showToeicQuiz(
  payload: ToeicQuizPayload,
  targetLanguage: TargetLanguage,
  onDone: () => void,
  createRoot: (container: HTMLElement) => Root,
): void {
  if (quizHost) return; // Already showing
  quizHost = document.createElement("div");
  quizHost.id = "extention-translate-toeic-quiz";
  document.documentElement.appendChild(quizHost);
  quizRoot = createRoot(quizHost);
  quizRoot.render(createElement(QuizOverlay, { payload, targetLanguage, onDone }));
}

export function hideToeicQuiz(): void {
  quizRoot?.unmount();
  quizRoot = null;
  quizHost?.remove();
  quizHost = null;
}
```

- [ ] **Step 3: Wire into content/index.tsx message listener**

In `src/content/index.tsx`, add imports at the top:
```typescript
import { showToeicQuiz, hideToeicQuiz } from "./toeic";
import type { ToeicQuizPayload } from "@/services/toeic/types";
```

Inside the existing `chrome.runtime.onMessage.addListener`, add a handler before the final `return false`:
```typescript
    if (message?.type === MESSAGE_TYPES.SHOW_TOEIC_QUIZ) {
      const payload = message.payload as ToeicQuizPayload;
      showToeicQuiz(payload, settings.targetLanguage, () => {
        hideToeicQuiz();
        void sendMessage(MESSAGE_TYPES.TOEIC_QUIZ_DONE, undefined);
      }, (container) => createRoot(container));
      sendResponse({ ok: true });
      return false;
    }
```

Note: `createRoot` is already imported from `react-dom/client` in content/index.tsx. The `sendMessage` helper is already defined in the file.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/content/toeic/QuizOverlay.tsx src/content/toeic/index.ts src/content/index.tsx
git commit -m "feat: add TOEIC quiz overlay with stepper and results view"
```

---

### Task 8: Settings UI section

**Files:**
- Create: `src/settings/sections/ToeicQuizSection.tsx`
- Modify: `src/settings/navigation.ts`
- Modify: `src/settings/App.tsx`
- Modify: `src/settings/locales/types.ts`
- Modify: `src/settings/locales/en.ts`
- Modify: `src/settings/locales/vi.ts`
- Modify: `src/settings/locales/zh-CN.ts`

**Interfaces:**
- Consumes: `ExtensionSettings`, `TOEIC_QUIZ_INTERVAL`, `TOEIC_QUIZ_QUESTIONS` from `@/shared/types`; `SettingsCopy` from `../locales`
- Produces: `ToeicQuizSection` component; `"toeic"` section id in navigation

- [ ] **Step 1: Add locale strings**

Add to `SettingsCopy` interface in `src/settings/locales/types.ts`:
```typescript
  // TOEIC Quiz section
  navToeicTitle: string;
  navToeicDescription: string;
  toeicHeading: string;
  toeicEnableTitle: string;
  toeicEnableDescription: string;
  toeicIntervalTitle: string;
  toeicIntervalDescription: string;
  toeicIntervalSuffix: string;
  toeicCountTitle: string;
  toeicCountDescription: string;
  toeicCountSuffix: string;
  toeicTimeNote: string;
```

Add corresponding values to each locale file (en.ts, vi.ts, zh-CN.ts). Example for vi.ts:
```typescript
  navToeicTitle: "TOEIC Quiz",
  navToeicDescription: "Cài đặt bài kiểm tra TOEIC Part 5 định kỳ",
  toeicHeading: "TOEIC Part 5 Quiz",
  toeicEnableTitle: "Bật quiz định kỳ",
  toeicEnableDescription: "Sau một khoảng thời gian duyệt web, một bài quiz sẽ tự động xuất hiện.",
  toeicIntervalTitle: "Thời gian tích lũy",
  toeicIntervalDescription: "Số phút hoạt động trước khi quiz xuất hiện.",
  toeicIntervalSuffix: "phút",
  toeicCountTitle: "Số câu hỏi",
  toeicCountDescription: "Số câu hỏi trong mỗi bài quiz.",
  toeicCountSuffix: "câu",
  toeicTimeNote: "Thời gian làm bài: 30 giây mỗi câu (cố định).",
```

- [ ] **Step 2: Add navigation entry**

In `src/settings/navigation.ts`:
- Add `"toeic"` to `SettingsSectionId` union type.
- Import `GraduationCap` from lucide-react.
- Add entry after "vocabulary":
```typescript
    { id: "toeic", icon: GraduationCap, title: copy.navToeicTitle, description: copy.navToeicDescription },
```

- [ ] **Step 3: Implement ToeicQuizSection component**

Create `src/settings/sections/ToeicQuizSection.tsx`:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TOEIC_QUIZ_INTERVAL, TOEIC_QUIZ_QUESTIONS, type ExtensionSettings } from "@/shared/types";
import { getSettingsCopy } from "../locales";
import { SettingRow } from "../SettingRow";

interface ToeicQuizSectionProps {
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
}

export function ToeicQuizSection({ settings, onSettingsChange }: ToeicQuizSectionProps) {
  const copy = getSettingsCopy(settings.targetLanguage);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{copy.toeicHeading}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.toeicEnableTitle}</CardTitle>
          <CardDescription>{copy.toeicEnableDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow>
            <Label htmlFor="toeic-quiz-enabled">{copy.toeicEnableTitle}</Label>
            <Switch
              id="toeic-quiz-enabled"
              checked={settings.toeicQuizEnabled}
              onCheckedChange={(checked) => onSettingsChange({ ...settings, toeicQuizEnabled: checked })}
            />
          </SettingRow>

          <SettingRow>
            <div>
              <Label htmlFor="toeic-quiz-interval">{copy.toeicIntervalTitle}</Label>
              <p className="text-xs text-muted-foreground">{copy.toeicIntervalDescription}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="toeic-quiz-interval"
                type="number"
                min={TOEIC_QUIZ_INTERVAL.min}
                max={TOEIC_QUIZ_INTERVAL.max}
                value={settings.toeicQuizIntervalMinutes}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!Number.isNaN(value)) {
                    onSettingsChange({ ...settings, toeicQuizIntervalMinutes: Math.max(TOEIC_QUIZ_INTERVAL.min, Math.min(TOEIC_QUIZ_INTERVAL.max, value)) });
                  }
                }}
                className="h-8 w-20 rounded-md border bg-background px-2 text-center text-sm"
              />
              <span className="text-sm text-muted-foreground">{copy.toeicIntervalSuffix}</span>
            </div>
          </SettingRow>

          <SettingRow>
            <div>
              <Label htmlFor="toeic-quiz-count">{copy.toeicCountTitle}</Label>
              <p className="text-xs text-muted-foreground">{copy.toeicCountDescription}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="toeic-quiz-count"
                type="number"
                min={TOEIC_QUIZ_QUESTIONS.min}
                max={TOEIC_QUIZ_QUESTIONS.max}
                value={settings.toeicQuizQuestionCount}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!Number.isNaN(value)) {
                    onSettingsChange({ ...settings, toeicQuizQuestionCount: Math.max(TOEIC_QUIZ_QUESTIONS.min, Math.min(TOEIC_QUIZ_QUESTIONS.max, value)) });
                  }
                }}
                className="h-8 w-20 rounded-md border bg-background px-2 text-center text-sm"
              />
              <span className="text-sm text-muted-foreground">{copy.toeicCountSuffix}</span>
            </div>
          </SettingRow>

          <p className="text-xs text-muted-foreground">{copy.toeicTimeNote}</p>
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 4: Wire into App.tsx**

In `src/settings/App.tsx`:
- Import: `import { ToeicQuizSection } from "./sections/ToeicQuizSection";`
- Add to `composeNext()`:
```typescript
      toeicQuizEnabled: settings.toeicQuizEnabled,
      toeicQuizIntervalMinutes: settings.toeicQuizIntervalMinutes,
      toeicQuizQuestionCount: settings.toeicQuizQuestionCount,
```
- Add section render after vocabulary:
```tsx
            {activeSection === "toeic" && <ToeicQuizSection settings={settings} onSettingsChange={setSettings} />}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/settings/sections/ToeicQuizSection.tsx src/settings/navigation.ts src/settings/App.tsx src/settings/locales/
git commit -m "feat: add TOEIC Quiz settings section"
```

---

### Task 9: Quiz UI copy strings

**Files:**
- Modify: `src/components/dictionary/copy.ts`

**Interfaces:**
- Consumes: existing `PopupCopy` interface
- Produces: quiz-related labels used by QuizOverlay (next, results, close, scroll hint)

Note: The QuizOverlay currently uses hardcoded Vietnamese strings. This task extracts them into the copy system for i18n. However, since the overlay is rendered outside the popup's copy context and uses `targetLanguage` directly, we add a small standalone copy module.

- [ ] **Step 1: Create quiz copy module**

Create `src/content/toeic/copy.ts`:
```typescript
import type { TargetLanguage } from "@/shared/types";

export interface QuizCopy {
  next: string;
  seeResults: string;
  resultTitle: (score: number, total: number) => string;
  question: (n: number) => string;
  youChose: string;
  correctAnswer: string;
  noAnswer: string;
  close: string;
  scrollHint: string;
  end: string;
}

const COPY: Record<TargetLanguage, QuizCopy> = {
  en: {
    next: "Next question",
    seeResults: "See results",
    resultTitle: (score, total) => `Results: ${score}/${total} correct`,
    question: (n) => `Question ${n}`,
    youChose: "You chose",
    correctAnswer: "Correct answer",
    noAnswer: "No answer",
    close: "Close",
    scrollHint: "Scroll down to read all explanations…",
    end: "— End —",
  },
  vi: {
    next: "Câu tiếp theo",
    seeResults: "Xem kết quả",
    resultTitle: (score, total) => `Kết quả: ${score}/${total} câu đúng`,
    question: (n) => `Câu ${n}`,
    youChose: "Bạn chọn",
    correctAnswer: "Đáp án đúng",
    noAnswer: "Không trả lời",
    close: "Đóng",
    scrollHint: "Cuộn xuống để đọc hết giải thích…",
    end: "— Hết —",
  },
  "zh-CN": {
    next: "下一题",
    seeResults: "查看结果",
    resultTitle: (score, total) => `结果：${score}/${total} 题正确`,
    question: (n) => `第 ${n} 题`,
    youChose: "你选择了",
    correctAnswer: "正确答案",
    noAnswer: "未作答",
    close: "关闭",
    scrollHint: "向下滚动阅读所有解释…",
    end: "— 完 —",
  },
};

export function getQuizCopy(language: TargetLanguage): QuizCopy {
  return COPY[language] ?? COPY.en;
}
```

- [ ] **Step 2: Update QuizOverlay to use copy**

Replace hardcoded strings in `QuizOverlay.tsx` with `getQuizCopy(targetLanguage)` calls. Import `getQuizCopy` from `./copy`.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/content/toeic/copy.ts src/content/toeic/QuizOverlay.tsx
git commit -m "feat: add i18n copy for TOEIC quiz overlay"
```

---

### Task 10: Integration test and final build

**Files:**
- Create: `scripts/test-toeic-integration.mjs`

**Interfaces:**
- Consumes: all modules from Tasks 1–9
- Produces: passing integration test verifying wiring

- [ ] **Step 1: Write integration test**

```javascript
// scripts/test-toeic-integration.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contentSource, backgroundSource, manifest] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8"),
]);

// Content script handles SHOW_TOEIC_QUIZ
assert.match(contentSource, /SHOW_TOEIC_QUIZ/);
assert.match(contentSource, /showToeicQuiz/);
assert.match(contentSource, /hideToeicQuiz/);
assert.match(contentSource, /TOEIC_QUIZ_DONE/);

// Background initializes quiz controller
assert.match(backgroundSource, /initToeicQuizController/);
assert.match(backgroundSource, /handleToeicQuizDone/);
assert.match(backgroundSource, /TOEIC_QUIZ_DONE/);

// Manifest has required permissions
const manifestJson = JSON.parse(manifest);
assert.ok(manifestJson.permissions.includes("idle"));
assert.ok(manifestJson.permissions.includes("alarms"));

console.log("PASS: toeic quiz integration wiring");
```

- [ ] **Step 2: Run all tests**

Run: `node --experimental-strip-types scripts/test-toeic-settings.mjs && node --experimental-strip-types scripts/test-toeic-prompt.mjs && node --experimental-strip-types scripts/test-toeic-generator.mjs && node --experimental-strip-types scripts/test-toeic-quiz-state.mjs && node --experimental-strip-types scripts/test-toeic-integration.mjs`
Expected: all PASS

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Run existing test suite**

Run: `node scripts/run-tests.mjs`
Expected: all existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add scripts/test-toeic-integration.mjs
git commit -m "test: add TOEIC quiz integration test"
```

- [ ] **Step 6: Final commit and push**

```bash
git add -A
git commit -m "feat: TOEIC Part 5 quiz with timed overlay and AI-generated questions"
git push origin main
```
