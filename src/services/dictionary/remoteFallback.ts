import type { DictionaryEntry, TargetLanguage } from "@/shared/types";
import { parseFreeDictionaryApiPartialTranslations, parseFreeDictionaryApiSource } from "./freeDictionaryApi.ts";

export type RemoteDictionaryProvider = "free-dictionary-api" | "openrouter" | "fallback";
export type RemoteDictionaryStatus = "partial" | "translated" | "fallback";

export interface DictionaryRemoteFallbackOptions {
  word: string;
  sourceEntry?: DictionaryEntry | null;
  targetLanguage: TargetLanguage;
  fetchFreeDictionaryApi: (word: string, signal?: AbortSignal) => Promise<unknown>;
  translateWithOpenRouter: (
    sourceEntry: DictionaryEntry,
    targetLanguage: Exclude<TargetLanguage, "en">,
  ) => Promise<DictionaryEntry>;
  generateWithOpenRouter: (
    word: string,
    targetLanguage: Exclude<TargetLanguage, "en">,
  ) => Promise<DictionaryEntry>;
  signal?: AbortSignal;
}

export interface DictionaryRemoteFallbackResult {
  entry: DictionaryEntry | null;
  provider: RemoteDictionaryProvider;
  status: RemoteDictionaryStatus;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
}

function withPartialTranslation(
  sourceEntry: DictionaryEntry,
  raw: unknown,
  targetLanguage: Exclude<TargetLanguage, "en">,
): DictionaryEntry | null {
  return parseFreeDictionaryApiPartialTranslations(raw, sourceEntry, targetLanguage) as DictionaryEntry | null;
}

export async function resolveDictionaryRemoteFallback(
  options: DictionaryRemoteFallbackOptions,
): Promise<DictionaryRemoteFallbackResult> {
  const sourceEntry = options.sourceEntry ?? null;
  if (options.targetLanguage === "en") {
    return { entry: sourceEntry, provider: "fallback", status: "fallback" };
  }

  let freeDictionaryRaw: unknown;
  try {
    freeDictionaryRaw = await options.fetchFreeDictionaryApi(options.word, options.signal);
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    freeDictionaryRaw = undefined;
  }

  let remoteSource = sourceEntry;
  if (freeDictionaryRaw !== undefined) {
    if (sourceEntry) {
      const partial = withPartialTranslation(sourceEntry, freeDictionaryRaw, options.targetLanguage);
      if (partial) {
        return { entry: partial, provider: "free-dictionary-api", status: "partial" };
      }
    } else {
      remoteSource = parseFreeDictionaryApiSource(freeDictionaryRaw, options.word) as DictionaryEntry | null;
      if (remoteSource) {
        const partial = withPartialTranslation(remoteSource, freeDictionaryRaw, options.targetLanguage);
        if (partial) {
          return { entry: partial, provider: "free-dictionary-api", status: "partial" };
        }
      }
    }
  }

  try {
    if (remoteSource) {
      const translated = await options.translateWithOpenRouter(remoteSource, options.targetLanguage);
      if (translated) return { entry: translated, provider: "openrouter", status: "translated" };
    } else {
      const generated = await options.generateWithOpenRouter(options.word, options.targetLanguage);
      if (generated) return { entry: generated, provider: "openrouter", status: "translated" };
    }
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    // The English dictionary source is still useful when the optional remote translation fails.
  }

  return { entry: remoteSource, provider: "fallback", status: "fallback" };
}
