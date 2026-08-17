import type { OpenRouterReasoningEffort } from "@/shared/types";

export interface OpenRouterPromptRequest {
  word: string;
  sentence?: string;
  contextBefore?: string;
  contextAfter?: string;
  pageLanguage?: string;
  /** Kept for compatibility with older callers; it is never sent to the AI tab. */
  targetLanguage?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  followUpQuestion?: string;
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const AI_STREAM_MAX_TOKENS = 1600;

export interface OpenRouterGenerationOptions {
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: OpenRouterReasoningEffort;
  reasoningMaxTokens?: number | null;
  maxTokens?: number;
}

function supportsReasoningOptions(model: string | undefined): boolean {
  const normalizedModel = model?.trim().toLowerCase();
  return normalizedModel !== "openrouter/auto" && normalizedModel !== "openrouter/free";
}

export function buildOpenRouterGenerationParameters(options: OpenRouterGenerationOptions = {}) {
  const thinkingEnabled = options.thinkingEnabled ?? true;
  const reasoningMaxTokens = options.reasoningMaxTokens ?? null;
  const reasoning = !thinkingEnabled
    ? null
    : reasoningMaxTokens !== null
      ? { max_tokens: reasoningMaxTokens }
      : { effort: (options.reasoningEffort ?? "low") as OpenRouterReasoningEffort };
  return {
    max_tokens: options.maxTokens ?? AI_STREAM_MAX_TOKENS,
    ...(reasoning !== null && supportsReasoningOptions(options.model) ? { reasoning } : {}),
  };
}

export function buildOpenRouterMessages(
  systemPrompt: string,
  req: OpenRouterPromptRequest,
): OpenRouterMessage[] {
  const userParts: string[] = [];
  userParts.push(`Selected text: ${req.word}`);
  if (req.sentence) userParts.push(`Sentence: ${req.sentence}`);
  if (req.contextBefore) userParts.push(`Before context: ${req.contextBefore}`);
  if (req.contextAfter) userParts.push(`After context: ${req.contextAfter}`);
  if (req.pageLanguage) userParts.push(`Page language: ${req.pageLanguage}`);
  if (req.followUpQuestion) userParts.push(`Follow-up question: ${req.followUpQuestion}`);

  return [
    { role: "system", content: systemPrompt },
    ...(req.history ?? []).map((item): OpenRouterMessage => ({ role: item.role, content: item.content })),
    { role: "user", content: userParts.join("\n") },
  ];
}

export function buildOpenRouterStreamBody(
  model: string,
  messages: OpenRouterMessage[],
  thinkingEnabled: boolean,
  options: Omit<OpenRouterGenerationOptions, "thinkingEnabled"> = {},
) {
  return {
    model,
    messages,
    temperature: 0.2,
    ...buildOpenRouterGenerationParameters({ ...options, model, thinkingEnabled }),
    stream: true,
  };
}

export function buildDictionaryTranslationMessages(
  entry: unknown,
  targetLanguage: "vi" | "zh-CN",
): OpenRouterMessage[] {
  const targetLabel = targetLanguage === "vi" ? "Vietnamese" : "Simplified Chinese";
  const systemPrompt = [
    "You translate dictionary data while preserving its exact JSON shape.",
    `Translate definitions, examples, parts of speech, phrases, and synonyms into ${targetLabel}.`,
    "Keep the word, IPA, phonetics, and audio URLs unchanged.",
    "Return JSON only with a meanings array and no markdown.",
  ].join(" ");
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(entry) },
  ];
}

export function buildDictionaryLookupMessages(
  word: string,
  targetLanguage: "vi" | "zh-CN",
): OpenRouterMessage[] {
  const targetLabel = targetLanguage === "vi" ? "Vietnamese" : "Simplified Chinese";
  const systemPrompt = [
    "Create a concise dictionary entry for the selected English word.",
    `Write the definition and natural translation in ${targetLabel}.`,
    "Return JSON only with word, language, partOfSpeech, ipa, translation, definition, examples, phrases, and synonyms.",
    "Keep examples short and phrases as an array of {phrase, translation} objects.",
  ].join(" ");
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify({ word, language: targetLanguage }) },
  ];
}
