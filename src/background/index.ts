import { AI_STREAM_PORT_NAME, MESSAGE_TYPES } from "@/shared/constants";
import { ExtensionError } from "@/shared/errors";
import { callOpenRouter, fetchOpenRouterModels, streamOpenRouter } from "@/services/openrouter/client";
import { lookupDictionarySource, translateDictionaryRemotely } from "./dictionaryHandlers";
import { getSettings, saveSettings } from "@/services/storage/settings";
import { runAIStreamOnPort } from "./streaming";
import { DictionaryRemoteRequestRegistry } from "./remoteRequestRegistry";
import { toPopupSettings, type AIRequest, type AIResponse, type DictionaryRemoteTranslationRequest, type ExtensionSettings, type LookupRequest, type LookupResponse } from "@/shared/types";
import type { OpenRouterModel } from "@/shared/openrouter-types";

const dictionaryRemoteRequests = new DictionaryRemoteRequestRegistry();

interface MessageEnvelope<T = unknown> {
  type: string;
  requestId: string;
  payload: T;
}

async function handleAI(payload: AIRequest, signal: AbortSignal): Promise<AIResponse> {
  try {
    const settings = await getSettings();
    const { targetLanguage: _ignoredTargetLanguage, ...aiRequest } = payload;
    const result = await callOpenRouter(
      {
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
        systemPrompt: settings.systemPrompt,
        thinkingEnabled: settings.openRouterThinkingEnabled,
        reasoningEffort: settings.openRouterReasoningEffort,
        reasoningMaxTokens: settings.openRouterReasoningMaxTokens,
        maxTokens: settings.openRouterMaxTokens,
        signal,
      },
      aiRequest,
    );
    return { structured: result.structured, raw: result.raw };
  } catch (err) {
    if (err instanceof ExtensionError) {
      return { structured: null, raw: "", error: err.code };
    }
    return { structured: null, raw: "", error: "INTERNAL" };
  }
}

const pronunciationDataCache = new Map<string, string>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function handlePronunciation(payload: { url: string }, signal: AbortSignal): Promise<{ dataUrl: string }> {
  let url: URL;
  try {
    url = new URL(payload.url);
  } catch {
    throw new ExtensionError("BAD_RESPONSE", "", false);
  }
  if (url.protocol !== "https:" || url.hostname !== "api.dictionaryapi.dev") {
    throw new ExtensionError("BAD_RESPONSE", "", false);
  }

  const cached = pronunciationDataCache.get(url.href);
  if (cached) return { dataUrl: cached };

  let response: Response;
  try {
    response = await fetch(url.href, { signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    throw new ExtensionError("OFFLINE", "", true, err);
  }
  if (!response.ok) throw new ExtensionError("BAD_RESPONSE", `HTTP ${response.status}`, true);

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
    throw new ExtensionError("BAD_RESPONSE", "", true);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0] || "audio/mpeg";
  const dataUrl = `data:${contentType};base64,${bytesToBase64(bytes)}`;
  pronunciationDataCache.set(url.href, dataUrl);
  return { dataUrl };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== AI_STREAM_PORT_NAME) return;

  let controller: AbortController | null = null;
  port.onDisconnect.addListener(() => {
    controller?.abort();
    controller = null;
  });

  port.onMessage.addListener((message: { type?: string; payload?: AIRequest }) => {
    if (message.type !== MESSAGE_TYPES.AI_EXPLAIN_STREAM || !message.payload) return;
    controller?.abort();
    controller = new AbortController();
    const currentController = controller;
    void (async () => {
      try {
        const settings = await getSettings();
        await runAIStreamOnPort(
          port,
          message.payload as AIRequest,
          (request, signal, onChunk, onThinking) => streamOpenRouter(
            {
              apiKey: settings.openRouterApiKey,
              model: settings.openRouterModel,
              systemPrompt: settings.systemPrompt,
              thinkingEnabled: settings.openRouterThinkingEnabled,
              reasoningEffort: settings.openRouterReasoningEffort,
              reasoningMaxTokens: settings.openRouterReasoningMaxTokens,
              maxTokens: settings.openRouterMaxTokens,
              signal,
            },
            request,
            onChunk,
            onThinking,
          ),
          currentController.signal,
        );
      } catch (error) {
        const code = error instanceof ExtensionError ? error.code : "INTERNAL";
        try {
          port.postMessage({ type: "error", code });
        } catch {
          // The tab was closed while the settings or stream was loading.
        }
      }
    })();
  });
});

