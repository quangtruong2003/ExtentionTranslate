import { createRoot, type Root } from "react-dom/client";
import { StrictMode, useLayoutEffect, useRef } from "react";
import { DictionaryPopup, type PopupPhase } from "@/components/dictionary/DictionaryPopup";
import { getPopupCopy } from "@/components/dictionary/copy";
import { AI_STREAM_PORT_NAME, POPUP_HOST_ID, MESSAGE_TYPES, SELECTION_DEBOUNCE_MS } from "@/shared/constants";
import { DEFAULT_POPUP_SETTINGS, normalizeSettings, toPopupSettings, type AIRequest, type AIStreamEvent, type DictionaryEntry, type DictionaryRemoteTranslationResponse, type LookupResponse, type PopupSettings, type TargetLanguage, type TranslationStatus } from "@/shared/types";
import type { PopupTab } from "@/components/dictionary/PopupTabs";
import { getCurrentSelection, type SelectionInfo } from "./selection";
import { computePopupPosition, computeSelectionTriggerPosition, constrainPopupSize, getPopupViewport, type Position } from "./positioning";
import { mountShadowHost, registerShadowButtonAction, unmountShadowHost } from "./shadowRoot";
import { SETTINGS_KEY } from "@/services/storage/settings";
import { stopPreparedPronunciations } from "@/services/dictionary/pronunciation";
import { BrowserDictionaryTranslator } from "@/services/dictionary/browserTranslator";
import { translateDictionaryEntryInBrowser } from "@/services/dictionary/translationWorkflow";
import { getCachedDictionaryTranslation, setCachedDictionaryTranslation } from "@/services/storage/dictionaryTranslationCache";
import { Toaster, toast } from "@/components/ui/sonner";
import popupCss from "@/styles/popup.css?inline";
import sonnerCss from "sonner/dist/styles.css?inline";
import { classifySelection, detectSelectionSourceLanguage, type BrowserSourceLanguage } from "./selectionMode";

interface PopupState {
  word: string;
  phase: PopupPhase;
  aiLoading: boolean;
  aiRequested: boolean;
  aiError?: string;
  aiStreamText: string;
  aiThinkingText: string;
  aiThinkingEnabled: boolean;
  hasApiKey: boolean;
  aiDone: boolean;
  activeTab: PopupTab;
  targetLanguage: TargetLanguage;
  translationStatus: TranslationStatus;
}

let rootRef: Root | null = null;
let hostEl: HTMLElement | null = null;
let containerEl: HTMLElement | null = null;
let shadowEl: ShadowRoot | null = null;
let state: PopupState | null = null;
let lastSelectionText = "";
let currentRequestId = 0;
let currentSelectionInfo: SelectionInfo | null = null;
let selectionTriggerInfo: SelectionInfo | null = null;
let selectionTriggerPosition: Position | null = null;
let selectionTriggerPointerDown = false;
let popupWasOpened = false;
let popupPosition: Position | null = null;
let outsideClickListener: ((ev: MouseEvent) => void) | null = null;
let escListener: ((ev: KeyboardEvent) => void) | null = null;
let resizeListener: (() => void) | null = null;
// CDP device-metric overrides and some SPA viewport mutations change the
// visual viewport without firing resize/visualViewport events; the poll below
// is the only reliable re-anchor for them (see the zoom E2E contract).
let viewportWatchTimer: number | null = null;
let lastViewportKey = "";
let debounceTimer: number | null = null;
let settings: PopupSettings = DEFAULT_POPUP_SETTINGS;
let settingsRevision = 0;
let aiPort: chrome.runtime.Port | null = null;
let translationController: AbortController | null = null;
let translationRequestId: number | null = null;
let sourceDictionaryEntry: DictionaryEntry | null = null;
const browserDictionaryTranslator = new BrowserDictionaryTranslator();

function toBrowserTextTargetLanguage(targetLanguage: TargetLanguage): BrowserSourceLanguage {
  if (targetLanguage === "zh-CN") return "zh";
  return targetLanguage;
}

const dictionaryTranslationStorage = {
  get: (key: string) => new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items as Record<string, unknown>));
  }),
  set: (items: Record<string, unknown>) => new Promise<void>((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  }),
};

function sendMessage<T = unknown>(type: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (response: T) => {
        resolve(response);
      });
    } catch {
      resolve(undefined as T);
    }
  });
}

