import type { VocabularyRecord } from "@/shared/types";
import { createSeededRandom, shuffleWithRandom } from "./flashcards.ts";

export interface ListeningQuestion {
  /** The word that is spoken aloud; the correct answer. */
  word: string;
  translation?: string;
  options: string[];
  correctIndex: number;
}

export interface ListeningQuizOptions {
  questionCount: number;
  seed: number;
}

/**
 * Build listening questions from saved vocabulary. Each question plays the
 * target word via speechSynthesis and offers 4 word options. Words with a
 * translation are preferred so the reveal step can show the meaning.
 */
export function buildListeningQuiz(
  records: VocabularyRecord[],
  options: ListeningQuizOptions,
): ListeningQuestion[] {
  const usable = records
    .filter((record) => record.word.trim())
    .map((record) => ({ word: record.word, translation: record.translation }));
  if (usable.length === 0 || options.questionCount <= 0) return [];

  const rng = createSeededRandom(options.seed);
  const withTranslation = usable.filter((item) => item.translation?.trim());
  const withoutTranslation = usable.filter((item) => !item.translation?.trim());
  const ordered = [
    ...shuffleWithRandom(withTranslation, rng),
    ...shuffleWithRandom(withoutTranslation, rng),
  ];

  const questions: ListeningQuestion[] = [];
  const count = Math.min(options.questionCount, ordered.length);
  for (let i = 0; i < count; i += 1) {
    const target = ordered[i]!;
    const distractorPool = usable.filter((item) => item.word !== target.word);
    const distractors = shuffleWithRandom(distractorPool, rng).slice(0, 3);
    const optionWords = shuffleWithRandom([target.word, ...distractors.map((d) => d.word)], rng);
    questions.push({
      word: target.word,
      translation: target.translation,
      options: optionWords,
      correctIndex: optionWords.indexOf(target.word),
    });
  }
  return questions;
}
