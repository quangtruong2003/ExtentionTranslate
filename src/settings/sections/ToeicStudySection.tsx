import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Ear, Layers, RefreshCw, Sparkles, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import type { TargetLanguage, VocabularyRecord } from "@/shared/types";
import { buildFlashcardDeck, type Flashcard } from "@/services/toeic/flashcards";
import { buildListeningQuiz, type ListeningQuestion } from "@/services/toeic/listening";
import {
  clearToeicStats,
  listToeicStats,
  recordToeicQuizOutcome,
  summarizeToeicStats,
  toDateKey,
  type ToeicDailyStats,
  type ToeicStudySummary,
} from "@/services/toeic/stats";
import { getTodayWord, type ToeicWordOfDay } from "@/services/toeic/wordOfDay";
import { getToeicStudyCopy } from "../toeicStudyCopy";

const FLASHCARD_DECK_SIZE = 20;
const LISTENING_QUESTION_COUNT = 10;

const statsStorage = {
  get: (key: string) => new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items as Record<string, unknown>));
  }),
  set: (items: Record<string, unknown>) => new Promise<void>((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  }),
};

function sendMessage<T>(type: string, payload?: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response?: { ok: boolean; payload?: T }) => {
      resolve(response?.ok ? response.payload : undefined);
    });
  });
}

function speakWord(word: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
  return true;
}

function translationFor(word: ToeicWordOfDay, language: TargetLanguage): string {
  if (language === "zh-CN") return word.translationZh;
  return word.translationVi;
}

interface ToeicStudySectionProps {
  targetLanguage: TargetLanguage;
}

export function ToeicStudySection({ targetLanguage }: ToeicStudySectionProps) {
  const copy = getToeicStudyCopy(targetLanguage);
  const [records, setRecords] = useState<VocabularyRecord[]>([]);
  const [summary, setSummary] = useState<ToeicStudySummary | null>(null);
  const wordOfDay = useMemo(() => getTodayWord(), []);

  const refreshStats = useCallback(async () => {
    const days = await listToeicStats(statsStorage);
    setSummary(summarizeToeicStats(days, toDateKey(new Date())));
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_LIST");
      setRecords(list ?? []);
      await refreshStats();
    })();
  }, [refreshStats]);

  async function recordOutcome(kind: "part5" | "listening" | "flashcards", correct: number, total: number) {
    await recordToeicQuizOutcome(statsStorage, { kind, correct, total });
    await refreshStats();
  }

  return (
    <section className="w-full min-w-0 max-w-full space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{copy.heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.intro}</p>
      </div>

      {wordOfDay && <WordOfDayCard word={wordOfDay} targetLanguage={targetLanguage} />}

      <FlashcardCard
        records={records}
        targetLanguage={targetLanguage}
        onFinished={(correct, total) => void recordOutcome("flashcards", correct, total)}
      />

      <ListeningCard
        records={records}
        targetLanguage={targetLanguage}
        onFinished={(correct, total) => void recordOutcome("listening", correct, total)}
      />

      <StatsCard targetLanguage={targetLanguage} summary={summary} onClear={async () => {
        await clearToeicStats(statsStorage);
        await refreshStats();
        toast.success(copy.statsClearedToast);
      }} />
    </section>
  );
}

