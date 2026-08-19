import { MESSAGE_TYPES } from "@/shared/constants";
import { getSettings } from "@/services/storage/settings";
import { generateToeicQuiz } from "@/services/toeic/generator";
import type { ToeicQuizPayload } from "@/services/toeic/types";

const ALARM_NAME = "toeic-quiz-timer";
const SESSION_KEY = "toeic-quiz-accumulated-minutes";
const QUIZ_ACTIVE_TIMEOUT_MS = 15 * 60 * 1000;

let cachedQuiz: ToeicQuizPayload | null = null;
let prefetchStarted = false;
let quizActiveSince: number | null = null;

async function getAccumulatedMinutes(): Promise<number> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const value = result[SESSION_KEY];
  return typeof value === "number" && value >= 0 ? value : 0;
}

async function setAccumulatedMinutes(minutes: number): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: minutes });
}

async function resetTimer(): Promise<void> {
  cachedQuiz = null;
  prefetchStarted = false;
  quizActiveSince = null;
  await setAccumulatedMinutes(0);
}

async function ensureAlarm(enabled: boolean): Promise<void> {
  if (enabled) {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

async function findActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabsQuery = chrome.tabs["query" as keyof typeof chrome.tabs] as typeof chrome.tabs.query;
  const tabs = await tabsQuery({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

async function handleAlarmTick(): Promise<void> {
  const settings = await getSettings();
  if (!settings.toeicQuizEnabled || !settings.openRouterApiKey.trim()) {
    await ensureAlarm(false);
    return;
  }

  if (quizActiveSince !== null) {
    if (Date.now() - quizActiveSince > QUIZ_ACTIVE_TIMEOUT_MS) await resetTimer();
    else return;
  }

  const idleState = await chrome.idle.queryState(60);
  if (idleState !== "active") return;

  const next = (await getAccumulatedMinutes()) + 1;
  await setAccumulatedMinutes(next);

  const interval = settings.toeicQuizIntervalMinutes;

  if (next >= Math.floor(interval * 0.8) && !cachedQuiz && !prefetchStarted) {
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

  if (next >= interval) {
    await triggerQuiz();
  }
}

async function triggerQuiz(): Promise<void> {
  const settings = await getSettings();
  let quiz = cachedQuiz;
  if (!quiz) {
    try {
      quiz = await generateToeicQuiz({
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
        questionCount: settings.toeicQuizQuestionCount,
        targetLanguage: settings.targetLanguage,
      });
    } catch {
      await resetTimer();
      return;
    }
  }

  const tab = await findActiveTab();
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    return;
  }

  quizActiveSince = Date.now();
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.SHOW_TOEIC_QUIZ,
      payload: quiz,
    });
  } catch {
    quizActiveSince = null;
  }
}

export function initToeicQuizController(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    void handleAlarmTick();
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== "local") return;
    void (async () => {
      const settings = await getSettings();
      const enabled = settings.toeicQuizEnabled && Boolean(settings.openRouterApiKey.trim());
      await ensureAlarm(enabled);
      if (!enabled) await resetTimer();
    })();
  });

  void (async () => {
    const settings = await getSettings();
    await ensureAlarm(settings.toeicQuizEnabled && Boolean(settings.openRouterApiKey.trim()));
  })();
}

export function handleToeicQuizDone(): void {
  void resetTimer();
}
