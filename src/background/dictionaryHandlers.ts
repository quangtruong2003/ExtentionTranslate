import { ExtensionError, ERROR_CODES } from "@/shared/errors";
import { fetchFreeDictionary } from "@/services/dictionary/freeDictionary";
import { fetchFreeDictionaryApi, parseFreeDictionaryApiSource } from "@/services/dictionary/freeDictionaryApi";
import { getCached, setCached } from "@/services/dictionary/cache";
import { normalizeTranslatedEntry } from "@/services/dictionary/translation";
import { resolveDictionaryRemoteFallback } from "@/services/dictionary/remoteFallback";
import { generateDictionaryEntryWithOpenRouter, translateDictionaryEntryWithOpenRouter } from "@/services/openrouter/client";
import { getSettings } from "@/services/storage/settings";
import type {
  DictionaryRemoteTranslationRequest,
  DictionaryRemoteTranslationResponse,
  LookupRequest,
  LookupResponse,
  TargetLanguage,
} from "@/shared/types";

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
}

export async function lookupDictionarySource(payload: LookupRequest, signal: AbortSignal): Promise<LookupResponse> {
  const word = payload.word.trim();
  if (!word) return { entry: null, error: "EMPTY" };

  const cached = getCached(word, "en");
  if (cached) return { entry: cached, sourceEntry: cached, translationStatus: "source" };

  try {
    const entry = await fetchFreeDictionary(word, signal);
    setCached(entry);
    return { entry, sourceEntry: entry, translationStatus: "source" };
  } catch (primaryError) {
    if (isAbortError(primaryError)) throw primaryError;

    try {
      const raw = await fetchFreeDictionaryApi(word, signal);
      const entry = parseFreeDictionaryApiSource(raw, word);
      if (entry) {
        setCached(entry);
        return { entry, sourceEntry: entry, translationStatus: "source" };
      }
    } catch (fallbackError) {
      if (isAbortError(fallbackError)) throw fallbackError;
    }

    if (primaryError instanceof ExtensionError) return { entry: null, error: primaryError.code };
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
