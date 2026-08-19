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
