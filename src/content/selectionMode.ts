export type BrowserSourceLanguage = "en" | "vi" | "zh";

export type SelectionMode =
  | { kind: "word"; sourceText: string; lookupText: string }
  | { kind: "text"; sourceText: string };

const HORIZONTAL_WHITESPACE = /[\t\f\v \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;
const SURROUNDING_SYMBOLS = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const WORD_PATTERN =
  /^(?:[\p{L}\p{M}]+(?:['\u2019\u02BC\uFF07\u2010-\u2015\u2212-][\p{L}\p{M}]+)*)$/u;
const CJK_SCRIPT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

interface IntlSegment {
  segment: string;
  isWordLike?: boolean;
}

interface IntlSegmenter {
  segment(input: string): Iterable<IntlSegment>;
}

type IntlSegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity?: "grapheme" | "word" | "sentence" },
) => IntlSegmenter;

export function classifySelection(rawText: string): SelectionMode {
  const sourceText = normalizeSelectionSource(rawText);
  const lookupText = sourceText.replace(SURROUNDING_SYMBOLS, "");

  if (lookupText && WORD_PATTERN.test(lookupText) && isSingleLexicalSelection(lookupText)) {
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

function isSingleLexicalSelection(lookupText: string): boolean {
  if (!CJK_SCRIPT_PATTERN.test(lookupText)) return true;
  return isSingleCjkLexicalSegment(lookupText);
}

function isSingleCjkLexicalSegment(lookupText: string): boolean {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: IntlSegmenterConstructor }).Segmenter;

  if (Segmenter) {
    const wordLikeSegments = [...new Segmenter("zh", { granularity: "word" }).segment(lookupText)].filter((segment) =>
      segment.isWordLike ?? WORD_PATTERN.test(segment.segment),
    );
    return wordLikeSegments.length === 1 && wordLikeSegments[0]?.segment === lookupText;
  }

  return [...lookupText].length === 1;
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
