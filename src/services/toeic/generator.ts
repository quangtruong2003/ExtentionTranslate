// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import { OPENROUTER_ENDPOINT } from "../../shared/constants.ts";
// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import { ERROR_CODES, ExtensionError } from "../../shared/errors.ts";
// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import { extractFirstJSONObject } from "../../shared/utils.ts";
// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import type { TargetLanguage } from "../../shared/types.ts";
// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import { buildToeicQuizPrompt } from "./prompt.ts";
// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import type { ToeicQuestion, ToeicQuizPayload } from "./types.ts";

export interface ToeicQuizConfig {
  apiKey: string;
  model: string;
  questionCount: number;
  targetLanguage: TargetLanguage;
  signal?: AbortSignal;
}

export function parseToeicQuizResponse(raw: string, expectedCount: number): ToeicQuizPayload | null {
  const parsed = extractFirstJSONObject<{ questions?: unknown }>(raw);
  if (!parsed || !Array.isArray(parsed.questions)) return null;
  if (parsed.questions.length !== expectedCount) return null;

  const questions: ToeicQuestion[] = [];
  for (let i = 0; i < parsed.questions.length; i++) {
    const item = parsed.questions[i] as Record<string, unknown> | null;
    if (!item || typeof item !== "object") return null;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) return null;
    if (!Array.isArray(item.options) || item.options.length !== 4) return null;
    const options = item.options.map((o) => (typeof o === "string" ? o.trim() : ""));
    if (options.some((o) => !o)) return null;
    const correctIndex = typeof item.correctIndex === "number" ? item.correctIndex : -1;
    if (correctIndex < 0 || correctIndex > 3) return null;
    const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
    if (!explanation) return null;
    const relatedKnowledge = typeof item.relatedKnowledge === "string" ? item.relatedKnowledge.trim() : "";
    if (!relatedKnowledge) return null;
    questions.push({
      id: i + 1,
      text,
      options: options as [string, string, string, string],
      correctIndex,
      explanation,
      relatedKnowledge,
    });
  }
  return { questions };
}

export async function generateToeicQuiz(config: ToeicQuizConfig): Promise<ToeicQuizPayload> {
  if (!config.apiKey) throw new ExtensionError(ERROR_CODES.MISSING_API_KEY, "", false);
  if (!config.model) throw new ExtensionError(ERROR_CODES.UNKNOWN_MODEL, "", false);

  const systemPrompt = buildToeicQuizPrompt(config.questionCount, config.targetLanguage);
  const body = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate ${config.questionCount} TOEIC Part 5 questions now.` },
    ],
    temperature: 0.7,
    max_tokens: Math.max(2000, config.questionCount * 500),
    response_format: { type: "json_object" },
  };

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
      body: JSON.stringify(body),
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError(ERROR_CODES.OFFLINE, "", true, err);
  }

  if (response.status === 401) throw new ExtensionError(ERROR_CODES.INVALID_API_KEY, "", false);
  if (response.status === 429) throw new ExtensionError(ERROR_CODES.RATE_LIMITED, "", true);
  if (!response.ok) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, `HTTP ${response.status}`, true);

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (json.error?.message) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, json.error.message, true);

  const content = json.choices?.[0]?.message?.content ?? "";
  const result = parseToeicQuizResponse(content, config.questionCount);
  if (!result) throw new ExtensionError(ERROR_CODES.BAD_RESPONSE, "Invalid quiz JSON", true);
  return result;
}
