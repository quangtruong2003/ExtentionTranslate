let activeAudio: HTMLAudioElement | null = null;
interface ActiveSpeechPlayback {
  cancel: () => void;
}

let activeSpeechPlayback: ActiveSpeechPlayback | null = null;
const preparedAudio = new Map<string, HTMLAudioElement>();
const ownedAudio = new Set<HTMLAudioElement>();
const sourcePromises = new Map<string, Promise<string>>();
const sourceObjectUrls = new Map<string, string>();
const sourceMaterializePromises = new Map<string, Promise<string>>();
let preparationEpoch = 0;
let playbackGeneration = 0;
const PLAYBACK_TIMEOUT_MS = 1500;
const PROXY_SOURCE_TIMEOUT_MS = 1500;

interface PronunciationTrigger {
  key: string;
  at: number;
}

export interface PronunciationSpeechFallback {
  text: string;
  lang: string;
}

function stalePlaybackError() {
  return new Error("PRONUNCIATION_PLAYBACK_STALE");
}

function isStalePlaybackError(error: unknown): boolean {
  return error instanceof Error && error.message === "PRONUNCIATION_PLAYBACK_STALE";
}

function cancelActiveSpeech() {
  activeSpeechPlayback?.cancel();
}

export function speakPronunciation(
  fallback: PronunciationSpeechFallback,
  windowLike: Window | undefined = typeof window === "undefined" ? undefined : window,
): Promise<void> {
  const speechSynthesis = windowLike?.speechSynthesis;
  const Utterance = (windowLike as (Window & {
    SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  }) | undefined)?.SpeechSynthesisUtterance;
  if (!speechSynthesis || !Utterance) {
    return Promise.reject(new Error("PRONUNCIATION_SPEECH_UNAVAILABLE"));
  }

  let utterance: SpeechSynthesisUtterance;
  try {
    cancelActiveSpeech();
    utterance = new Utterance(fallback.text);
    utterance.lang = fallback.lang;
    const normalizedLocale = fallback.lang.toLowerCase();
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === normalizedLocale)
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
      ?? null;
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let forcedError: Error | null = null;
    let playback: ActiveSpeechPlayback;
    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      utterance.onstart = null;
      utterance.onerror = null;
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        if (activeSpeechPlayback === playback) activeSpeechPlayback = null;
        reject(error);
      } else {
        resolve();
      }
    };
    const timeoutId = globalThis.setTimeout(() => {
      const timeoutError = new Error("PRONUNCIATION_SPEECH_START_TIMEOUT");
      forcedError = timeoutError;
      try {
        speechSynthesis.cancel();
      } catch {
        // The start timeout remains the observable failure even if cancellation fails.
      }
      finish(timeoutError);
    }, PLAYBACK_TIMEOUT_MS);
    playback = {
      cancel: () => {
        if (activeSpeechPlayback !== playback) return;
        const cancellationError = new Error("PRONUNCIATION_SPEECH_CANCELLED");
        forcedError = cancellationError;
        try {
          speechSynthesis.cancel();
        } catch {
          // The cancellation error remains distinguishable to the superseded caller.
        }
        activeSpeechPlayback = null;
        finish(cancellationError);
      },
    };

    utterance.onstart = () => finish();
    utterance.onerror = () => finish(forcedError ?? new Error("PRONUNCIATION_SPEECH_FAILED"));
    activeSpeechPlayback = playback;
    try {
      speechSynthesis.speak(utterance);
    } catch (error) {
      finish(error);
    }
  });
}

function releaseObjectUrl(url: string) {
  const objectUrl = sourceObjectUrls.get(url);
  if (!objectUrl) return;
  globalThis.URL.revokeObjectURL?.(objectUrl);
  sourceObjectUrls.delete(url);
}

function disposeAudio(audio: HTMLAudioElement, url?: string) {
  if (activeAudio === audio) activeAudio = null;
  audio.pause();
  audio.currentTime = 0;
  audio.remove();
  ownedAudio.delete(audio);
  if (url && preparedAudio.get(url) === audio) {
    preparedAudio.delete(url);
    releaseObjectUrl(url);
  }
}

function materializePronunciationSource(url: string, sourceUrl: string): Promise<string> {
  if (!sourceUrl.startsWith("data:") || typeof globalThis.URL.createObjectURL !== "function") {
    return Promise.resolve(sourceUrl);
  }
  const existing = sourceObjectUrls.get(url);
  if (existing) return Promise.resolve(existing);
  const pending = sourceMaterializePromises.get(url);
  if (pending) return pending;
  const promise = fetch(sourceUrl)
    .then((response) => response.blob())
    .then((blob) => {
      const objectUrl = globalThis.URL.createObjectURL(blob);
      sourceObjectUrls.set(url, objectUrl);
      return objectUrl;
    })
    .finally(() => sourceMaterializePromises.delete(url));
  sourceMaterializePromises.set(url, promise);
  return promise;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function configureAudio(audio: HTMLAudioElement, url: string, sourceUrl: string, documentLike: Document): HTMLAudioElement {
  audio.dataset.extentionTranslatePronunciation = "true";
  audio.dataset.extentionTranslatePronunciationUrl = url;
  audio.preload = "auto";
  audio.src = sourceUrl;
  audio.setAttribute("aria-hidden", "true");
  Object.assign(audio.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    left: "-10000px",
  });
  (documentLike.body ?? documentLike.documentElement).appendChild(audio);
  ownedAudio.add(audio);
  audio.load();
  return audio;
}