function setState(next: Partial<PopupState>) {
  if (!state) return;
  state = { ...state, ...next };
  render();
}

function setPhase(phase: PopupPhase) {
  if (!state) return;
  state = { ...state, phase };
  render();
}

function ensureMounted(): { root: Root; host: HTMLElement; container: HTMLElement; shadow: ShadowRoot } {
  if (rootRef && hostEl && containerEl && shadowEl) {
    return { root: rootRef, host: hostEl, container: containerEl, shadow: shadowEl };
  }
  const mounted = mountShadowHost();
  hostEl = mounted.host;
  containerEl = mounted.container;
  shadowEl = mounted.shadow;
  injectPopupStyles(shadowEl);
  rootRef = createRoot(containerEl);
  return { root: rootRef, host: hostEl, container: containerEl, shadow: shadowEl };
}

let stylesInjected = new WeakSet<ShadowRoot>();

function applyHostTheme(theme: PopupSettings["theme"]) {
  if (!hostEl) return;
  hostEl.className = theme === "dark" ? "ext-theme-dark" : theme === "light" ? "ext-theme-light" : "";
}

function injectPopupStyles(shadow: ShadowRoot) {
  if (stylesInjected.has(shadow)) return;
  const style = document.createElement("style");
  style.setAttribute("data-ext-shadow", "global");
  style.textContent = `${popupCss as unknown as string}\n${sonnerCss as unknown as string}`;
  shadow.insertBefore(style, shadow.firstChild);
  stylesInjected.add(shadow);
}

function render() {
  if (!state && !selectionTriggerInfo) return;
  const { root } = ensureMounted();
  applyHostTheme(settings.theme);
  root.render(
    <StrictMode>
      {state ? (
        <PopupContainer
          state={state}
          autoAskAI={settings.autoAskAIOnPopup}
          onAskAI={() => void handleAskAI()}
          onRetryLookup={handleRetry}
          onOpenSettings={openSettingsPage}
          onLookupWord={handleLookupWord}
          onStop={handleStopAI}
          onTabChange={(activeTab) => setState({ activeTab })}
        />
      ) : (
        <SelectionTriggerContainer
          targetLanguage={settings.targetLanguage}
          onActivate={activateSelectionTrigger}
        />
      )}
    </StrictMode>,
  );
  if (state && currentSelectionInfo) {
    schedulePopupPlacement(currentSelectionInfo);
  } else if (selectionTriggerInfo) {
    scheduleSelectionTriggerPlacement(selectionTriggerInfo);
  }
}

