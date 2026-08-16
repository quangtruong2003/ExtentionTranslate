export type BrowserSourceLanguage = "en" | "vi" | "zh";

export type SelectionMode =
  | { kind: "word"; sourceText: string; lookupText: string }
  | { kind: "text"; sourceText: string };

const HORIZONTAL_WHITESPACE = /[\t\f\v \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;
const SURROUNDING_SYMBOLS = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const WORD_PATTERN =
  /^(?:[\p{L}\p{M}]+(?:['\u2019\u02BC\uFF07\u2010-\u2015\u2212-][\p{L}\p{M}]+)*)$/u;
const CJK_SCRIPT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HAN_SCRIPT_PATTERN = /\p{Script=Han}/u;
const LATIN_LETTER_PATTERN = /\p{Script=Latin}/u;
const VIETNAMESE_LETTER_PATTERN = /[ăâđêôơưĂÂĐÊÔƠƯ]/u;
const WORD_TOKEN_PATTERN = /\p{L}+/gu;

const ENGLISH_HINTS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "how", "i", "if", "in", "is", "it", "me", "my", "not", "of",
  "on", "or", "that", "the", "their", "them", "there", "these", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "would", "you", "your",
]);

const VIETNAMESE_HINTS = new Set([
  "a", "ban", "cac", "chao", "cho", "cua", "da", "dang", "duoc", "do", "gi", "ho", "khong", "khi", "la",
  "mot", "nao", "nay", "nhu", "nhung", "rat", "sao", "se", "toi", "trong", "va", "vi", "voi", "xin",
]);

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

export function detectSelectionSourceLanguage(selectionText: string, pageLanguage?: string): BrowserSourceLanguage {
  const text = selectionText.trim();
  if (HAN_SCRIPT_PATTERN.test(text)) return "zh";

  const tokens = text.match(WORD_TOKEN_PATTERN)?.map(normalizeLanguageToken) ?? [];
  const englishScore = tokens.reduce((score, token) => score + (ENGLISH_HINTS.has(token) ? 1 : 0), 0);
  const vietnameseScore = tokens.reduce((score, token) => score + (VIETNAMESE_HINTS.has(token) ? 1 : 0), 0)
    + (VIETNAMESE_LETTER_PATTERN.test(text) ? 2 : 0);

  if (vietnameseScore > englishScore && vietnameseScore > 0) return "vi";
  if (englishScore > vietnameseScore && englishScore > 0) return "en";

  // This extension primarily translates English learning content. An ambiguous
  // Latin selection should therefore not inherit a site's UI locale, such as
  // Facebook's `lang="vi"`, when the selected post text is English.
  if (LATIN_LETTER_PATTERN.test(text)) return "en";

  return normalizeBrowserSourceLanguage(pageLanguage) ?? "en";
}

function normalizeLanguageToken(token: string): string {
  return token
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gu, "d")
    .toLowerCase();
}

function normalizeSelectionSource(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL_WHITESPACE, " ").trim())
    .join("\n")
    .trim();
}
