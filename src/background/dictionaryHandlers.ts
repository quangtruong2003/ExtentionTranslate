import { ExtensionError, ERROR_CODES } from "@/shared/errors";
import { InflightDedupe, raceDictionarySources } from "@/shared/inflight";
import { fetchFreeDictionary } from "@/services/dictionary/freeDictionary";
import { fetchFreeDictionaryApi, parseFreeDictionaryApiSource } from "@/services/dictionary/freeDictionaryApi";
import { getCached, setCached } from "@/services/dictionary/cache";
import { normalizeTranslatedEntry } from "@/services/dictionary/translation";
import { resolveDictionaryRemoteFallback } from "@/services/dictionary/remoteFallback";
import { generateDictionaryEntryWithOpenRouter, translateDictionaryEntryWithOpenRouter } from "@/services/openrouter/client";
import { getSettings } from "@/services/storage/settings";
import { recordVocabularyLookup, type VocabularyStorageLike } from "@/services/storage/vocabulary";
import type {
  DictionaryEntry,
  DictionaryRemoteTranslationRequest,
  DictionaryRemoteTranslationResponse,
  LookupRequest,
  LookupResponse,
  TargetLanguage,
} from "@/shared/types";

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
}

const lookupInflight = new InflightDedupe();

const backgroundVocabularyStorage: VocabularyStorageLike = {
  get: (key) => new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items as Record<string, unknown>));
  }),
  set: (items) => new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  }),
};

function firstTranslation(entry: DictionaryEntry): string | undefined {
  return entry.meanings.find((meaning) => meaning.translation)?.translation;
}

export async function lookupDictionarySource(payload: LookupRequest, signal: AbortSignal): Promise<LookupResponse> {
  const word = payload.word.trim();
  if (!word) return { entry: null, error: "EMPTY" };

  const cached = getCached(word, "en");
  if (cached) return { entry: cached, sourceEntry: cached, translationStatus: "source" };

  try {
    const entry = await lookupInflight.run(`en::${word.toLowerCase()}`, () =>
      raceDictionarySources({
        word,
        signal,
        fetchPrimary: (raceSignal) => fetchFreeDictionary(word, raceSignal),
        fetchSecondary: async (raceSignal) => {
          const raw = await fetchFreeDictionaryApi(word, raceSignal);
          return parseFreeDictionaryApiSource(raw, word);
        },
      }),
    );
    setCached(entry);
    void recordVocabularyLookup(backgroundVocabularyStorage, entry.word, firstTranslation(entry)).catch(() => {
      // History recording must never break a lookup.
    });
    return { entry, sourceEntry: entry, translationStatus: "source" };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ExtensionError) return { entry: null, error: error.code };
    return { entry: null, error: ERROR_CODES.NO_RESULT };
  }
}

function requireTargetLanguage(targetLanguage: TargetLanguage): Exclude<TargetLanguage, "en"> {
  if (targetLanguage === "en") throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", false);
  return targetLanguage;
}

export async function translateDictionaryRemotely(
  payload: DictionaryRemoteTranslationRequest,
  signal: AbortSignal,
): Promise<DictionaryRemoteTranslationResponse> {
  const settings = await getSettings();
  if (payload.targetLanguage === "en") {
    return { entry: payload.sourceEntry ?? null, status: "source", provider: "fallback" };
  }

  const targetLanguage = requireTargetLanguage(payload.targetLanguage);
  const result = await resolveDictionaryRemoteFallback({
    word: payload.word,
    sourceEntry: payload.sourceEntry,
    targetLanguage,
    signal,
    fetchFreeDictionaryApi,
    translateWithOpenRouter: async (sourceEntry, language) => {
      if (!settings.openRouterApiKey) throw new ExtensionError(ERROR_CODES.MISSING_API_KEY, "", false);
      const raw = await translateDictionaryEntryWithOpenRouter(
        {
          apiKey: settings.openRouterApiKey,
          model: settings.openRouterModel,
          signal,
        },
        sourceEntry,
        language,
      );
      const translated = normalizeTranslatedEntry(raw, sourceEntry, language);
      if (!translated) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);
      return translated;
    },
    generateWithOpenRouter: async (word, language) => {
      if (!settings.openRouterApiKey) throw new ExtensionError(ERROR_CODES.MISSING_API_KEY, "", false);
      return generateDictionaryEntryWithOpenRouter(
        {
          apiKey: settings.openRouterApiKey,
          model: settings.openRouterModel,
          signal,
        },
        word,
        language,
      );
    },
  });

  return result;
}