function createAudio(url: string, sourceUrl: string, documentLike: Document): HTMLAudioElement {
  return configureAudio(documentLike.createElement("audio"), url, sourceUrl, documentLike);
}

export function preparePronunciation(
  url: string | undefined,
  documentLike: Document = document,
  sourceUrl = url,
): HTMLAudioElement | null {
  if (!url || !sourceUrl) return null;
  const existing = preparedAudio.get(url);
  if (existing) return existing;
  const audio = createAudio(url, sourceUrl, documentLike);
  preparedAudio.set(url, audio);
  return audio;
}

function resolvePronunciationSource(url: string): Promise<string> {
  const existing = sourcePromises.get(url);
  if (existing) return existing;

  const promise = new Promise<string>((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve(url);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "PRONUNCIATION_FETCH", payload: { url } },
      (response: { ok?: boolean; payload?: { dataUrl?: string }; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        const dataUrl = response?.ok ? response.payload?.dataUrl : undefined;
        if (dataUrl) resolve(dataUrl);
        else reject(new Error(response?.error || "PRONUNCIATION_FETCH_FAILED"));
      },
    );
  });
  sourcePromises.set(url, promise);
  return promise;
}

async function prepareProxyPronunciation(
  url: string,
  documentLike: Document,
  ownsPlayback: () => boolean,
): Promise<HTMLAudioElement | null> {
  try {
    const sourceUrl = await withTimeout(
      resolvePronunciationSource(url),
      PROXY_SOURCE_TIMEOUT_MS,
      "PRONUNCIATION_SOURCE_TIMEOUT",
    );
    if (!ownsPlayback()) return null;
    const playbackSourceUrl = await withTimeout(
      materializePronunciationSource(url, sourceUrl),
      PROXY_SOURCE_TIMEOUT_MS,
      "PRONUNCIATION_SOURCE_MATERIALIZE_TIMEOUT",
    );
    if (!ownsPlayback()) return null;
    if (playbackSourceUrl === url) return null;
    const existing = preparedAudio.get(url);
    if (existing) disposeAudio(existing, url);
    if (!ownsPlayback()) return null;
    return preparePronunciation(url, documentLike, playbackSourceUrl);
  } catch {
    sourcePromises.delete(url);
    return null;
  }
}

export async function preloadPronunciation(
  url: string | undefined,
  documentLike: Document = document,
): Promise<HTMLAudioElement | null> {
  if (!url) return null;
  const epoch = preparationEpoch;
  const existing = preparedAudio.get(url);
  if (existing) return existing;
  try {
    const sourceUrl = await resolvePronunciationSource(url);
    const playbackSourceUrl = await materializePronunciationSource(url, sourceUrl);
    if (epoch !== preparationEpoch) return null;
    return preparePronunciation(url, documentLike, playbackSourceUrl);
  } catch {
    sourcePromises.delete(url);
    return null;
  }
}

export function isPronunciationPrepared(url: string | undefined, documentLike: Document = document): boolean {
  if (!url) return false;
  if (preparedAudio.has(url)) return true;
  if (!documentLike.querySelectorAll) return false;
  return Array.from(documentLike.querySelectorAll<HTMLAudioElement>("audio[data-extention-translate-pronunciation]"))
    .some((audio) => audio.dataset.extentionTranslatePronunciationUrl === url);
}

function playAudioElement(audio: HTMLAudioElement, ownsPlayback: () => boolean): Promise<void> {
  if (!ownsPlayback()) return Promise.reject(stalePlaybackError());
  cancelActiveSpeech();
  if (activeAudio && activeAudio !== audio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }
  activeAudio = audio;
  audio.currentTime = 0;
  audio.volume = 0.9;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let attempting = false;
    const timeoutId = globalThis.setTimeout(() => finish(new Error("PRONUNCIATION_TIMEOUT")), PLAYBACK_TIMEOUT_MS);

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      audio.removeEventListener("loadeddata", retry);
      audio.removeEventListener("canplay", retry);
      audio.removeEventListener("error", failFromMedia);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      audio.addEventListener("ended", () => {
        if (activeAudio === audio) activeAudio = null;
      }, { once: true });
      resolve();
    };
    const finish = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (activeAudio === audio) activeAudio = null;
      reject(error);
    };
    const failFromMedia = () => finish(new Error("PRONUNCIATION_MEDIA_ERROR"));
    const tryPlay = async () => {
      if (settled || attempting) return;
      if (!ownsPlayback()) {
        finish(stalePlaybackError());
        return;
      }
      attempting = true;
      try {
        await audio.play();
        if (!ownsPlayback()) {
          finish(stalePlaybackError());
          return;
        }
        succeed();
      } catch (error) {
        attempting = false;
        if ((audio.readyState ?? 4) > 0) finish(error);
      }
    };
    const retry = () => {
      void tryPlay();
    };

    audio.addEventListener("loadeddata", retry);
    audio.addEventListener("canplay", retry);
    audio.addEventListener("error", failFromMedia, { once: true });
    void tryPlay();
  });
}

function normalizePronunciationUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://api.dictionaryapi.dev");
    if (url.protocol !== "https:" || url.hostname !== "api.dictionaryapi.dev") return null;
    return url.href;
  } catch {
    return null;
  }
}

async function playPreparedPronunciationCandidate(url: string, ownsPlayback: () => boolean): Promise<void> {
  if (!ownsPlayback()) throw stalePlaybackError();
  const prepared = preparedAudio.get(url);
  if (!prepared) throw new Error("PRONUNCIATION_NOT_PREPARED");
  try {
    await playAudioElement(prepared, ownsPlayback);
  } catch (error) {
    if (!isStalePlaybackError(error)) disposeAudio(prepared, url);
    throw error;
  }
}

async function playDirectPronunciationCandidate(
  url: string,
  documentLike: Document,
  ownsPlayback: () => boolean,
): Promise<void> {
  if (!ownsPlayback()) throw stalePlaybackError();
  const directAudio = createAudio(url, url, documentLike);
  try {
    await playAudioElement(directAudio, ownsPlayback);
  } catch (error) {
    disposeAudio(directAudio);
    throw error;
  }
}

async function playProxyPronunciationCandidate(
  url: string,
  documentLike: Document,
  ownsPlayback: () => boolean,
): Promise<void> {
  if (!ownsPlayback()) throw stalePlaybackError();
  const proxyAudio = await prepareProxyPronunciation(url, documentLike, ownsPlayback);
  if (!ownsPlayback()) {
    if (proxyAudio && activeAudio !== proxyAudio) disposeAudio(proxyAudio, url);
    throw stalePlaybackError();
  }
  if (!proxyAudio) throw new Error("PRONUNCIATION_SOURCE_FAILED");
  try {
    await playAudioElement(proxyAudio, ownsPlayback);
  } catch (error) {
    disposeAudio(proxyAudio, url);
    throw error;
  }
}

export async function playPronunciationCandidates(
  urls: Array<string | undefined>,
  documentLike: Document = document,
  onError: () => void = () => undefined,
  speechFallback?: PronunciationSpeechFallback,
): Promise<void> {
  const generation = ++playbackGeneration;
  const ownsPlayback = () => generation === playbackGeneration;
  const candidates = Array.from(new Set(urls.map(normalizePronunciationUrl).filter((url): url is string => Boolean(url))));
  for (const url of candidates) {
    if (!ownsPlayback()) return;
    if (preparedAudio.has(url)) {
      try {
        await playPreparedPronunciationCandidate(url, ownsPlayback);
        if (!ownsPlayback()) return;
        return;
      } catch (error) {
        if (!ownsPlayback() || isStalePlaybackError(error)) return;
        // Continue with the requested recording's direct source.
      }
    }

    try {
      await playDirectPronunciationCandidate(url, documentLike, ownsPlayback);
      if (!ownsPlayback()) return;
      return;
    } catch (error) {
      if (!ownsPlayback() || isStalePlaybackError(error)) return;
      // Continue with the requested recording's background-proxied source.
    }

    try {
      await playProxyPronunciationCandidate(url, documentLike, ownsPlayback);
      if (!ownsPlayback()) return;
      return;
    } catch (error) {
      if (!ownsPlayback() || isStalePlaybackError(error)) return;
      // Continue with the other regional recording candidate.
    }
  }

  if (speechFallback) {
    if (!ownsPlayback()) return;
    try {
      await speakPronunciation(speechFallback);
      if (!ownsPlayback()) return;
      return;
    } catch (error) {
      if (!ownsPlayback() || (error instanceof Error && error.message === "PRONUNCIATION_SPEECH_CANCELLED")) return;
      // Both recording and speech-synthesis playback failed.
    }
  }
  if (!ownsPlayback()) return;
  onError();
}

export function playPreparedPronunciation(
  url: string | undefined,
  documentLike: Document = document,
  onError: () => void = () => undefined,
): Promise<void> {
  return playPronunciationCandidates([url], documentLike, onError);
}

export function isDuplicatePronunciationTrigger(
  previous: PronunciationTrigger | null,
  key: string,
  now: number,
): boolean {
  return Boolean(previous && previous.key === key && now - previous.at < 100);
}

export function stopPreparedPronunciations() {
  preparationEpoch += 1;
  playbackGeneration += 1;
  activeAudio?.pause();
  activeAudio = null;
  cancelActiveSpeech();
  for (const audio of [...ownedAudio]) disposeAudio(audio);
  preparedAudio.clear();
  for (const url of [...sourceObjectUrls.keys()]) releaseObjectUrl(url);
  sourceMaterializePromises.clear();
  sourcePromises.clear();
}

export const playPronunciation = playPreparedPronunciation;
