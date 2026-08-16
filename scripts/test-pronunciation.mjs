import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isDuplicatePronunciationTrigger,
  playPronunciationCandidates,
  preparePronunciation,
  speakPronunciation,
  stopPreparedPronunciations,
} from "../src/services/dictionary/pronunciation.ts";

class FakeAudio {
  dataset = {};
  listeners = new Map();
  paused = true;
  playCalls = 0;
  loadCalls = 0;
  currentTime = 0;
  removed = false;
  volume = 1;
  preload = "";
  src = "";
  style = {};
  readyState = 4;
  networkState = 1;

  constructor(playBehavior) {
    this.playBehavior = playBehavior;
  }

  setAttribute() {}

  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((entry) => entry.listener !== listener));
  }

  dispatch(type) {
    const listeners = [...(this.listeners.get(type) ?? [])];
    for (const entry of listeners) {
      entry.listener();
      if (entry.once) this.removeEventListener(type, entry.listener);
    }
  }

  play() {
    this.playCalls += 1;
    return this.playBehavior(this, this.playCalls).then(() => {
      this.paused = false;
    });
  }

  load() {
    this.loadCalls += 1;
  }

  pause() {
    this.paused = true;
  }

  remove() {
    this.removed = true;
  }
}

function makeDocument(playBehavior = () => Promise.resolve()) {
  const audios = [];
  const documentLike = {
    body: {
      appendChild(audio) {
        if (!audios.includes(audio)) audios.push(audio);
      },
    },
    documentElement: {
      appendChild(audio) {
        if (!audios.includes(audio)) audios.push(audio);
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "audio");
      return new FakeAudio(playBehavior);
    },
    querySelectorAll() {
      return audios.filter((audio) => !audio.removed);
    },
  };
  return { documentLike, audios };
}

function makeSpeechWindow({ voices = [], behavior = "start", cancelBehavior = "none" } = {}) {
  const utterances = [];
  let activeUtterance = null;
  const speechSynthesis = {
    cancelCalls: 0,
    cancel() {
      this.cancelCalls += 1;
      if (cancelBehavior === "error") activeUtterance?.onerror?.(new Error("cancelled"));
    },
    getVoices() {
      return voices;
    },
    speak(utterance) {
      utterances.push(utterance);
      activeUtterance = utterance;
      const outcome = typeof behavior === "function" ? behavior(utterance, utterances.length) : behavior;
      if (outcome === "start") utterance.onstart?.();
      if (outcome === "error") utterance.onerror?.(new Error("speech failed"));
      if (outcome === "throw") throw new Error("speech unavailable");
    },
  };
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.voice = null;
      this.onstart = null;
      this.onerror = null;
    }
  }
  return { speechSynthesis, utterances, SpeechSynthesisUtterance: FakeUtterance };
}

