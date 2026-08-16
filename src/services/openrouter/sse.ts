// @ts-ignore Node's strip-types test runner needs the explicit TypeScript extension.
import { createOpenRouterStreamError, ERROR_CODES, ExtensionError } from "../../shared/errors.ts";

export type OpenRouterSSEEvent =
  | { type: "chunk"; text: string }
  | { type: "thinking"; text: string }
  | { type: "error"; code?: string | number; message: string }
  | { type: "done" };

interface OpenRouterReasoningDetail {
  type?: unknown;
  text?: unknown;
  summary?: unknown;
}

interface OpenRouterDeltaPayload {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
    };
    text?: unknown;
    delta?: {
      content?: unknown;
      text?: unknown;
      output_text?: unknown;
      reasoning?: unknown;
      reasoning_content?: unknown;
      reasoning_details?: unknown;
    };
  }>;
  error?: unknown;
}

type OpenRouterContentParser = {
  consume(text: string): OpenRouterSSEEvent[];
  consumeSnapshot(text: string): OpenRouterSSEEvent[];
  flush(): OpenRouterSSEEvent[];
};

const THINKING_TAGS = ["<think>", "<thinking>", "</think>", "</thinking>"];

class StreamingOpenRouterContentParser implements OpenRouterContentParser {
  private channel: "chunk" | "thinking" = "chunk";
  private pending = "";
  private rawContent = "";
  private answer = "";

  consume(text: string): OpenRouterSSEEvent[] {
    this.rawContent += text;
    const events: OpenRouterSSEEvent[] = [];
    const input = this.pending + text;
    this.pending = "";
    let cursor = 0;

    while (cursor < input.length) {
      const tagStart = input.indexOf("<", cursor);
      if (tagStart < 0) {
        this.emitText(input.slice(cursor), events);
        break;
      }

      this.emitText(input.slice(cursor, tagStart), events);
      const candidate = input.slice(tagStart);
      const tag = THINKING_TAGS.find((value) => candidate.startsWith(value));
      if (tag) {
        this.channel = tag.startsWith("</") ? "chunk" : "thinking";
        cursor = tagStart + tag.length;
        continue;
      }

      if (THINKING_TAGS.some((value) => value.startsWith(candidate))) {
        this.pending = candidate;
        break;
      }

      this.emitText("<", events);
      cursor = tagStart + 1;
    }

    return events;
  }

  consumeSnapshot(text: string): OpenRouterSSEEvent[] {
    if (
      !text
      || text === this.rawContent
      || this.rawContent.startsWith(text)
      || text === this.answer
      || this.answer.startsWith(text)
    ) return [];
    const newText = text.startsWith(this.rawContent)
      ? text.slice(this.rawContent.length)
      : text.startsWith(this.answer)
        ? text.slice(this.answer.length)
        : text;
    return this.consume(newText);
  }

  flush(): OpenRouterSSEEvent[] {
    if (!this.pending) return [];
    const events: OpenRouterSSEEvent[] = [];
    this.emitText(this.pending, events);
    this.pending = "";
    return events;
  }

  private emitText(text: string, events: OpenRouterSSEEvent[]): void {
    if (!text) return;
    if (this.channel === "chunk") this.answer += text;
    events.push({ type: this.channel, text });
  }
}

function extractReadableReasoning(delta: NonNullable<OpenRouterDeltaPayload["choices"]>[number]["delta"]): string[] {
  if (!delta) return [];
  const readable: string[] = [];
  if (Array.isArray(delta.reasoning_details)) {
    for (const value of delta.reasoning_details) {
      if (!value || typeof value !== "object") continue;
      const detail = value as OpenRouterReasoningDetail;
      if (detail.type === "reasoning.text" && typeof detail.text === "string" && detail.text.length > 0) {
        readable.push(detail.text);
      } else if (detail.type === "reasoning.summary" && typeof detail.summary === "string" && detail.summary.length > 0) {
        readable.push(detail.summary);
      }
    }
  }
  if (readable.length === 0) {
    for (const value of [delta.reasoning_content, delta.reasoning]) {
      if (typeof value === "string" && value.length > 0) {
        readable.push(value);
        break;
      }
    }
  }
  return readable;
}

function extractTextPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractTextPart).join("");
  if (!value || typeof value !== "object") return "";
  const text = (value as { text?: unknown }).text;
  return text === undefined ? "" : extractTextPart(text);
}

