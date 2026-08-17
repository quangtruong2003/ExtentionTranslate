import type { DictionaryEntry } from "@/shared/types";

export interface DictionarySourceRaceOptions {
  word: string;
  fetchPrimary: (signal?: AbortSignal) => Promise<DictionaryEntry>;
  fetchSecondary: (signal?: AbortSignal) => Promise<DictionaryEntry | null>;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: string }).name === "AbortError";
}

// Races dictionaryapi.dev against freedictionaryapi.com. The primary source
// wins when both succeed; either source alone still resolves; only when both
// fail does the primary's error propagate.
export async function raceDictionarySources(options: DictionarySourceRaceOptions): Promise<DictionaryEntry> {
  const { signal } = options;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const primary = options.fetchPrimary(signal);
  const secondary = options.fetchSecondary(signal);
  const secondarySettled = secondary.then(
    (entry) => ({ ok: true as const, entry }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  try {
    return await primary;
  } catch (primaryError) {
    if (isAbortError(primaryError) || signal?.aborted) throw primaryError;
    const secondaryResult = await secondarySettled;
    if (secondaryResult.ok && secondaryResult.entry) return secondaryResult.entry;
    throw primaryError;
  }
}

export class InflightDedupe {
  private readonly inflight = new Map<string, Promise<unknown>>();

  async run<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = factory().finally(() => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