async function withSpeechWindow(speechWindow, callback) {
  const hadWindow = Object.hasOwn(globalThis, "window");
  const previousWindow = globalThis.window;
  globalThis.window = speechWindow;
  try {
    return await callback();
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
}

async function withManualTimers(callback) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nextTimerId = 0;
  const timers = new Map();
  globalThis.setTimeout = (callback) => {
    const timerId = ++nextTimerId;
    timers.set(timerId, callback);
    return timerId;
  };
  globalThis.clearTimeout = (timerId) => {
    timers.delete(timerId);
  };
  try {
    return await callback({
      count: () => timers.size,
      runNext: () => {
        const [timerId, timer] = timers.entries().next().value ?? [];
        assert.ok(timer, "expected a scheduled timer");
        timers.delete(timerId);
        timer();
      },
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

async function withChromeRuntime(runtime, callback) {
  const hadChrome = Object.hasOwn(globalThis, "chrome");
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { runtime };
  try {
    return await callback();
  } finally {
    if (hadChrome) globalThis.chrome = previousChrome;
    else delete globalThis.chrome;
  }
}

const directUrl = "https://api.dictionaryapi.dev/media/pronunciations/en/run-us.mp3";
const ukUrl = "https://api.dictionaryapi.dev/media/pronunciations/en/run-uk.mp3";
const fallbackUrl = "https://api.dictionaryapi.dev/media/pronunciations/en/run-au.mp3";

function withDeadline(promise, milliseconds) {
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`deadline exceeded after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeoutId));
}

stopPreparedPronunciations();
{
  const { documentLike, audios } = makeDocument();
  let errors = 0;
  const playback = playPronunciationCandidates([directUrl], documentLike, () => { errors += 1; });
  assert.equal(audios.length, 1, "trusted interaction should synchronously create direct audio");
  assert.equal(audios[0].src, directUrl);
  assert.equal(audios[0].playCalls, 1, "play() must run before an async proxy lookup can lose user activation");
  await playback;
  assert.equal(errors, 0);
}

stopPreparedPronunciations();
{
  const { documentLike, audios } = makeDocument((audio) => (
    audio.src === "blob:prepared-uk" || audio.src === ukUrl
      ? Promise.reject(new Error("UK recording failed"))
      : Promise.resolve()
  ));
  const prepared = preparePronunciation(ukUrl, documentLike, "blob:prepared-uk");
  await withChromeRuntime({
    sendMessage(_message, callback) {
      callback({ ok: true, payload: { dataUrl: "data:audio/mpeg;base64,AA==" } });
    },
  }, () => playPronunciationCandidates([ukUrl, directUrl], documentLike));
  assert.equal(prepared.playCalls, 1, "prepared audio should be attempted first");
  assert.equal(audios[1].src, ukUrl, "the direct candidate should follow prepared audio");
  assert.match(audios[2].src, /^blob:/, "the proxy candidate should follow direct audio");
  assert.equal(audios[2].playCalls, 1, "the proxy candidate should play before another region");
}

stopPreparedPronunciations();
{
  const proxyUrl = "https://api.dictionaryapi.dev/media/pronunciations/en/run-proxy.mp3";
  const { documentLike, audios } = makeDocument((audio) => (
    audio.src === ukUrl ? Promise.reject(new Error("direct recording failed")) : Promise.resolve()
  ));
  const speechWindow = makeSpeechWindow();
  let resolveProxy;
  let oldErrors = 0;
  await withChromeRuntime({
    sendMessage(_message, callback) {
      resolveProxy = () => callback({ ok: true, payload: { dataUrl: proxyUrl } });
    },
  }, () => withSpeechWindow(speechWindow, async () => {
    const oldPlayback = playPronunciationCandidates([ukUrl], documentLike, () => { oldErrors += 1; }, {
      text: "older",
      lang: "en-GB",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(resolveProxy, "older playback should be waiting for its proxy source");

    await playPronunciationCandidates([], documentLike, undefined, {
      text: "newer",
      lang: "en-US",
    });
    resolveProxy();
    await oldPlayback;
  }));
  assert.equal(speechWindow.utterances.length, 1, "the latest interaction should own synthesized speech");
  assert.equal(speechWindow.speechSynthesis.cancelCalls, 0, "stale proxy playback must not cancel newer speech");
  assert.equal(audios.filter((audio) => audio.src === proxyUrl).every((audio) => audio.playCalls === 0), true, "stale proxy audio must not play");
  assert.equal(audios.filter((audio) => audio.src === proxyUrl).every((audio) => audio.removed), true, "stale proxy audio should be cleaned up");
  assert.equal(oldErrors, 0, "stale proxy playback must finish without surfacing an error");
}

stopPreparedPronunciations();
{
  const { documentLike, audios } = makeDocument((audio) => (
    audio.src === directUrl ? Promise.reject(new Error("provider failed")) : Promise.resolve()
  ));
  let errors = 0;
  await playPronunciationCandidates([directUrl, fallbackUrl], documentLike, () => { errors += 1; });
  assert.deepEqual(audios.map((audio) => audio.src), [directUrl, fallbackUrl]);
  assert.equal(audios[1].playCalls, 1, "the alternate pronunciation should be attempted");
  assert.equal(errors, 0);
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument((audio) => (
    audio.src === "blob:prepared-uk"
      ? new Promise(() => undefined)
      : audio.src === ukUrl
        ? Promise.reject(new Error("UK provider failed"))
        : Promise.resolve()
  ));
  const preparedUk = preparePronunciation(ukUrl, documentLike, "blob:prepared-uk");
  const preparedUs = preparePronunciation(directUrl, documentLike, "blob:prepared-us");
  let errors = 0;
  await withDeadline(
    playPronunciationCandidates([ukUrl, directUrl], documentLike, () => { errors += 1; }),
    2500,
  );
  assert.equal(preparedUk.playCalls, 1, "the primary UK source should be attempted first");
  assert.equal(preparedUs.playCalls, 1, "a prepared US source should run after the UK source hangs");
  assert.equal(errors, 0);
}

stopPreparedPronunciations();
{
  const { documentLike, audios } = makeDocument((_audio, call) => (
    call === 1 ? Promise.reject(new Error("still loading")) : Promise.resolve()
  ));
  const playback = playPronunciationCandidates([directUrl], documentLike);
  audios[0].readyState = 0;
  await Promise.resolve();
  await Promise.resolve();
  audios[0].readyState = 3;
  audios[0].dispatch("canplay");
  await playback;
  assert.equal(audios[0].playCalls, 2, "canplay should retry a source that rejected while loading");
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument(() => Promise.reject(new Error("decode failed")));
  let errors = 0;
  await playPronunciationCandidates([directUrl, directUrl, fallbackUrl], documentLike, () => { errors += 1; });
  assert.equal(errors, 1, "all exhausted strategies should produce one user-facing error");
}

stopPreparedPronunciations();
{
  const { documentLike, audios } = makeDocument();
  const prepared = preparePronunciation(directUrl, documentLike, "blob:prepared-audio");
  assert.ok(prepared);
  await playPronunciationCandidates([directUrl], documentLike);
  assert.equal(prepared.src, "blob:prepared-audio");
  assert.equal(prepared.playCalls, 1);
  stopPreparedPronunciations();
  assert.equal(prepared.paused, true);
  assert.equal(prepared.removed, true);
  assert.equal(audios.filter((audio) => !audio.removed).length, 0);
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument();
  const speechWindow = makeSpeechWindow({ voices: [{ lang: "en-GB", name: "British" }] });
  let errors = 0;
  await withSpeechWindow(speechWindow, () => playPronunciationCandidates([], documentLike, () => { errors += 1; }, {
    text: "especially",
    lang: "en-GB",
  }));
  assert.equal(speechWindow.utterances.length, 1, "empty candidates should use speech synthesis");
  assert.equal(speechWindow.utterances[0].text, "especially");
  assert.equal(speechWindow.utterances[0].lang, "en-GB");
  assert.equal(errors, 0, "speech fallback must prevent the audio error");
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument(() => Promise.reject(new Error("decode failed")));
  const speechWindow = makeSpeechWindow({ voices: [{ lang: "en-US", name: "American" }] });
  await withSpeechWindow(speechWindow, () => playPronunciationCandidates([directUrl], documentLike, undefined, {
    text: "especially",
    lang: "en-US",
  }));
  assert.equal(speechWindow.utterances.length, 1, "broken recordings should use speech synthesis");
  assert.equal(speechWindow.utterances[0].lang, "en-US");
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow({
    voices: [{ lang: "en-AU", name: "Australian" }, { lang: "EN-gb", name: "British" }],
  });
  await speakPronunciation({ text: "especially", lang: "en-GB" }, speechWindow);
  assert.equal(speechWindow.utterances[0].voice?.name, "British", "an exact locale voice should win");
  assert.equal(speechWindow.utterances[0].lang, "en-GB");
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow({ voices: [{ lang: "en-AU", name: "Australian" }] });
  await speakPronunciation({ text: "especially", lang: "en-US" }, speechWindow);
  assert.equal(speechWindow.utterances[0].voice?.name, "Australian", "an English voice should be used when exact locale is absent");
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow();
  await speakPronunciation({ text: "first", lang: "en-GB" }, speechWindow);
  await speakPronunciation({ text: "second", lang: "en-US" }, speechWindow);
  assert.equal(speechWindow.speechSynthesis.cancelCalls, 1, "a new speech request cancels the previous browser speech");
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument(() => Promise.reject(new Error("decode failed")));
  const speechWindow = makeSpeechWindow({ behavior: "error" });
  let errors = 0;
  await withSpeechWindow(speechWindow, () => playPronunciationCandidates([directUrl], documentLike, () => { errors += 1; }, {
    text: "especially",
    lang: "en-US",
  }));
  assert.equal(errors, 1, "audio and speech failure should surface one error");
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow();
  await speakPronunciation({ text: "especially", lang: "en-GB" }, speechWindow);
  stopPreparedPronunciations();
  assert.equal(speechWindow.speechSynthesis.cancelCalls, 1, "stopping prepared pronunciations also cancels speech");
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow({
    behavior: (_utterance, attempt) => attempt === 1 ? "pending" : "start",
    cancelBehavior: "error",
  });
  await withManualTimers(async (timers) => {
    const firstOutcome = speakPronunciation({ text: "first", lang: "en-GB" }, speechWindow)
      .then(() => null, (error) => error);
    const lateStart = speechWindow.utterances[0].onstart;
    assert.equal(timers.count(), 1, "pending speech should own one start timer");
    await speakPronunciation({ text: "second", lang: "en-US" }, speechWindow);
    const cancellation = await firstOutcome;
    assert.equal(cancellation?.message, "PRONUNCIATION_SPEECH_CANCELLED");
    assert.equal(speechWindow.utterances[0].onstart, null, "superseding speech clears pending start handlers");
    assert.equal(speechWindow.utterances[0].onerror, null, "superseding speech clears pending error handlers");
    assert.equal(timers.count(), 0, "superseding speech clears its stale start timer");
    lateStart?.();
    assert.equal(speechWindow.speechSynthesis.cancelCalls, 1, "a late start callback cannot revive cancelled speech");
  });
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow({ behavior: "pending", cancelBehavior: "error" });
  await withManualTimers(async (timers) => {
    const result = speakPronunciation({ text: "especially", lang: "en-GB" }, speechWindow);
    assert.equal(timers.count(), 1, "speech start should schedule one timeout");
    timers.runNext();
    await assert.rejects(result, /PRONUNCIATION_SPEECH_START_TIMEOUT/);
    assert.equal(speechWindow.speechSynthesis.cancelCalls, 1, "start timeout must cancel synthesis");
    assert.equal(speechWindow.utterances[0].onstart, null, "timed-out speech ignores a late start");
    assert.equal(timers.count(), 0, "timed-out speech clears its timer");
  });
}

stopPreparedPronunciations();
{
  const speechWindow = makeSpeechWindow({ behavior: "start" });
  const { documentLike } = makeDocument();
  await speakPronunciation({ text: "especially", lang: "en-GB" }, speechWindow);
  await playPronunciationCandidates([directUrl], documentLike);
  assert.equal(speechWindow.speechSynthesis.cancelCalls, 1, "recorded audio cancels active synthesized speech");
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument();
  const speechWindow = makeSpeechWindow({ behavior: (_utterance, attempt) => attempt === 1 ? "pending" : "start" });
  let firstErrors = 0;
  let secondErrors = 0;
  await withSpeechWindow(speechWindow, async () => {
    const first = playPronunciationCandidates([], documentLike, () => { firstErrors += 1; }, {
      text: "especially",
      lang: "en-GB",
    });
    await playPronunciationCandidates([], documentLike, () => { secondErrors += 1; }, {
      text: "especially",
      lang: "en-GB",
    });
    await first;
  });
  assert.equal(firstErrors, 0, "superseded speech must not surface a stale audio error");
  assert.equal(secondErrors, 0, "the succeeding replacement should not surface an error");
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument();
  const speechWindow = makeSpeechWindow({ behavior: "pending" });
  let errors = 0;
  await withSpeechWindow(speechWindow, async () => {
    const playback = playPronunciationCandidates([], documentLike, () => { errors += 1; }, {
      text: "especially",
      lang: "en-GB",
    });
    stopPreparedPronunciations();
    await playback;
  });
  assert.equal(errors, 0, "stopping pending speech must not surface a stale audio error");
}

stopPreparedPronunciations();
{
  const { documentLike } = makeDocument();
  const speechWindow = makeSpeechWindow();
  const speechFallback = { text: "especially", lang: "en-GB" };
  const triggerKey = `${speechFallback.lang}:${speechFallback.text}`;
  let previousTrigger = null;
  let errors = 0;
  await withSpeechWindow(speechWindow, async () => {
    for (const eventTime of [1000, 1001]) {
      if (isDuplicatePronunciationTrigger(previousTrigger, triggerKey, eventTime)) continue;
      previousTrigger = { key: triggerKey, at: eventTime };
      await playPronunciationCandidates([], documentLike, () => { errors += 1; }, speechFallback);
    }
  });
  assert.equal(speechWindow.utterances.length, 1, "one no-URL regional click identity launches one speech attempt");
  assert.equal(errors, 0, "one no-URL regional click identity surfaces no duplicate errors");
}

{
  const headerSource = await readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8");
  assert.match(headerSource, /const audioUk = entry\.phonetics\?\.audioUk;/);
  assert.match(headerSource, /const audioUs = entry\.phonetics\?\.audioUs;/);
  assert.match(headerSource, /playPronunciationCandidates\(\[url, fallbackUrl\][\s\S]*?speechFallback\)/);
  assert.match(headerSource, /\[audioUkButtonRef\.current, audioUk, audioUs, \{ text: entry\.word, lang: "en-GB" \}\]/);
  assert.match(headerSource, /\[audioUsButtonRef\.current, audioUs, audioUk, \{ text: entry\.word, lang: "en-US" \}\]/);
  assert.match(headerSource, /const triggerKey = `\$\{speechFallback\.lang\}:\$\{speechFallback\.text\}`;/);
  assert.match(headerSource, /handleAudioPointerDown\(triggerKey, url, fallbackUrl, speechFallback\)/);
  assert.match(headerSource, /registerShadowButtonAction\(button, \(\) => handleAudioPointerDown\(triggerKey, url, fallbackUrl, speechFallback\)\)/);
  assert.doesNotMatch(headerSource, /disabled=!audio(?:Uk|Us)/);
  assert.match(headerSource, /\{entry\.word && \([\s\S]*?<span className="font-medium">UK<\/span>[\s\S]*?<span className="font-medium">US<\/span>/);
}

assert.equal(isDuplicatePronunciationTrigger({ key: "en-GB:especially", at: 1000 }, "en-GB:especially", 1075), true);
assert.equal(isDuplicatePronunciationTrigger({ key: "en-GB:especially", at: 1000 }, "en-US:especially", 1075), false);
assert.equal(isDuplicatePronunciationTrigger({ key: "en-GB:especially", at: 1000 }, "en-GB:especially", 1201), false);

console.log("PASS: pronunciation keeps trusted playback, retries loading, falls back, and cleans up.");
