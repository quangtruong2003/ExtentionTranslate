export const MESSAGE_TYPES = {
  GET_SETTINGS: "GET_SETTINGS",
  GET_POPUP_SETTINGS: "GET_POPUP_SETTINGS",
  SAVE_SETTINGS: "SAVE_SETTINGS",
  DICTIONARY_LOOKUP: "DICTIONARY_LOOKUP",
  DICTIONARY_TRANSLATE_REMOTE: "DICTIONARY_TRANSLATE_REMOTE",
  DICTIONARY_TRANSLATE_CANCEL: "DICTIONARY_TRANSLATE_CANCEL",
  PRONUNCIATION_FETCH: "PRONUNCIATION_FETCH",
  AI_EXPLAIN: "AI_EXPLAIN",
  AI_EXPLAIN_STREAM: "AI_EXPLAIN_STREAM",
  OPEN_SETTINGS: "OPEN_SETTINGS",
  GET_MODELS: "GET_MODELS",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export const AI_STREAM_PORT_NAME = "ai-explain-stream";

export const MAX_SELECTION_LENGTH = 200;
export const SELECTION_DEBOUNCE_MS = 220;
export const POPUP_MAX_WIDTH = 560;
export const POPUP_VIEWPORT_PADDING = 12;
export const POPUP_MAX_HEIGHT = "min(680px, calc(100vh - 24px))";

export const FREE_DICTIONARY_ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
export const FREE_DICTIONARY_API_ENDPOINT = "https://freedictionaryapi.com/api/v1/entries/en/";
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_DEFAULT_MODEL = "openrouter/auto";
export const OPENROUTER_RECOMMENDED_MODELS = [
  "openrouter/auto",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.1-70b-instruct",
];

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const CACHE_MAX_ENTRIES = 80;

export const POPUP_HOST_ID = "extention-translate-host";