function SelectionTriggerContainer({ targetLanguage, onActivate }: {
  targetLanguage: TargetLanguage;
  onActivate: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const copy = getPopupCopy(targetLanguage);
  const projectIconUrl = chrome.runtime.getURL("icons/icon48.png");

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const unregisterAction = registerShadowButtonAction(button, onActivate);
    // The shadow-root forwarder may invoke `.click()` on this node directly;
    // keep a native listener as a deterministic activation path as well.
    button.addEventListener("click", onActivate);
    return () => {
      button.removeEventListener("click", onActivate);
      unregisterAction();
    };
  }, [onActivate]);

  useLayoutEffect(() => {
    const host = hostEl;
    const button = buttonRef.current;
    if (!host || !button) return;
    const handleHostPress = (event: MouseEvent) => {
      if (!selectionTriggerInfo) return;
      const rect = button.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      event.preventDefault();
      onActivate();
    };
    host.addEventListener("pointerdown", handleHostPress, true);
    host.addEventListener("mousedown", handleHostPress, true);
    host.addEventListener("click", handleHostPress, true);
    return () => {
      host.removeEventListener("pointerdown", handleHostPress, true);
      host.removeEventListener("mousedown", handleHostPress, true);
      host.removeEventListener("click", handleHostPress, true);
    };
  }, [onActivate]);

  return (
    <div
      className="ext-selection-trigger-wrapper"
      data-ext-selection-trigger-wrapper
      style={{
        position: "fixed",
        top: selectionTriggerPosition?.top ?? 0,
        left: selectionTriggerPosition?.left ?? 0,
        pointerEvents: "auto",
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        data-ext-selection-trigger
        aria-label={copy.selectionTriggerLabel}
        title={copy.selectionTriggerTooltip}
        onPointerDown={(event) => {
          event.preventDefault();
          selectionTriggerPointerDown = true;
        }}
        onPointerUp={() => {
          window.setTimeout(() => {
            if (selectionTriggerInfo) selectionTriggerPointerDown = false;
          }, 0);
        }}
        onPointerCancel={() => {
          selectionTriggerPointerDown = false;
        }}
        onClick={onActivate}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/95 p-1 shadow-md backdrop-blur outline-none transition-[transform,box-shadow] hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-95"
      >
        <img src={projectIconUrl} alt="" aria-hidden="true" draggable={false} className="h-6 w-6 object-contain" />
      </button>
    </div>
  );
}

function PopupContainer({ state, autoAskAI, onAskAI, onRetryLookup, onOpenSettings, onLookupWord, onStop, onTabChange }: {
  state: PopupState;
  autoAskAI: boolean;
  onAskAI: () => void;
  onRetryLookup: () => void;
  onOpenSettings: () => void;
  onLookupWord: (word: string) => void;
  onStop: () => void;
  onTabChange: (tab: PopupTab) => void;
}) {
  useLayoutEffect(() => {
    if (currentSelectionInfo) {
      placePopup(getSelectionRect(currentSelectionInfo));
    }
    const dialog = shadowEl?.querySelector<HTMLElement>("[role='dialog']");
    const activeElement = shadowEl?.activeElement;
    if (dialog && activeElement !== dialog && !dialog.contains(activeElement ?? null)) {
      dialog.focus({ preventScroll: true });
    }
  }, [state.phase.kind, state.activeTab, state.aiLoading, state.aiStreamText, state.aiThinkingText, state.aiError, state.translationStatus]);

  return (
    <>
      <div
        className="ext-popup-wrapper"
        data-ext-popup
        style={{
          position: "fixed",
          top: popupPosition?.top ?? 0,
          left: popupPosition?.left ?? 0,
          pointerEvents: "auto",
        }}
      >
        <DictionaryPopup
          word={state.word}
          phase={state.phase}
          aiLoading={state.aiLoading}
          aiRequested={state.aiRequested}
          aiError={state.aiError}
          aiStreamText={state.aiStreamText}
          aiThinkingText={state.aiThinkingText}
          aiThinkingEnabled={state.aiThinkingEnabled}
          hasApiKey={state.hasApiKey}
          autoAskAI={autoAskAI}
          activeTab={state.activeTab}
          targetLanguage={state.targetLanguage}
          translationStatus={state.translationStatus}
          onAskAI={onAskAI}
          onTabChange={onTabChange}
          onRetryLookup={onRetryLookup}
          onOpenSettings={onOpenSettings}
          onLookupWord={onLookupWord}
          onStop={onStop}
        />
      </div>
      <Toaster position="bottom-center" richColors closeButton />
    </>
  );
}

function getSelectionRect(info: SelectionInfo): DOMRect {
  const liveRect = info.range.getBoundingClientRect();
  if (liveRect.width > 0 || liveRect.height > 0) return liveRect;
  return info.rect;
}

function placePopup(rect: DOMRect) {
  const wrapper = shadowEl?.querySelector<HTMLElement>(".ext-popup-wrapper");
  if (!wrapper) return false;
  const popup = wrapper.querySelector<HTMLElement>("[role='dialog']");
  const viewport = getPopupViewport();
  const maximumSize = constrainPopupSize({ width: 560, height: 680 }, viewport);
  if (popup) {
    popup.style.maxWidth = "min(560px, calc(100vw - 24px))";
    popup.style.maxHeight = `${maximumSize.height}px`;
  }
  const measured = popup?.getBoundingClientRect();
  const constrainedSize = constrainPopupSize(
    { width: measured?.width ?? 420, height: measured?.height ?? 320 },
    viewport,
  );
  const pos = computePopupPosition(
    rect,
    constrainedSize,
    viewport,
  );
  if (hostEl) {
    Object.assign(hostEl.style, {
      top: `${pos.top}px`,
      left: `${pos.left}px`,
      width: `${constrainedSize.width}px`,
      height: `${constrainedSize.height}px`,
      pointerEvents: "auto",
    });
  }
  if (popupPosition?.top === pos.top && popupPosition.left === pos.left) return true;
  popupPosition = pos;
  if (state) render();
  return true;
}

function placeSelectionTrigger(rect: DOMRect) {
  const wrapper = shadowEl?.querySelector<HTMLElement>("[data-ext-selection-trigger-wrapper]");
  if (!wrapper) return false;
  const button = wrapper.querySelector<HTMLElement>("[data-ext-selection-trigger]");
  const measured = button?.getBoundingClientRect();
  const viewport = getPopupViewport();
  const triggerSize = {
    width: measured?.width || 36,
    height: measured?.height || 36,
  };
  const pos = computeSelectionTriggerPosition(rect, triggerSize, viewport, selectionTriggerInfo?.pointerPosition);
  if (hostEl) {
    Object.assign(hostEl.style, {
      top: `${pos.top}px`,
      left: `${pos.left}px`,
      width: `${triggerSize.width}px`,
      height: `${triggerSize.height}px`,
      pointerEvents: "auto",
    });
  }
  if (selectionTriggerPosition?.top === pos.top && selectionTriggerPosition.left === pos.left) return true;
  selectionTriggerPosition = pos;
  if (selectionTriggerInfo) render();
  return true;
}

function startViewportWatcher() {
  if (viewportWatchTimer !== null) return;
  const watch = () => {
    viewportWatchTimer = null;
    if ((!popupWasOpened && !selectionTriggerInfo) || !currentSelectionInfo) return;
    const viewport = getPopupViewport();
    const viewportKey = [viewport.width, viewport.height, viewport.offsetLeft ?? 0, viewport.offsetTop ?? 0].join(":");
    if (viewportKey !== lastViewportKey) {
      lastViewportKey = viewportKey;
      if (popupWasOpened) placePopup(getSelectionRect(currentSelectionInfo));
      else placeSelectionTrigger(getSelectionRect(currentSelectionInfo));
    }
    viewportWatchTimer = window.setTimeout(watch, 50);
  };
  watch();
}

function stopViewportWatcher() {
  if (viewportWatchTimer !== null) {
    window.clearTimeout(viewportWatchTimer);
    viewportWatchTimer = null;
  }
  lastViewportKey = "";
}

function schedulePopupPlacement(info: SelectionInfo) {
  let attempts = 0;
  const placeWhenMounted = () => {
    if (currentSelectionInfo !== info || !popupWasOpened) return;
    if (placePopup(getSelectionRect(info)) || attempts >= 8) return;
    attempts += 1;
    requestAnimationFrame(placeWhenMounted);
  };
  requestAnimationFrame(placeWhenMounted);
}

function scheduleSelectionTriggerPlacement(info: SelectionInfo) {
  let attempts = 0;
  const placeWhenMounted = () => {
    if (selectionTriggerInfo !== info || popupWasOpened) return;
    if (placeSelectionTrigger(getSelectionRect(info)) || attempts >= 8) return;
    attempts += 1;
    requestAnimationFrame(placeWhenMounted);
  };
  requestAnimationFrame(placeWhenMounted);
}

async function runWordLookup(lookupText: string, pageLanguage: string | undefined, myId: number): Promise<void> {
  if (settings.targetLanguage !== "en") {
    void browserDictionaryTranslator.warm(settings.targetLanguage);
  }
  try {
    const res = await sendMessage<{ ok: boolean; payload: LookupResponse }>(MESSAGE_TYPES.DICTIONARY_LOOKUP, {
      word: lookupText,
      language: pageLanguage,
      targetLanguage: settings.targetLanguage,
    });
    if (myId !== currentRequestId) return; // stale
    if (!res?.ok) {
      setPhase({ kind: "error", code: "INTERNAL" });
      return;
    }
    if (res.payload.entry) {
      sourceDictionaryEntry = res.payload.sourceEntry ?? res.payload.entry;
      setState({
        word: lookupText,
        phase: { kind: "ready", entry: sourceDictionaryEntry },
        translationStatus: "source",
      });
      if (settings.targetLanguage !== "en") {
        void translateCurrentDictionaryEntry(sourceDictionaryEntry, myId, lookupText);
      }
      // re-place because content may grow
      requestAnimationFrame(() => currentSelectionInfo && placePopup(getSelectionRect(currentSelectionInfo)));
    } else if (settings.targetLanguage !== "en" && settings.hasOpenRouterApiKey) {
      sourceDictionaryEntry = null;
      setState({ word: lookupText, phase: { kind: "loading" }, translationStatus: "translating" });
      void translateCurrentDictionaryEntry(null, myId, lookupText);
    } else if (res.payload.error === "NO_RESULT") {
      setPhase({ kind: "empty" });
    } else {
      setPhase({ kind: "error", code: res.payload.error || "INTERNAL" });
    }
  } catch {
    if (myId !== currentRequestId) return;
    setPhase({ kind: "error", code: "INTERNAL" });
  }
}

async function openPopup(info: SelectionInfo, shouldAutoAsk: boolean) {
  stopAIStream();
  stopDictionaryTranslation();
  stopPreparedPronunciations();
  const selectionMode = classifySelection(info.text);
  const myId = ++currentRequestId;
  selectionTriggerInfo = null;
  selectionTriggerPosition = null;
  selectionTriggerPointerDown = false;
  popupWasOpened = true;
  currentSelectionInfo = info;
  popupPosition = computePopupPosition(getSelectionRect(info), { width: 420, height: 320 }, getPopupViewport());
  state = {
    word: selectionMode.sourceText,
    phase: selectionMode.kind === "text" ? { kind: "translation-loading", sourceText: selectionMode.sourceText } : { kind: "loading" },
    aiLoading: false,
    aiRequested: false,
    hasApiKey: settings.hasOpenRouterApiKey,
    aiDone: false,
    aiStreamText: "",
    aiThinkingText: "",
    aiThinkingEnabled: settings.openRouterThinkingEnabled,
    activeTab: "dictionary",
    targetLanguage: settings.targetLanguage,
    translationStatus: "source",
  };
  ensureMounted();
  render();
  schedulePopupPlacement(info);
  addOutsideListeners();

  if (shouldAutoAsk && settings.autoAskAIOnPopup && settings.hasOpenRouterApiKey) {
    void handleAskAI({ revealTab: false });
  }
  if (selectionMode.kind === "text") {
    void translateSelectedText(info, selectionMode.sourceText, myId);
    return;
  }
  await runWordLookup(selectionMode.lookupText, info.pageLanguage, myId);
}

async function translateSelectedText(info: SelectionInfo, sourceText: string, requestId: number): Promise<void> {
  stopDictionaryTranslation();
  const controller = new AbortController();
  translationController = controller;
  translationRequestId = requestId;
  const sourceLanguage = detectSelectionSourceLanguage(sourceText, info.pageLanguage);
  const targetLanguage = toBrowserTextTargetLanguage(settings.targetLanguage);

  const isCurrent = () => requestId === currentRequestId && !controller.signal.aborted && Boolean(state);

  try {
    if (sourceLanguage === targetLanguage) {
      if (requestId !== currentRequestId || controller.signal.aborted || !state) return;
      setState({
        phase: { kind: "translation-ready", sourceText, translatedText: sourceText, provider: "source" },
        translationStatus: "source",
      });
      return;
    }

    const translatedText = await browserDictionaryTranslator.translateText(
      sourceText,
      sourceLanguage,
      targetLanguage,
      controller.signal,
    );
    if (requestId !== currentRequestId || controller.signal.aborted || !state) return;
    if (!translatedText) {
      setState({
        phase: { kind: "translation-error", sourceText, code: "TRANSLATOR_UNAVAILABLE" },
        translationStatus: "fallback",
      });
      return;
    }
    if (!translatedText.trim()) {
      setState({
        phase: { kind: "translation-error", sourceText, code: "TRANSLATION_FAILED" },
        translationStatus: "fallback",
      });
      return;
    }
    if (!isCurrent()) return;
    setState({
      phase: { kind: "translation-ready", sourceText, translatedText, provider: "browser" },
      translationStatus: "translated",
    });
    requestAnimationFrame(() => currentSelectionInfo && placePopup(getSelectionRect(currentSelectionInfo)));
  } catch {
    if (requestId !== currentRequestId || controller.signal.aborted || !state) return;
    setState({
      phase: { kind: "translation-error", sourceText, code: "TRANSLATION_FAILED" },
      translationStatus: "fallback",
    });
  } finally {
    if (translationController === controller) {
      translationController = null;
      translationRequestId = null;
    }
  }
}

async function handleAskAI({ revealTab = true }: { revealTab?: boolean } = {}) {
  if (!state || !currentSelectionInfo) return;
  stopAIStream();
  setState({
    ...(revealTab ? { activeTab: "ai" } : {}),
    aiLoading: true,
    aiRequested: true,
    aiError: undefined,
    aiStreamText: "",
    aiThinkingText: "",
    aiThinkingEnabled: settings.openRouterThinkingEnabled,
    aiDone: true,
  });
  const myId = currentRequestId;
  const req: AIRequest = {
    word: state.word,
    ...(settings.includeSelectionContext ? {
      sentence: currentSelectionInfo.sentence,
      contextBefore: currentSelectionInfo.contextBefore,
      contextAfter: currentSelectionInfo.contextAfter,
      pageLanguage: currentSelectionInfo.pageLanguage,
    } : {}),
  };
  try {
    const port = chrome.runtime.connect({ name: AI_STREAM_PORT_NAME });
    aiPort = port;
    let settled = false;
    port.onMessage.addListener((event: AIStreamEvent) => {
      if (myId !== currentRequestId || aiPort !== port || !state) return;
      if (event.type === "chunk") {
        setState({ aiStreamText: `${state.aiStreamText}${event.text}` });
      } else if (event.type === "thinking") {
        setState({ aiThinkingText: `${state.aiThinkingText}${event.text}` });
      } else if (event.type === "done") {
        settled = true;
        setState({ aiLoading: false, aiStreamText: event.raw, aiThinkingText: event.thinking });
      } else {
        settled = true;
        setState({ aiLoading: false, aiError: event.code });
        toast.error(getPopupCopy(settings.targetLanguage).errorMessage(event.code));
      }
    });
    port.onDisconnect.addListener(() => {
      if (aiPort !== port) return;
      aiPort = null;
      if (settled || myId !== currentRequestId || !state || !state.aiLoading) return;
      setState({ aiLoading: false, aiError: "INTERNAL" });
      toast.error(getPopupCopy(settings.targetLanguage).errorMessage("INTERNAL"));
    });
    port.postMessage({ type: MESSAGE_TYPES.AI_EXPLAIN_STREAM, payload: req });
  } catch {
    setState({ aiLoading: false, aiError: "INTERNAL" });
    toast.error(getPopupCopy(settings.targetLanguage).errorMessage("INTERNAL"));
  }
}

function stopDictionaryTranslation() {
  const requestId = translationRequestId;
  translationController?.abort();
  translationController = null;
  translationRequestId = null;
  if (requestId !== null) {
    void sendMessage(MESSAGE_TYPES.DICTIONARY_TRANSLATE_CANCEL, { requestId });
  }
}

async function translateCurrentDictionaryEntry(entry: DictionaryEntry | null, requestId: number, lookupWord: string) {
  stopDictionaryTranslation();
  const controller = new AbortController();
  translationController = controller;
  translationRequestId = requestId;
  if (state && entry) setState({ translationStatus: "translating" });

  try {
    if (!entry) {
      const response = await sendMessage<{ ok: boolean; payload?: DictionaryRemoteTranslationResponse; error?: string }>(
        MESSAGE_TYPES.DICTIONARY_TRANSLATE_REMOTE,
        { word: lookupWord, targetLanguage: settings.targetLanguage, requestId },
      );
      if (requestId !== currentRequestId || controller.signal.aborted || !state) return;
      if (!response?.ok || !response.payload?.entry) {
        setPhase({ kind: "error", code: response?.error ?? "NO_RESULT" });
        return;
      }
      sourceDictionaryEntry = response.payload.entry;
      setState({
        phase: { kind: "ready", entry: response.payload.entry },
        translationStatus: response.payload.status,
      });
      return;
    }

    if (settings.targetLanguage === "en") {
      if (requestId === currentRequestId && state) {
        setState({ phase: { kind: "ready", entry }, translationStatus: "source" });
      }
      return;
    }
    const targetLanguage = settings.targetLanguage;

    const result = await translateDictionaryEntryInBrowser({
      sourceEntry: entry,
      targetLanguage,
      signal: controller.signal,
      browserTranslator: browserDictionaryTranslator,
      getCached: (source, target) => getCachedDictionaryTranslation(dictionaryTranslationStorage, source, target),
      setCached: (source, translated, target) => setCachedDictionaryTranslation(dictionaryTranslationStorage, source, translated, target),
      translateRemote: async (source, target, signal) => {
        const response = await sendMessage<{ ok: boolean; payload?: DictionaryRemoteTranslationResponse; error?: string }>(
          MESSAGE_TYPES.DICTIONARY_TRANSLATE_REMOTE,
          { word: source.word, sourceEntry: source, targetLanguage: target, requestId },
        );
        if (!response?.ok || !response.payload) {
          throw new Error(response?.error ?? "REMOTE_TRANSLATION_FAILED");
        }
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return {
          entry: response.payload.entry,
          status: response.payload.status === "partial" ? "partial" : response.payload.status === "translated" ? "translated" : "fallback",
          provider: response.payload.provider === "openrouter" ? "openrouter" : response.payload.provider === "free-dictionary-api" ? "free-dictionary-api" : "fallback",
        };
      },
    });
    if (requestId !== currentRequestId || controller.signal.aborted || !state) return;
    setState({ phase: { kind: "ready", entry: result.entry }, translationStatus: result.status });
    requestAnimationFrame(() => currentSelectionInfo && placePopup(getSelectionRect(currentSelectionInfo)));
  } catch (error) {
    if (requestId !== currentRequestId || controller.signal.aborted || !state) return;
    if (entry) setState({ phase: { kind: "ready", entry }, translationStatus: "fallback" });
    else setPhase({ kind: "error", code: "INTERNAL" });
  } finally {
    if (translationController === controller) translationController = null;
  }
}

function handleRetry() {
  if (!currentSelectionInfo) return;
  void openPopup(currentSelectionInfo, false);
}

function handleLookupWord(text: string) {
  if (!state) return;
  const mode = classifySelection(text);
  const lookupText = (mode.kind === "word" ? mode.lookupText : mode.sourceText).trim();
  if (!lookupText || lookupText.toLowerCase() === state.word.toLowerCase()) return;
  stopAIStream();
  stopDictionaryTranslation();
  const myId = ++currentRequestId;
  void runWordLookup(lookupText, currentSelectionInfo?.pageLanguage, myId);
}

function openSettingsPage() {
  closePopup();
  void sendMessage(MESSAGE_TYPES.OPEN_SETTINGS, undefined);
}

function showSelectionTrigger(info: SelectionInfo) {
  stopAIStream();
  stopDictionaryTranslation();
  stopPreparedPronunciations();
  stopViewportWatcher();
  popupWasOpened = false;
  state = null;
  sourceDictionaryEntry = null;
  currentSelectionInfo = info;
  selectionTriggerInfo = info;
  selectionTriggerPosition = computeSelectionTriggerPosition(getSelectionRect(info), { width: 36, height: 36 }, getPopupViewport(), info.pointerPosition);
  popupPosition = null;
  ensureMounted();
  render();
  addOutsideListeners();
}

function activateSelectionTrigger() {
  const info = selectionTriggerInfo;
  if (!info) return;
  selectionTriggerPointerDown = false;
  void openPopup(info, true);
}

function closePopup() {
  stopAIStream();
  stopDictionaryTranslation();
  stopPreparedPronunciations();
  stopViewportWatcher();
  popupWasOpened = false;
  state = null;
  selectionTriggerInfo = null;
  selectionTriggerPosition = null;
  selectionTriggerPointerDown = false;
  currentSelectionInfo = null;
  sourceDictionaryEntry = null;
  popupPosition = null;
  if (rootRef) {
    rootRef.render(null);
  }
  unmountShadowHost();
  rootRef = null;
  hostEl = null;
  containerEl = null;
  shadowEl = null;
  removeOutsideListeners();
}

function stopAIStream() {
  if (!aiPort) return;
  const port = aiPort;
  aiPort = null;
  port.disconnect();
}

function handleStopAI() {
  stopAIStream();
  if (state) setState({ aiLoading: false });
}

function addOutsideListeners() {
  startViewportWatcher();
  if (!outsideClickListener) {
    outsideClickListener = (ev: MouseEvent) => {
      if (!state && !selectionTriggerInfo) return;
      const target = ev.target as Node | null;
      if (!target) return;
      if (hostEl && (target === hostEl || hostEl.contains(target))) {
        return; // click inside popup shadow root
      }
      // Allow selection to start a new selection - but if the user actively clicks elsewhere we close.
      closePopup();
    };
    document.addEventListener("mousedown", outsideClickListener, true);
  }
  if (!escListener) {
    escListener = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        closePopup();
      }
    };
    document.addEventListener("keydown", escListener, true);
  }
  if (!resizeListener) {
    resizeListener = () => {
      if (!currentSelectionInfo) return;
      if (popupWasOpened) placePopup(getSelectionRect(currentSelectionInfo));
      else if (selectionTriggerInfo) placeSelectionTrigger(getSelectionRect(currentSelectionInfo));
    };
    window.addEventListener("resize", resizeListener);
    window.addEventListener("scroll", resizeListener, true);
    window.visualViewport?.addEventListener("resize", resizeListener);
    window.visualViewport?.addEventListener("scroll", resizeListener);
  }
}

