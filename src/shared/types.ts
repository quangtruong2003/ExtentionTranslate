export interface DictionaryEntry {
  word: string;
  language?: string;
  phonetics?: {
    uk?: string;
    us?: string;
    audioUk?: string;
    audioUs?: string;
  };
  wordForms?: string[];
  meanings: DictionaryMeaning[];
  source: DictionarySource;
}

export type DictionarySource = "free-api" | "free-dictionary-api" | "ai" | "cache";

export interface DictionaryMeaning {
  partOfSpeech?: string;
  cefr?: string;
  translation?: string;
  definition: string;
  examples?: string[];
  phrases?: DictionaryPhrase[];
  synonyms?: string[];
}

export interface DictionaryPhrase {
  phrase: string;
  translation?: string;
  meaning?: string;
}

export interface AIExplanation {
  contextualMeaning?: string;
  explanation?: string;
  grammarNote?: string;
  additionalExamples?: string[];
  raw?: string;
}

export interface LookupRequest {
  word: string;
  language?: string;
  targetLanguage?: TargetLanguage;
}

export interface LookupResponse {
  entry: DictionaryEntry | null;
  sourceEntry?: DictionaryEntry;
  translationStatus?: TranslationStatus;
  error?: string;
}

export interface DictionaryRemoteTranslationRequest {
  word: string;
  sourceEntry?: DictionaryEntry;
  targetLanguage: TargetLanguage;
  requestId?: number;
}

export interface DictionaryRemoteTranslationResponse {
  entry: DictionaryEntry | null;
  status: TranslationStatus;
  provider?: "free-dictionary-api" | "openrouter" | "fallback";
  error?: string;
}

export interface AIRequest {
  word: string;
  sentence?: string;
  contextBefore?: string;
  contextAfter?: string;
  targetLanguage?: TargetLanguage;
  pageLanguage?: string;
}

export interface AIResponse {
  structured: AIExplanation | null;
  raw: string;
  error?: string;
}

export type AIStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "thinking"; text: string }
  | { type: "done"; raw: string; thinking: string }
  | { type: "error"; code: string };

export type TargetLanguage = "en" | "vi" | "zh-CN";

export type SelectionTriggerMode = "icon" | "popup" | "off";

export type ThemePreference = "auto" | "light" | "dark";

export type OpenRouterReasoningEffort = "low" | "medium" | "high";

export const OPENROUTER_MAX_OUTPUT_TOKENS = { min: 512, max: 8192, default: 1600 } as const;
export const OPENROUTER_REASONING_MAX_TOKENS = { min: 1024, max: 8192 } as const;

export type StoredSettings = Partial<Omit<ExtensionSettings, "selectionTriggerMode">> & {
  selectionTriggerMode?: unknown;
  showPopupOnSelection?: unknown;
};

export type TranslationStatus = "source" | "translating" | "translated" | "partial" | "fallback";

export interface ExtensionSettings {
  selectionTriggerMode: SelectionTriggerMode;
  autoAskAIOnPopup: boolean;
  includeSelectionContext: boolean;
  targetLanguage: TargetLanguage;
  theme: ThemePreference;
  openRouterApiKey: string;
  openRouterModel: string;
  openRouterThinkingEnabled: boolean;
  openRouterReasoningEffort: OpenRouterReasoningEffort;
  openRouterReasoningMaxTokens: number | null;
  openRouterMaxTokens: number;
  systemPrompt: string;
}

export interface PopupSettings {
  selectionTriggerMode: SelectionTriggerMode;
  autoAskAIOnPopup: boolean;
  includeSelectionContext: boolean;
  targetLanguage: TargetLanguage;
  theme: ThemePreference;
  hasOpenRouterApiKey: boolean;
  openRouterThinkingEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectionTriggerMode: "icon",
  autoAskAIOnPopup: false,
  includeSelectionContext: true,
  targetLanguage: "vi",
  theme: "auto",
  openRouterApiKey: "",
  openRouterModel: "openrouter/auto",
  openRouterThinkingEnabled: true,
  openRouterReasoningEffort: "low",
  openRouterReasoningMaxTokens: null,
  openRouterMaxTokens: OPENROUTER_MAX_OUTPUT_TOKENS.default,
  systemPrompt: `You are an expert multilingual English dictionary editor and language tutor.
When the user selects a word or phrase, respond strictly in valid JSON (no markdown fences) using this exact schema:

{
  "word": string,
  "language": "en" | "vi" | "zh-CN",
  "partOfSpeech": string,
  "ipa": string,
  "translation": string,
  "definition": string,
  "cefr": "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "",
  "examples": string[],
  "phrases": Array<{ "phrase": string, "translation": string }>,
  "synonyms": string[],
  "contextualMeaning": string,
  "explanation": string,
  "grammarNote": string,
  "additionalExamples": string[]
}

Rules:
- Respect the language requested by this system prompt or by the user's message. Do not infer a target language from extension settings.
- Always provide a clear definition and a natural translation when the requested format calls for one.
- Highlight the most common usage for learners.
- Include 1–3 concise examples.
- Keep the explanation short (under 120 words).
  - Output JSON only, no prose, no code fences.`,
};

