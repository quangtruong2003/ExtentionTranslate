export const TOEIC_STATS_STORAGE_KEY = "extention-translate:toeic-stats";

export type ToeicQuizKind = "part5" | "listening" | "flashcards";

export interface ToeicDailyStats {
  /** Local date key, e.g. "2026-08-20". */
  date: string;
  part5Correct: number;
  part5Total: number;
  listeningCorrect: number;
  listeningTotal: number;
  flashcardsCorrect: number;
  flashcardsTotal: number;
}

export interface ToeicStatsStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface QuizOutcome {
  kind: ToeicQuizKind;
  correct: number;
  total: number;
}

export interface ToeicStudySummary {
  days: ToeicDailyStats[];
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number | null;
  currentStreak: number;
  bestStreak: number;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDaily(value: unknown): ToeicDailyStats | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    date: record.date,
    part5Correct: num(record.part5Correct),
    part5Total: num(record.part5Total),
    listeningCorrect: num(record.listeningCorrect),
    listeningTotal: num(record.listeningTotal),
    flashcardsCorrect: num(record.flashcardsCorrect),
    flashcardsTotal: num(record.flashcardsTotal),
  };
}

export async function listToeicStats(storage: ToeicStatsStorageLike): Promise<ToeicDailyStats[]> {
  const raw = await storage.get(TOEIC_STATS_STORAGE_KEY);
  const stored = raw[TOEIC_STATS_STORAGE_KEY];
  if (!Array.isArray(stored)) return [];
  return stored
    .map(normalizeDaily)
    .filter((item): item is ToeicDailyStats => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function recordToeicQuizOutcome(
  storage: ToeicStatsStorageLike,
  outcome: QuizOutcome,
  now: Date = new Date(),
): Promise<ToeicDailyStats[]> {
  const days = await listToeicStats(storage);
  const key = toDateKey(now);
  const existing = days.find((day) => day.date === key);
  const updated: ToeicDailyStats = existing
    ? { ...existing }
    : { date: key, part5Correct: 0, part5Total: 0, listeningCorrect: 0, listeningTotal: 0, flashcardsCorrect: 0, flashcardsTotal: 0 };
  if (outcome.kind === "part5") {
    updated.part5Correct += Math.max(0, outcome.correct);
    updated.part5Total += Math.max(0, outcome.total);
  } else if (outcome.kind === "listening") {
    updated.listeningCorrect += Math.max(0, outcome.correct);
    updated.listeningTotal += Math.max(0, outcome.total);
  } else {
    updated.flashcardsCorrect += Math.max(0, outcome.correct);
    updated.flashcardsTotal += Math.max(0, outcome.total);
  }
  const next = existing
    ? days.map((day) => (day.date === key ? updated : day))
    : [...days, updated];
  await storage.set({ [TOEIC_STATS_STORAGE_KEY]: next });
  return next;
}

export async function clearToeicStats(storage: ToeicStatsStorageLike): Promise<void> {
  await storage.set({ [TOEIC_STATS_STORAGE_KEY]: [] });
}

function dayDiff(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Current streak: consecutive study days ending today, or ending yesterday if
 * the user has not studied yet today. Best streak: longest consecutive run.
 */
export function computeStreak(days: ToeicDailyStats[], todayKey: string): { current: number; best: number } {
  const dates = [...new Set(days.map((day) => day.date))].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous !== null && dayDiff(previous, date) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    previous = date;
  }

  let current = 0;
  if (dates.length > 0) {
    const last = dates[dates.length - 1]!;
    const gap = dayDiff(last, todayKey);
    if (gap === 0 || gap === 1) {
      current = 1;
      for (let i = dates.length - 2; i >= 0; i -= 1) {
        if (dayDiff(dates[i]!, dates[i + 1]!) === 1) current += 1;
        else break;
      }
    }
  }
  return { current, best };
}

export function summarizeToeicStats(days: ToeicDailyStats[], todayKey: string): ToeicStudySummary {
  let totalAnswered = 0;
  let totalCorrect = 0;
  for (const day of days) {
    totalAnswered += day.part5Total + day.listeningTotal + day.flashcardsTotal;
    totalCorrect += day.part5Correct + day.listeningCorrect + day.flashcardsCorrect;
  }
  const { current, best } = computeStreak(days, todayKey);
  return {
    days,
    totalAnswered,
    totalCorrect,
    accuracy: totalAnswered > 0 ? totalCorrect / totalAnswered : null,
    currentStreak: current,
    bestStreak: best,
  };
}