function extractReadableContent(delta: NonNullable<OpenRouterDeltaPayload["choices"]>[number]["delta"]): string {
  if (!delta) return "";
  for (const value of [delta.content, delta.text, delta.output_text]) {
    const text = extractTextPart(value);
    if (text) return text;
  }
  return "";
}

function extractFinalContent(choice: NonNullable<OpenRouterDeltaPayload["choices"]>[number] | undefined): string {
  if (!choice) return "";
  for (const value of [choice.message?.content, choice.text]) {
    const text = extractTextPart(value);
    if (text) return text;
  }
  return "";
}

function extractStreamError(value: unknown): { code?: string | number; message: string } | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { message: value };
  if (typeof value === "object") {
    const error = value as { code?: unknown; message?: unknown };
    return {
      code: typeof error.code === "string" || typeof error.code === "number" ? error.code : undefined,
      message: typeof error.message === "string" && error.message ? error.message : "OpenRouter stream error.",
    };
  }
  return { message: "OpenRouter stream error." };
}

export function consumeOpenRouterSSE(
  buffer: string,
  contentParser: OpenRouterContentParser = new StreamingOpenRouterContentParser(),
): { events: OpenRouterSSEEvent[]; remainder: string } {
  const events: OpenRouterSSEEvent[] = [];
  let remainder = buffer;

  while (true) {
    const separator = remainder.search(/\r?\n\r?\n/);
    if (separator < 0) break;
    const frame = remainder.slice(0, separator);
    remainder = remainder.slice(separator).replace(/^\r?\n\r?\n/, "");
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (!data) continue;
    if (data === "[DONE]") {
      events.push(...contentParser.flush());
      events.push({ type: "done" });
      continue;
    }

    try {
      const payload = JSON.parse(data) as OpenRouterDeltaPayload;
      const streamError = extractStreamError(payload.error);
      if (streamError) {
        events.push({ type: "error", ...streamError });
        continue;
      }
      const choice = payload.choices?.[0];
      const delta = choice?.delta;
      if (choice?.finish_reason === "error") {
        events.push({ type: "error", message: "OpenRouter stream ended with an error." });
        continue;
      }
      for (const text of extractReadableReasoning(delta)) {
        events.push({ type: "thinking", text });
      }
      const content = extractReadableContent(delta);
      if (content) {
        events.push(...contentParser.consume(content));
      }
      const finalContent = extractFinalContent(choice);
      if (finalContent) {
        events.push(...contentParser.consumeSnapshot(finalContent));
      }
      if (choice?.finish_reason === "length") {
        events.push({
          type: "error",
          code: "TRUNCATED_RESPONSE",
          message: "OpenRouter response reached the token limit.",
        });
      }
    } catch {
      // Ignore malformed provider frames and keep the stream alive.
    }
  }

  return { events, remainder };
}

export async function consumeOpenRouterStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  onThinking: (text: string) => void = () => undefined,
): Promise<{ raw: string; thinking: string; sawDone: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const contentParser = new StreamingOpenRouterContentParser();
  let buffer = "";
  let raw = "";
  let thinking = "";
  let sawDone = false;

  const process = (text: string) => {
    buffer += text;
    const parsed = consumeOpenRouterSSE(buffer, contentParser);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      if (event.type === "chunk") {
        raw += event.text;
        onChunk(event.text);
      } else if (event.type === "thinking") {
        thinking += event.text;
        onThinking(event.text);
      } else if (event.type === "error") {
        if (event.code === ERROR_CODES.TRUNCATED_RESPONSE) {
          throw new ExtensionError(ERROR_CODES.TRUNCATED_RESPONSE, "", true);
        }
        throw createOpenRouterStreamError(event.code, event.message);
      } else {
        sawDone = true;
      }
    }
  };

  try {
    while (!sawDone) {
      const { value, done } = await reader.read();
      if (value) process(decoder.decode(value, { stream: true }));
      if (done) {
        const tail = decoder.decode();
        if (tail) process(tail);
        if (buffer.trim()) process("\n\n");
        break;
      }
    }

    if (!sawDone) {
      for (const event of contentParser.flush()) {
        if (event.type === "chunk") {
          raw += event.text;
          onChunk(event.text);
        } else if (event.type === "thinking") {
          thinking += event.text;
          onThinking(event.text);
        } else if (event.type === "error") {
          throw createOpenRouterStreamError(event.code, event.message);
        }
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  if (sawDone) {
    await reader.cancel().catch(() => undefined);
  }
  if (!raw.trim()) {
    throw new ExtensionError(ERROR_CODES.EMPTY_RESPONSE, "", true);
  }
  return { raw, thinking, sawDone };
}
