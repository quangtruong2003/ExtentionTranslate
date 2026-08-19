// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import type { ToeicQuestion } from "../../services/toeic/types.ts";

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