function removeOutsideListeners() {
  if (outsideClickListener) {
    document.removeEventListener("mousedown", outsideClickListener, true);
    outsideClickListener = null;
  }
  if (escListener) {
    document.removeEventListener("keydown", escListener, true);
    escListener = null;
  }
  if (resizeListener) {
    window.removeEventListener("resize", resizeListener);
    window.removeEventListener("scroll", resizeListener, true);
    window.visualViewport?.removeEventListener("resize", resizeListener);
    window.visualViewport?.removeEventListener("scroll", resizeListener);
    resizeListener = null;
  }
}

function onSelectionEvent(ev: MouseEvent | KeyboardEvent | null) {
  if (settings.selectionTriggerMode === "off") return;
  // Ignore selection inside our shadow host
  const target = ev?.target as Node | null;
  if (hostEl && target && (target === hostEl || hostEl.contains(target))) {
    return;
  }
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }
  const pointerPosition = ev instanceof MouseEvent ? { x: ev.clientX, y: ev.clientY } : undefined;
  debounceTimer = window.setTimeout(() => {
      void (async () => {
        await refreshSettings();
       if (settings.selectionTriggerMode === "off") return;
       const sel = getCurrentSelection(target, pointerPosition);
       if (!sel) {
         const liveSelection = window.getSelection();
         if ((!liveSelection || liveSelection.isCollapsed) && selectionTriggerInfo && !selectionTriggerPointerDown) {
           closePopup();
         }
         return;
       }
       if (sel.text === lastSelectionText && (popupWasOpened || selectionTriggerInfo)) {
         return;
       }
       lastSelectionText = sel.text;
       if (settings.selectionTriggerMode === "icon") showSelectionTrigger(sel);
       else void openPopup(sel, true);
      })();
  }, SELECTION_DEBOUNCE_MS);
}

