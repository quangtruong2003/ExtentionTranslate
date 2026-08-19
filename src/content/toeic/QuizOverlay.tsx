import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { ToeicQuizPayload } from "@/services/toeic/types";
import type { TargetLanguage } from "@/shared/types";
import { getQuizCopy } from "./copy";
import { gradeQuiz, getTotalTimeSeconds, type QuizResult } from "./quizState";

interface QuizOverlayProps {
  payload: ToeicQuizPayload;
  targetLanguage: TargetLanguage;
  onDone: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export function QuizOverlay({ payload, targetLanguage, onDone }: QuizOverlayProps) {
  const copy = getQuizCopy(targetLanguage);
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
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const finishQuiz = useCallback((finalAnswers: Array<number | null>) => {
    setResults(gradeQuiz(questions, finalAnswers));
    setPhase("results");
  }, [questions]);

  useEffect(() => {
    if (phase !== "answering") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishQuiz(answersRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, finishQuiz]);

  // Enable the close button immediately if the results fit without scrolling.
  useEffect(() => {
    if (phase !== "results") return;
    const el = resultsRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 20) {
      setCanClose(true);
    }
  }, [phase, results]);

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
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-lg rounded-xl border bg-popover p-6 text-popover-foreground shadow-2xl">
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
                onClick={() => setSelected(i)}
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
            {currentIndex + 1 >= questions.length ? copy.seeResults : copy.next}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border bg-popover text-popover-foreground shadow-2xl">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{copy.resultTitle(score, questions.length)}</h2>
        </div>
        <div
          ref={resultsRef}
          onScroll={handleResultsScroll}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
        >
          {results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${result.correct ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
            >
              <div className="mb-1 flex items-center gap-2">
                {result.correct
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  : <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
                <span className="text-xs font-medium text-muted-foreground">{copy.question(i + 1)}</span>
              </div>
              <p className="mb-2 text-sm">{result.question.text}</p>
              {!result.correct && (
                <p className="mb-1 text-xs text-muted-foreground">
                  {copy.youChose}:{" "}
                  <strong>
                    {result.selectedIndex !== null
                      ? `${OPTION_LABELS[result.selectedIndex]}. ${result.question.options[result.selectedIndex]}`
                      : copy.noAnswer}
                  </strong>
                  {" · "}
                  {copy.correctAnswer}:{" "}
                  <strong className="text-green-700">
                    {OPTION_LABELS[result.question.correctIndex]}. {result.question.options[result.question.correctIndex]}
                  </strong>
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">{result.question.explanation}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">💡 {result.question.relatedKnowledge}</p>
            </div>
          ))}
          <div className="pb-2 text-center text-xs text-muted-foreground">{copy.end}</div>
        </div>
        <div className="border-t px-6 py-4">
          <button
            type="button"
            onClick={onDone}
            disabled={!canClose}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {canClose ? copy.close : copy.scrollHint}
          </button>
        </div>
      </div>
    </div>
  );
}
