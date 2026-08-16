import { ERROR_CODES, ExtensionError } from "@/shared/errors";
import { OPENROUTER_ENDPOINT } from "@/shared/constants";
import type { AIExplanation, AIRequest, DictionaryEntry, DictionaryPhrase, TargetLanguage } from "@/shared/types";
import type { OpenRouterModel, OpenRouterModelsResponse } from "@/shared/openrouter-types";
import { extractFirstJSONObject } from "@/shared/utils";
import { consumeOpenRouterStream } from "./sse";
import { buildDictionaryLookupMessages, buildDictionaryTranslationMessages, buildOpenRouterGenerationParameters, buildOpenRouterMessages, buildOpenRouterStreamBody } from "./messages";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; code?: number | string };
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  reasoningMaxTokens?: number | null;
  maxTokens?: number;
  signal?: AbortSignal;
}

function parseAIExplanation(raw: string): AIExplanation | null {
  const structured = extractFirstJSONObject<Record<string, unknown>>(raw);
  if (!structured) return null;
  return {
    contextualMeaning: typeof structured.contextualMeaning === "string" ? structured.contextualMeaning : undefined,
    explanation: typeof structured.explanation === "string" ? structured.explanation : undefined,
    grammarNote: typeof structured.grammarNote === "string" ? structured.grammarNote : undefined,
    additionalExamples: Array.isArray(structured.additionalExamples)
      ? structured.additionalExamples.filter((value): value is string => typeof value === "string")
      : undefined,
    raw,
  };
}

function assertConfig(config: Pick<OpenRouterConfig, "apiKey" | "model">) {
  if (!config.apiKey) {
    throw new ExtensionError(ERROR_CODES.MISSING_API_KEY, "", false);
  }
  if (!config.model) {
    throw new ExtensionError(ERROR_CODES.UNKNOWN_MODEL, "", false);
  }
}

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 401) {
    throw new ExtensionError(ERROR_CODES.INVALID_API_KEY, "", false);
  }
  if (response.status === 404 || response.status === 400) {
    const text = await response.text().catch(() => "");
    if (/model/i.test(text)) {
      throw new ExtensionError(ERROR_CODES.UNKNOWN_MODEL, "", false);
    }
    throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, `HTTP ${response.status}`, true);
  }
  if (response.status === 429) {
    throw new ExtensionError(ERROR_CODES.RATE_LIMITED, "", true);
  }
  throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, `HTTP ${response.status}`, true);
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  req: AIRequest,
): Promise<{ structured: AIExplanation | null; raw: string }> {
  assertConfig(config);

  const messages = buildOpenRouterMessages(config.systemPrompt, req);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: config.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://extention-translate.local",
        "X-Title": "ExtentionTranslate",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        ...buildOpenRouterGenerationParameters({
          thinkingEnabled: config.thinkingEnabled ?? true,
          reasoningEffort: config.reasoningEffort,
          reasoningMaxTokens: config.reasoningMaxTokens,
          maxTokens: config.maxTokens,
        }),
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }

  await assertResponse(response);

  const json = (await response.json()) as ChatCompletionResponse;
  if (json.error?.message) {
    if (/api.?key/i.test(json.error.message)) {
      throw new ExtensionError(ERROR_CODES.INVALID_API_KEY, "", false);
    }
    if (/model/i.test(json.error.message)) {
      throw new ExtensionError(ERROR_CODES.UNKNOWN_MODEL, "", false);
    }
    if (/rate|limit/i.test(json.error.message)) {
      throw new ExtensionError(ERROR_CODES.RATE_LIMITED, "", true);
    }
    throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, json.error.message, true);
  }

  const content = json.choices?.[0]?.message?.content ?? "";
  return { structured: parseAIExplanation(content), raw: content };
}

export interface StreamOpenRouterResult {
  structured: AIExplanation | null;
  raw: string;
  thinking: string;
}

export async function streamOpenRouter(
  config: OpenRouterConfig,
  req: AIRequest,
  onChunk: (text: string) => void,
  onThinking: (text: string) => void = () => undefined,
): Promise<StreamOpenRouterResult> {
  assertConfig(config);
  const messages = buildOpenRouterMessages(config.systemPrompt, req);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: config.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://extention-translate.local",
        "X-Title": "ExtentionTranslate",
      },
      body: JSON.stringify(buildOpenRouterStreamBody(config.model, messages, config.thinkingEnabled ?? true, {
        reasoningEffort: config.reasoningEffort,
        reasoningMaxTokens: config.reasoningMaxTokens,
        maxTokens: config.maxTokens,
      })),
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }

  await assertResponse(response);
  if (!response.body) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);

  const result = await consumeOpenRouterStream(response.body, onChunk, onThinking);
  return { raw: result.raw, thinking: result.thinking, structured: null };
}