async function refreshSettings() {
  const requestRevision = settingsRevision;
  try {
    const res = await sendMessage<{ ok: boolean; payload: PopupSettings }>(MESSAGE_TYPES.GET_POPUP_SETTINGS, undefined);
    if (res?.ok && res.payload && requestRevision === settingsRevision) {
      applySettings(res.payload);
    }
  } catch {
    /* ignore */
  }
}

function applySettings(next: PopupSettings) {
  settingsRevision += 1;
  const targetLanguageChanged = settings.targetLanguage !== next.targetLanguage;
  const themeChanged = settings.theme !== next.theme;
  const previousMode = settings.selectionTriggerMode;
  settings = next;
  if (themeChanged) {
    applyHostTheme(next.theme);
  }
  if (next.selectionTriggerMode === "off" && (popupWasOpened || selectionTriggerInfo)) {
    closePopup();
    return;
  }
  if (selectionTriggerInfo && previousMode !== next.selectionTriggerMode && next.selectionTriggerMode !== "icon") {
    closePopup();
    return;
  }
  if (targetLanguageChanged && popupWasOpened && currentSelectionInfo) {
    // Refresh the active dictionary entry so the open popup follows Settings immediately.
     void openPopup(currentSelectionInfo, false);
  } else if (targetLanguageChanged && selectionTriggerInfo) {
    // Keep the compact trigger's accessible label in sync without starting a lookup.
    render();
  }
}

function watchSettings() {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    const next = toPopupSettings(normalizeSettings(change.newValue));
    applySettings(next);
  });
}

(function init() {
  if (document.getElementById(POPUP_HOST_ID)) {
    return; // already mounted
  }
  void refreshSettings();
  watchSettings();

  document.addEventListener("mouseup", onSelectionEvent, true);
  document.addEventListener("keyup", onSelectionEvent, true);
  // selectionchange fires very frequently; we only use it as a fallback to close popup when selection is cleared.
  document.addEventListener(
    "selectionchange",
    () => {
      if (!selectionTriggerInfo || selectionTriggerPointerDown) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        onSelectionEvent(null);
      }
    },
    true,
  );
})();