async function handleGetModels(
  payload: { apiKey: string; query?: string },
  signal: AbortSignal,
): Promise<{ models: OpenRouterModel[] }> {
  const models = await fetchOpenRouterModels({ apiKey: payload.apiKey, query: payload.query, signal });
  return { models };
}

chrome.runtime.onMessage.addListener((envelope: MessageEnvelope, _sender, sendResponse) => {
  const { type, payload } = envelope;

  if (type === MESSAGE_TYPES.GET_SETTINGS) {
    getSettings().then((s) => sendResponse({ ok: true, payload: s }));
    return true;
  }

  if (type === MESSAGE_TYPES.GET_POPUP_SETTINGS) {
    getSettings().then((s) => sendResponse({ ok: true, payload: toPopupSettings(s) }));
    return true;
  }

  if (type === MESSAGE_TYPES.SAVE_SETTINGS) {
    void (async () => {
      try {
        await saveSettings(payload as ExtensionSettings);
        sendResponse({ ok: true });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Không thể lưu cài đặt.";
        sendResponse({ ok: false, error: message });
      }
    })();
    return true;
  }

  if (type === MESSAGE_TYPES.OPEN_SETTINGS) {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (type === MESSAGE_TYPES.DICTIONARY_LOOKUP) {
    const controller = new AbortController();
    const p = lookupDictionarySource(payload as LookupRequest, controller.signal);
    p.then((r) => sendResponse({ ok: true, payload: r }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (type === MESSAGE_TYPES.DICTIONARY_TRANSLATE_REMOTE) {
    const controller = new AbortController();
    const requestId = (payload as DictionaryRemoteTranslationRequest).requestId;
    if (typeof requestId === "number") dictionaryRemoteRequests.set(requestId, controller);
    const p = translateDictionaryRemotely(payload as DictionaryRemoteTranslationRequest, controller.signal);
    p.then((r) => sendResponse({ ok: true, payload: r }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof ExtensionError ? err.code : "INTERNAL" }))
      .finally(() => {
        if (typeof requestId === "number") dictionaryRemoteRequests.finish(requestId, controller);
      });
    return true;
  }

  if (type === MESSAGE_TYPES.DICTIONARY_TRANSLATE_CANCEL) {
    const requestId = (payload as { requestId?: number } | undefined)?.requestId;
    if (typeof requestId === "number") dictionaryRemoteRequests.cancel(requestId);
    sendResponse({ ok: true });
    return false;
  }

  if (type === MESSAGE_TYPES.PRONUNCIATION_FETCH) {
    const controller = new AbortController();
    handlePronunciation(payload as { url: string }, controller.signal)
      .then((result) => sendResponse({ ok: true, payload: result }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof ExtensionError ? err.code : "INTERNAL" }));
    return true;
  }

  if (type === MESSAGE_TYPES.AI_EXPLAIN) {
    const controller = new AbortController();
    const p = handleAI(payload as AIRequest, controller.signal);
    p.then((r) => sendResponse({ ok: true, payload: r }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (type === MESSAGE_TYPES.GET_MODELS) {
    const controller = new AbortController();
    const p = handleGetModels(payload as { apiKey: string; query?: string }, controller.signal);
    p.then((r) => sendResponse({ ok: true, payload: r }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

// Open the options page when the user clicks the toolbar icon.
chrome.action?.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

export {};
