import type { DictionaryEntry, TargetLanguage } from "@/shared/types";
import { normalizeDictionaryPresentation } from "./presentation.ts";

export type DictionaryTranslationProvider = "source" | "cache" | "browser" | "free-dictionary-api" | "openrouter" | "fallback";
export type DictionaryTranslationWorkflowStatus = "source" | "translated" | "partial" | "fallback";

export interface DictionaryTranslationWorkflowResult {
  entry: DictionaryEntry;
  provider: DictionaryTranslationProvider;
  status: DictionaryTranslationWorkflowStatus;
}

export interface DictionaryTranslationWorkflowOptions {
  sourceEntry: DictionaryEntry;
  targetLanguage: TargetLanguage;
  browserTranslator: {
    translate(
      entry: DictionaryEntry,
      targetLanguage: Exclude<TargetLanguage, "en">,
      signal?: AbortSignal,
    ): Promise<DictionaryEntry | null>;
  };
  getCached: (
    sourceEntry: DictionaryEntry,
    targetLanguage: Exclude<TargetLanguage, "en">,
  ) => Promise<DictionaryEntry | null>;
  setCached: (
    sourceEntry: DictionaryEntry,
    translatedEntry: DictionaryEntry,
    targetLanguage: Exclude<TargetLanguage, "en">,
  ) => Promise<void>;
  translateRemote: (
    sourceEntry: DictionaryEntry,
    targetLanguage: Exclude<TargetLanguage, "en">,
    signal?: AbortSignal,
  ) => Promise<{
    entry: DictionaryEntry | null;
    status: DictionaryTranslationWorkflowStatus;
    provider: Exclude<DictionaryTranslationProvider, "source" | "cache" | "browser" | "fallback"> | "fallback";
  }>;
  signal?: AbortSignal;
}

function isAborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (isAborted(signal)) throw new DOMException("Aborted", "AbortError");
}

export async function translateDictionaryEntryInBrowser(
  options: DictionaryTranslationWorkflowOptions,
): Promise<DictionaryTranslationWorkflowResult> {
  const { sourceEntry, targetLanguage, signal } = options;
  if (targetLanguage === "en") {
    return { entry: sourceEntry, provider: "source", status: "source" };
  }

  throwIfAborted(signal);

  try {
    const cached = await options.getCached(sourceEntry, targetLanguage);
    if (cached) {
      return {
        entry: normalizeDictionaryPresentation(cached, targetLanguage),
        provider: "cache",
        status: "translated",
      };
    }
  } catch {
    // A corrupt or unavailable persistent cache must not block lookup.
  }

  throwIfAborted(signal);
  try {
    const browserEntry = await options.browserTranslator.translate(sourceEntry, targetLanguage, signal);
    if (browserEntry) {
      const entry = normalizeDictionaryPresentation(browserEntry, targetLanguage);
      try {
        await options.setCached(sourceEntry, entry, targetLanguage);
      } catch {
        // Translation remains valid when persistence is unavailable.
      }
      return { entry, provider: "browser", status: "translated" };
    }
  } catch {
    // Browser Translator is an optional capability; continue to the remote chain.
  }

  throwIfAborted(signal);
  try {
    const remote = await options.translateRemote(sourceEntry, targetLanguage, signal);
    if (remote.entry) {
      if (remote.status === "translated" || remote.status === "partial") {
        const entry = normalizeDictionaryPresentation(remote.entry, targetLanguage);
        try {
          await options.setCached(sourceEntry, entry, targetLanguage);
        } catch {
          // Translation remains valid when persistence is unavailable.
        }
        return { entry, provider: remote.provider, status: remote.status };
      }
      return { entry: remote.entry, provider: remote.provider, status: remote.status };
    }
  } catch {
    // Keep the source entry visible as the final safe fallback.
  }

  return { entry: sourceEntry, provider: "fallback", status: "fallback" };
}
