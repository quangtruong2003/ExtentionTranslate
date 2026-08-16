import type { DictionaryEntry, TargetLanguage } from "@/shared/types";

const TERMINAL_PUNCTUATION = /[.!?。！？…]$/u;
const COMPACT_GRAMMAR_TOKEN = /^(?:[NV]|[A-Z]{1,4}\d+)(?:[/-](?:[NV]|[A-Z]{1,4}\d+))*$/u;

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/gu, " ");
}

function capitalizeFirstLetter(text: string, language: TargetLanguage): string {
  if (language === "zh-CN") return text;
  return text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase(language));
}

function hasTerminalPunctuation(text: string): boolean {
  return TERMINAL_PUNCTUATION.test(text);
}

function isCompactGrammarToken(text: string): boolean {
  return COMPACT_GRAMMAR_TOKEN.test(text);
}

export function normalizeSentencePresentation(text: string, language: TargetLanguage): string {
  const normalized = capitalizeFirstLetter(normalizeWhitespace(text), language);
  if (!normalized || hasTerminalPunctuation(normalized) || isCompactGrammarToken(normalized)) return normalized;
  return `${normalized}${language === "zh-CN" ? "。" : "."}`;
}

function normalizeMeaningPresentation(
  meaning: DictionaryEntry["meanings"][number],
  language: TargetLanguage,
): DictionaryEntry["meanings"][number] {
  const normalized = {
    ...meaning,
    definition: normalizeSentencePresentation(meaning.definition, language),
  };
  if (meaning.translation !== undefined) {
    normalized.translation = normalizeSentencePresentation(meaning.translation, language);
  }
  if (meaning.examples !== undefined) {
    normalized.examples = meaning.examples.map((example) => normalizeSentencePresentation(example, language));
  }
  return normalized;
}

export function normalizeDictionaryPresentation(entry: DictionaryEntry, language: TargetLanguage): DictionaryEntry {
  return {
    ...entry,
    meanings: entry.meanings.map((meaning) => normalizeMeaningPresentation(meaning, language)),
  };
}
