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

export type StoredSettings = Partial<Omit<ExtensionSettings, "selectionTriggerMode">> & {
  selectionTriggerMode?: unknown;
  showPopupOnSelection?: unknown;
};

export type TranslationStatus = "source" | "translating" | "translated" | "partial" | "fallback";

export interface ExtensionSettings {
  selectionTriggerMode: SelectionTriggerMode;
  autoAskAIOnPopup: boolean;
  targetLanguage: TargetLanguage;
  openRouterApiKey: string;
  openRouterModel: string;
  openRouterThinkingEnabled: boolean;
  systemPrompt: string;
}

export interface PopupSettings {
  selectionTriggerMode: SelectionTriggerMode;
  autoAskAIOnPopup: boolean;
  targetLanguage: TargetLanguage;
  hasOpenRouterApiKey: boolean;
  openRouterThinkingEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectionTriggerMode: "icon",
  autoAskAIOnPopup: false,
  targetLanguage: "vi",
  openRouterApiKey: "",
  openRouterModel: "openrouter/auto",
  openRouterThinkingEnabled: true,
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

export function normalizeSettings(stored: StoredSettings | undefined): ExtensionSettings {
  const raw = stored ?? {};
  const requestedMode = raw.selectionTriggerMode;
  const selectionTriggerMode: SelectionTriggerMode = requestedMode === "icon" || requestedMode === "popup" || requestedMode === "off"
    ? requestedMode
    : raw.showPopupOnSelection === false
      ? "off"
      : "icon";
  const { selectionTriggerMode: _storedMode, showPopupOnSelection: _legacyMode, ...canonicalSettings } = raw;
  return {
    ...DEFAULT_SETTINGS,
    ...canonicalSettings,
    selectionTriggerMode,
  };
}

export function toPopupSettings(settings: ExtensionSettings): PopupSettings {
  return {
    selectionTriggerMode: settings.selectionTriggerMode,
    autoAskAIOnPopup: settings.autoAskAIOnPopup,
    targetLanguage: settings.targetLanguage,
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