function isOpenRouterReasoningEffort(value: unknown): value is OpenRouterReasoningEffort {
  return value === "low" || value === "medium" || value === "high";
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function normalizeSettings(stored: StoredSettings | undefined): ExtensionSettings {
  const raw = stored ?? {};
  const requestedMode = raw.selectionTriggerMode;
  const selectionTriggerMode: SelectionTriggerMode = requestedMode === "icon" || requestedMode === "popup" || requestedMode === "off"
    ? requestedMode
    : raw.showPopupOnSelection === false
      ? "off"
      : "icon";
  const theme: ThemePreference = raw.theme === "light" || raw.theme === "dark" ? raw.theme : "auto";
  const includeSelectionContext = raw.includeSelectionContext !== false;
  const openRouterMaxTokens = isIntegerInRange(raw.openRouterMaxTokens, OPENROUTER_MAX_OUTPUT_TOKENS.min, OPENROUTER_MAX_OUTPUT_TOKENS.max)
    ? raw.openRouterMaxTokens
    : OPENROUTER_MAX_OUTPUT_TOKENS.default;
  const requestedReasoningMaxTokens = raw.openRouterReasoningMaxTokens;
  const openRouterReasoningMaxTokens = requestedReasoningMaxTokens === null
    ? null
    : isIntegerInRange(requestedReasoningMaxTokens, OPENROUTER_REASONING_MAX_TOKENS.min, OPENROUTER_REASONING_MAX_TOKENS.max)
      && requestedReasoningMaxTokens < openRouterMaxTokens
      ? requestedReasoningMaxTokens
      : null;
  const { selectionTriggerMode: _storedMode, showPopupOnSelection: _legacyMode, ...canonicalSettings } = raw;
  return {
    ...DEFAULT_SETTINGS,
    ...canonicalSettings,
    includeSelectionContext,
    selectionTriggerMode,
    theme,
    openRouterReasoningEffort: isOpenRouterReasoningEffort(raw.openRouterReasoningEffort)
      ? raw.openRouterReasoningEffort
      : DEFAULT_SETTINGS.openRouterReasoningEffort,
    openRouterReasoningMaxTokens,
    openRouterMaxTokens,
  };
}

export function getOpenRouterSettingsValidationError(
  settings: Pick<ExtensionSettings, "openRouterMaxTokens" | "openRouterReasoningMaxTokens">,
): string | null {
  if (!Number.isInteger(settings.openRouterMaxTokens)
      || settings.openRouterMaxTokens < OPENROUTER_MAX_OUTPUT_TOKENS.min
      || settings.openRouterMaxTokens > OPENROUTER_MAX_OUTPUT_TOKENS.max) {
    return "Max output tokens phải nằm trong khoảng 512–8192.";
  }
  if (settings.openRouterReasoningMaxTokens !== null
      && (!Number.isInteger(settings.openRouterReasoningMaxTokens)
        || settings.openRouterReasoningMaxTokens < OPENROUTER_REASONING_MAX_TOKENS.min
        || settings.openRouterReasoningMaxTokens > OPENROUTER_REASONING_MAX_TOKENS.max)) {
    return "Reasoning budget phải nằm trong khoảng 1024–8192 hoặc để trống.";
  }
  if (settings.openRouterReasoningMaxTokens !== null
      && settings.openRouterReasoningMaxTokens >= settings.openRouterMaxTokens) {
    return "Reasoning budget phải nhỏ hơn Max output tokens.";
  }
  return null;
}

export function toPopupSettings(settings: ExtensionSettings): PopupSettings {
  return {
    selectionTriggerMode: settings.selectionTriggerMode,
    autoAskAIOnPopup: settings.autoAskAIOnPopup,
    includeSelectionContext: settings.includeSelectionContext,
    targetLanguage: settings.targetLanguage,
    theme: settings.theme,
    hasOpenRouterApiKey: settings.openRouterApiKey.trim().length > 0,
    openRouterThinkingEnabled: settings.openRouterThinkingEnabled,
  };
}

export const DEFAULT_POPUP_SETTINGS: PopupSettings = toPopupSettings(DEFAULT_SETTINGS);

export const SUPPORTED_TARGET_LANGUAGES: Array<{ value: TargetLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "zh-CN", label: "简体中文" },
];

export const SELECTION_TRIGGER_MODE_LABELS: Record<SelectionTriggerMode, string> = {
  icon: "Hiện icon cạnh vùng chọn",
  popup: "Mở popup ngay khi bôi đen",
  off: "Tắt thao tác khi bôi đen",
};
