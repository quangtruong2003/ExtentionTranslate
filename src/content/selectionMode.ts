export type BrowserSourceLanguage = "en" | "vi" | "zh";

export type SelectionMode =
  | { kind: "word"; sourceText: string; lookupText: string }
  | { kind: "text"; sourceText: string };

const HORIZONTAL_WHITESPACE = /[\t\f\v \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;
const SURROUNDING_SYMBOLS = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const WORD_PATTERN =
  /^(?:[\p{L}\p{M}]+(?:['\u2019\u02BC\uFF07\u2010-\u2015\u2212-][\p{L}\p{M}]+)*)$/u;

export function classifySelection(rawText: string): SelectionMode {
  const sourceText = normalizeSelectionSource(rawText);
  const lookupText = sourceText.replace(SURROUNDING_SYMBOLS, "");

  if (lookupText && WORD_PATTERN.test(lookupText)) {
    return {
      kind: "word",
      sourceText,
      lookupText,
    };
  }

  return {
    kind: "text",
    sourceText,
  };
}

export function normalizeBrowserSourceLanguage(pageLanguage?: string): BrowserSourceLanguage | undefined {
  const normalized = pageLanguage?.trim().toLowerCase();
  if (!normalized) return undefined;

  const primaryLanguage = normalized.split(/[-_]/, 1)[0];
  if (primaryLanguage === "en" || primaryLanguage === "vi" || primaryLanguage === "zh") {
    return primaryLanguage;
  }

  return undefined;
}

function normalizeSelectionSource(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL_WHITESPACE, " ").trim())
    .join("\n")
    .trim();
}
