import type { AIRequest, AIStreamEvent } from "@/shared/types";

export interface StreamPortLike {
  postMessage(message: AIStreamEvent): void;
}

export interface StreamResult {
  raw: string;
  thinking: string;
}

export type StreamRunner = (
  request: AIRequest,
  signal: AbortSignal,
  onChunk: (text: string) => void,
  onThinking: (text: string) => void,
) => Promise<StreamResult>;

function post(port: StreamPortLike, event: AIStreamEvent) {
  try {
    port.postMessage(event);
  } catch {
    // The port may disconnect while the provider is finishing.
  }
}

export async function runAIStreamOnPort(
  port: StreamPortLike,
  request: AIRequest,
  run: StreamRunner,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  const { targetLanguage: _ignoredTargetLanguage, ...requestWithoutTargetLanguage } = request;
  try {
    const result = await run(requestWithoutTargetLanguage, signal, (text) => {
      post(port, { type: "chunk", text });
    }, (text) => {
      post(port, { type: "thinking", text });
    });
    post(port, { type: "done", raw: result.raw, thinking: result.thinking });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "INTERNAL";
    post(port, { type: "error", code });
  }
}
