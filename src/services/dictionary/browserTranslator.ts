import type { BrowserSourceLanguage } from "@/content/selectionMode";
import type { DictionaryEntry, DictionaryMeaning, DictionaryPhrase, TargetLanguage } from "@/shared/types";

export type BrowserTranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export interface BrowserTranslatorSession {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

export type BrowserLanguage = BrowserSourceLanguage;

export interface BrowserTranslatorFactory {
  availability(options: { sourceLanguage: BrowserLanguage; targetLanguage: BrowserLanguage }): Promise<BrowserTranslatorAvailability>;
  create(options: {
    sourceLanguage: BrowserLanguage;
    targetLanguage: BrowserLanguage;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<BrowserTranslatorSession>;
}

type BrowserTargetLanguage = "vi" | "zh";
type BrowserSessionKey = `${BrowserLanguage}->${BrowserLanguage}`;

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
}

function toTrimmedText(value: string): string {
  return value.trim();
}

async function translateNonEmptyText(
  session: BrowserTranslatorSession,
  value: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const translated = await session.translate(toTrimmedText(value), { signal });
  const trimmed = translated.trim();
  if (!trimmed) {
    throw new Error("browser translator returned an empty string");
  }
  return trimmed;
}

async function translateOptionalText(
  session: BrowserTranslatorSession,
  value: string | undefined,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!value?.trim()) return undefined;
  return translateNonEmptyText(session, value, signal);
}

async function translatePhrase(
  session: BrowserTranslatorSession,
  phrase: DictionaryPhrase,
  signal?: AbortSignal,
): Promise<DictionaryPhrase> {
  const translatedPhrase = await translateNonEmptyText(session, phrase.phrase, signal);
  const translatedTranslation = await translateOptionalText(session, phrase.translation, signal);
  const translatedMeaning = await translateOptionalText(session, phrase.meaning, signal);
  return {
    phrase: translatedPhrase,
    translation: translatedTranslation,
    meaning: translatedMeaning,
  };
}

async function translateMeaning(
  session: BrowserTranslatorSession,
  meaning: DictionaryMeaning,
  signal?: AbortSignal,
): Promise<DictionaryMeaning> {
  const translated: Partial<DictionaryMeaning> = {};
  const partOfSpeech = await translateOptionalText(session, meaning.partOfSpeech, signal);
  if (partOfSpeech) translated.partOfSpeech = partOfSpeech;

  const meaningTranslation = await translateOptionalText(session, meaning.translation, signal);
  if (meaningTranslation) translated.translation = meaningTranslation;

  translated.definition = await translateNonEmptyText(session, meaning.definition, signal);

  if (meaning.examples?.length) {
    translated.examples = [];
    for (const example of meaning.examples) {
      translated.examples.push(await translateNonEmptyText(session, example, signal));
    }
  }

  if (meaning.phrases?.length) {
    translated.phrases = [];
    for (const phrase of meaning.phrases) {
      translated.phrases.push(await translatePhrase(session, phrase, signal));
    }
  }

  if (meaning.synonyms?.length) {
    translated.synonyms = [];
    for (const synonym of meaning.synonyms) {
      translated.synonyms.push(await translateNonEmptyText(session, synonym, signal));
    }
  }

  return translated as DictionaryMeaning;
}

async function translateDictionaryEntryWithSessionOrNull(
  entry: DictionaryEntry,
  targetLanguage: Exclude<TargetLanguage, "en">,
  session: BrowserTranslatorSession,
  signal?: AbortSignal,
): Promise<DictionaryEntry | null> {
  try {
    const meanings: DictionaryMeaning[] = [];
    for (const meaning of entry.meanings) {
      meanings.push(await translateMeaning(session, meaning, signal));
    }

    return {
      word: entry.word,
      language: targetLanguage,
      phonetics: entry.phonetics,
      wordForms: entry.wordForms,
      meanings,
      source: entry.source,
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      return null;
    }
    return null;
  }
}

export async function translateDictionaryEntryWithSession(
  entry: DictionaryEntry,
  targetLanguage: Exclude<TargetLanguage, "en">,
  session: BrowserTranslatorSession,
  signal?: AbortSignal,
): Promise<DictionaryEntry | null> {
  return translateDictionaryEntryWithSessionOrNull(entry, targetLanguage, session, signal);
}

export function toBrowserTargetLanguage(targetLanguage: Exclude<TargetLanguage, "en">): BrowserTargetLanguage {
  return targetLanguage === "zh-CN" ? "zh" : "vi";
}

export class BrowserDictionaryTranslator {
  private readonly getFactory: () => BrowserTranslatorFactory | undefined;

  private readonly sessionPromises = new Map<BrowserSessionKey, Promise<BrowserTranslatorSession | null>>();

  private readonly sessions = new Map<BrowserSessionKey, BrowserTranslatorSession>();

  private destroyed = false;

  constructor(getFactory?: () => BrowserTranslatorFactory | undefined) {
    this.getFactory =
      getFactory ??
      (() => {
        const translator = (globalThis as { Translator?: BrowserTranslatorFactory }).Translator;
        return translator;
      });
  }

  async warm(targetLanguage: Exclude<TargetLanguage, "en">): Promise<void> {
    void (await this.getSession("en", toBrowserTargetLanguage(targetLanguage)));
  }

  async translate(
    entry: DictionaryEntry,
    targetLanguage: Exclude<TargetLanguage, "en">,
    signal?: AbortSignal,
  ): Promise<DictionaryEntry | null> {
    const browserTargetLanguage = toBrowserTargetLanguage(targetLanguage);
    const session = await this.getSession("en", browserTargetLanguage);
    if (!session) return null;

    const translated = await translateDictionaryEntryWithSession(entry, targetLanguage, session, signal);
    if (translated) return translated;

    if (!signal?.aborted) {
      this.dropSession("en", browserTargetLanguage, session);
    }

    return null;
  }

  async translateText(
    input: string,
    sourceLanguage: BrowserLanguage,
    targetLanguage: BrowserLanguage,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const trimmed = toTrimmedText(input);
    if (sourceLanguage === targetLanguage) return trimmed;

    const session = await this.getSession(sourceLanguage, targetLanguage);
    if (!session) return null;

    try {
      return await translateNonEmptyText(session, trimmed, signal);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        return null;
      }
      this.dropSession(sourceLanguage, targetLanguage, session);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    this.sessionPromises.clear();

    for (const session of sessions) {
      try {
        session.destroy();
      } catch {
        // Destroy is best-effort cleanup.
      }
    }
  }

  private dropSession(
    sourceLanguage: BrowserLanguage,
    targetLanguage: BrowserLanguage,
    session: BrowserTranslatorSession,
  ): void {
    const key = this.toSessionKey(sourceLanguage, targetLanguage);
    if (this.sessions.get(key) !== session) return;
    this.sessions.delete(key);
    try {
      session.destroy();
    } catch {
      // Failed sessions are best-effort cleanup.
    }
  }

  private async getSession(sourceLanguage: BrowserLanguage, targetLanguage: BrowserLanguage): Promise<BrowserTranslatorSession | null> {
    if (this.destroyed) return null;

    const key = this.toSessionKey(sourceLanguage, targetLanguage);
    const existingSession = this.sessions.get(key);
    if (existingSession) return existingSession;

    const existingPromise = this.sessionPromises.get(key);
    if (existingPromise) return existingPromise;

    const promise = this.createSession(sourceLanguage, targetLanguage).finally(() => {
      this.sessionPromises.delete(key);
    });
    this.sessionPromises.set(key, promise);

    const session = await promise;
    if (!session) return null;

    if (this.destroyed) {
      try {
        session.destroy();
      } catch {
        // Best-effort cleanup after late completion.
      }
      return null;
    }

    this.sessions.set(key, session);
    return session;
  }

  private async createSession(
    sourceLanguage: BrowserLanguage,
    targetLanguage: BrowserLanguage,
  ): Promise<BrowserTranslatorSession | null> {
    const factory = this.getFactory();
    if (!factory) return null;

    try {
      const availability = await factory.availability({
        sourceLanguage,
        targetLanguage,
      });

      if (availability === "unavailable") return null;

      return await factory.create({
        sourceLanguage,
        targetLanguage,
      });
    } catch {
      return null;
    }
  }

  private toSessionKey(sourceLanguage: BrowserLanguage, targetLanguage: BrowserLanguage): BrowserSessionKey {
    return `${sourceLanguage}->${targetLanguage}`;
  }
}