export async function translateDictionaryEntryWithOpenRouter(
  config: Pick<OpenRouterConfig, "apiKey" | "model" | "signal">,
  entry: DictionaryEntry,
  targetLanguage: Exclude<TargetLanguage, "en">,
): Promise<unknown> {
  assertConfig(config);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: config.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://extention-translate.local",
        "X-Title": "ExtentionTranslate",
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildDictionaryTranslationMessages(entry, targetLanguage),
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }
  await assertResponse(response);
  const json = (await response.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content ?? "";
  const structured = extractFirstJSONObject<Record<string, unknown>>(content);
  if (!structured) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);
  return structured;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return values.length ? values : undefined;
}

function parseGeneratedDictionaryEntry(raw: unknown, word: string, targetLanguage: Exclude<TargetLanguage, "en">): DictionaryEntry {
  if (!raw || typeof raw !== "object") throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);
  const data = raw as Record<string, unknown>;
  const firstMeaning = Array.isArray(data.meanings) && data.meanings[0] && typeof data.meanings[0] === "object"
    ? data.meanings[0] as Record<string, unknown>
    : data;
  const definition = optionalString(data.definition) ?? optionalString(firstMeaning.definition);
  if (!definition) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);

  const phrases = Array.isArray(data.phrases)
    ? data.phrases
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
        .map((phrase): DictionaryPhrase | null => {
          const text = optionalString(phrase.phrase);
          if (!text) return null;
          return { phrase: text, translation: optionalString(phrase.translation) };
        })
        .filter((phrase): phrase is DictionaryPhrase => phrase !== null)
    : undefined;
  const ipa = optionalString(data.ipa);
  return {
    word: optionalString(data.word) ?? word,
    language: targetLanguage,
    phonetics: ipa ? { uk: ipa, us: ipa } : undefined,
    meanings: [{
      partOfSpeech: optionalString(data.partOfSpeech) ?? optionalString(firstMeaning.partOfSpeech),
      translation: optionalString(data.translation) ?? optionalString(firstMeaning.translation),
      definition,
      examples: stringArray(data.examples) ?? stringArray(firstMeaning.examples),
      phrases,
      synonyms: stringArray(data.synonyms) ?? stringArray(firstMeaning.synonyms),
    }],
    source: "ai",
  };
}

export async function generateDictionaryEntryWithOpenRouter(
  config: Pick<OpenRouterConfig, "apiKey" | "model" | "signal">,
  word: string,
  targetLanguage: Exclude<TargetLanguage, "en">,
): Promise<DictionaryEntry> {
  assertConfig(config);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      signal: config.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://extention-translate.local",
        "X-Title": "ExtentionTranslate",
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildDictionaryLookupMessages(word, targetLanguage),
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }
  await assertResponse(response);
  const json = (await response.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content ?? "";
  const structured = extractFirstJSONObject<Record<string, unknown>>(content);
  if (!structured) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "", true);
  return parseGeneratedDictionaryEntry(structured, word, targetLanguage);
}

const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

export interface FetchModelsOptions {
  apiKey: string;
  query?: string;
  signal?: AbortSignal;
}

export async function fetchOpenRouterModels(options: FetchModelsOptions): Promise<OpenRouterModel[]> {
  const { apiKey, query, signal } = options;

  if (!apiKey) {
    throw new ExtensionError(ERROR_CODES.MISSING_API_KEY, "", false);
  }

  const params = new URLSearchParams({ limit: "500" });
  if (query?.trim()) {
    params.set("q", query.trim());
    params.set("sort", "most-popular");
  }

  const url = `${MODELS_ENDPOINT}?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://extention-translate.local",
        "X-Title": "ExtentionTranslate",
      },
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }

  if (response.status === 401) {
    throw new ExtensionError(ERROR_CODES.INVALID_API_KEY, "", false);
  }
  if (!response.ok) {
    throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, `HTTP ${response.status}`, true);
  }

  const json = (await response.json()) as OpenRouterModelsResponse;
  return json.data ?? [];
}

interface StreamChatCompletionResponse {
  choices?: Array<{ delta?: { content?: string } }>;
}