function WordOfDayCard({ word, targetLanguage }: { word: ToeicWordOfDay; targetLanguage: TargetLanguage }) {
  const copy = getToeicStudyCopy(targetLanguage);
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {copy.wordOfDayTitle}
        </CardTitle>
        <CardDescription>{copy.wordOfDayDescription}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-semibold tracking-tight">{word.word}</span>
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{word.partOfSpeech}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => speakWord(word.word)}>
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            {copy.wordOfDaySpeak}
          </Button>
        </div>
        <p className="text-sm">{word.definition}</p>
        <p className="text-sm font-medium text-foreground/90">
          {targetLanguage === "en" ? "" : translationFor(word, targetLanguage)}
        </p>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.wordOfDayExampleLabel}</p>
          <p className="mt-1 text-sm italic">{word.example}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FlashcardCard({ records, targetLanguage, onFinished }: {
  records: VocabularyRecord[];
  targetLanguage: TargetLanguage;
  onFinished: (correct: number, total: number) => void;
}) {
  const copy = getToeicStudyCopy(targetLanguage);
  const [deck, setDeck] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  function start() {
    const built = buildFlashcardDeck(records, { limit: FLASHCARD_DECK_SIZE, seed: Date.now() });
    setDeck(built);
    setIndex(0);
    setFlipped(false);
    setCorrectCount(0);
    setFinished(false);
  }

  function grade(known: boolean) {
    if (!deck) return;
    const nextCorrect = correctCount + (known ? 1 : 0);
    setCorrectCount(nextCorrect);
    if (index + 1 >= deck.length) {
      setFinished(true);
      onFinished(nextCorrect, deck.length);
    } else {
      setIndex(index + 1);
      setFlipped(false);
    }
  }

  const card = deck?.[index];

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {copy.flashcardsTitle}
        </CardTitle>
        <CardDescription>{copy.flashcardsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {!deck && (
          records.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{copy.flashcardsEmpty}</p>
          ) : (
            <Button type="button" onClick={start}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              {copy.flashcardsStart}
            </Button>
          )
        )}

        {deck && !finished && card && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{copy.flashcardsProgress(index + 1, deck.length)}</p>
            <button
              type="button"
              onClick={() => setFlipped((value) => !value)}
              className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/40"
            >
              <span className="text-2xl font-semibold">{flipped ? (card.translation ?? card.word) : card.word}</span>
              {flipped && card.translation && <span className="text-sm text-muted-foreground">{card.word}</span>}
              <span className="text-xs text-muted-foreground">{copy.flashcardsFlipHint}</span>
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => grade(false)}>
                {copy.flashcardsMissed}
              </Button>
              <Button type="button" className="flex-1" onClick={() => grade(true)}>
                {copy.flashcardsGotIt}
              </Button>
            </div>
          </div>
        )}

        {deck && finished && (
          <div className="space-y-3 text-center">
            <p className="text-base font-semibold">{copy.flashcardsDoneTitle}</p>
            <p className="text-sm text-muted-foreground">{copy.flashcardsDoneSummary(correctCount, deck.length)}</p>
            <Button type="button" variant="outline" onClick={start}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.flashcardsRestart}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListeningCard({ records, targetLanguage, onFinished }: {
  records: VocabularyRecord[];
  targetLanguage: TargetLanguage;
  onFinished: (correct: number, total: number) => void;
}) {
  const copy = getToeicStudyCopy(targetLanguage);
  const [questions, setQuestions] = useState<ListeningQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

  function start() {
    const built = buildListeningQuiz(records, { questionCount: LISTENING_QUESTION_COUNT, seed: Date.now() });
    setQuestions(built);
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setFinished(false);
    if (built.length > 0) speakWord(built[0]!.word);
  }

  function pick(optionIndex: number) {
    if (!questions || picked !== null) return;
    const question = questions[index]!;
    setPicked(optionIndex);
    if (optionIndex === question.correctIndex) setCorrectCount((value) => value + 1);
  }

  function next() {
    if (!questions) return;
    if (index + 1 >= questions.length) {
      setFinished(true);
      onFinished(correctCount, questions.length);
    } else {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setPicked(null);
      speakWord(questions[nextIndex]!.word);
    }
  }

  const question = questions?.[index];

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ear className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {copy.listeningTitle}
        </CardTitle>
        <CardDescription>{copy.listeningDescription}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {!questions && (
          records.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{copy.listeningEmpty}</p>
          ) : !speechAvailable ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{copy.listeningUnavailable}</p>
          ) : (
            <Button type="button" onClick={start}>
              <Ear className="h-4 w-4" aria-hidden="true" />
              {copy.listeningStart}
            </Button>
          )
        )}

        {questions && !finished && question && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{copy.listeningProgress(index + 1, questions.length)}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => speakWord(question.word)}>
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                {picked === null ? copy.listeningPlay : copy.listeningPlayAgain}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option, optionIndex) => {
                const isCorrect = optionIndex === question.correctIndex;
                const isPicked = optionIndex === picked;
                const revealed = picked !== null;
                return (
                  <button
                    key={`${index}-${option}`}
                    type="button"
                    disabled={revealed}
                    onClick={() => pick(optionIndex)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      revealed && isCorrect
                        ? "border-green-500/50 bg-green-500/10 font-medium"
                        : revealed && isPicked
                          ? "border-red-500/50 bg-red-500/10"
                          : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="space-y-2">
                <p className={`text-sm font-medium ${picked === question.correctIndex ? "text-green-600" : "text-red-600"}`}>
                  {picked === question.correctIndex ? copy.listeningCorrect : copy.listeningWrong}
                  {question.translation ? ` — ${question.translation}` : ""}
                </p>
                <Button type="button" className="w-full" onClick={next}>
                  {copy.listeningNext}
                </Button>
              </div>
            )}
          </div>
        )}

        {questions && finished && (
          <div className="space-y-3 text-center">
            <p className="text-base font-semibold">{copy.listeningDoneTitle}</p>
            <p className="text-sm text-muted-foreground">{copy.listeningDoneSummary(correctCount, questions.length)}</p>
            <Button type="button" variant="outline" onClick={start}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.listeningRestart}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatsCard({ targetLanguage, summary, onClear }: { targetLanguage: TargetLanguage; summary: ToeicStudySummary | null; onClear: () => Promise<void> }) {
  const copy = getToeicStudyCopy(targetLanguage);
  const recentDays = useMemo(() => lastSevenDays(summary?.days ?? []), [summary]);
  const maxTotal = Math.max(1, ...recentDays.map((day) => day.total));

  if (!summary) return null;

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {copy.statsTitle}
        </CardTitle>
        <CardDescription>{copy.statsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {summary.totalAnswered === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{copy.statsEmpty}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={copy.statsCurrentStreak} value={`${summary.currentStreak} ${copy.statsDaySuffix}`} />
              <StatTile label={copy.statsBestStreak} value={`${summary.bestStreak} ${copy.statsDaySuffix}`} />
              <StatTile label={copy.statsTotalAnswered} value={`${summary.totalAnswered}`} />
              <StatTile
                label={copy.statsAccuracy}
                value={summary.accuracy === null ? "—" : `${Math.round(summary.accuracy * 100)}%`}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.statsRecentTitle}</p>
              <div className="flex h-24 items-end gap-2">
                {recentDays.map((day) => (
                  <div key={day.key} className="flex flex-1 flex-col items-center gap-1" title={`${day.key}: ${day.total}`}>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-primary/70"
                        style={{ height: `${Math.round((day.total / maxTotal) * 100)}%`, minHeight: day.total > 0 ? 4 : 0 }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{day.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => void onClear()}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {copy.statsClear}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

interface RecentDay {
  key: string;
  label: string;
  total: number;
}

function lastSevenDays(days: ToeicDailyStats[]): RecentDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const result: RecentDay[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = toDateKey(date);
    const day = byDate.get(key);
    const total = day ? day.part5Total + day.listeningTotal + day.flashcardsTotal : 0;
    result.push({ key, label: `${date.getDate()}/${date.getMonth() + 1}`, total });
  }
  return result;
}
