# ExtentionTranslate Performance, UX & Feature Upgrades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 17 approved improvements: hot-path performance wins (settings cache, parallel dictionary race, speculative prefetch, stream batching, viewport watcher, dedupe, keep-warm, backoff), UX polish (TTS read-aloud, animations, translating status), new features (AI follow-up chat, context menu, shortcuts, vocabulary history + export), and settings-page i18n.

**Architecture:** All changes follow the existing split: content script (`src/content/`) never touches the API key and talks to the background service worker (`src/background/`) through typed messages (`src/shared/constants.ts`). New pure logic goes into small testable modules under `src/services/` and `src/shared/`, exercised by Node test scripts in `scripts/` (existing convention: `node --experimental-strip-types` importing `.ts` sources directly). UI copy stays in `copy.ts` (popup) and moves to new locale files (settings page).

**Tech Stack:** TypeScript, React 18, Vite (two builds: `vite.config.ts` for background+settings, `vite.content.config.ts` for content), Manifest V3, Tailwind + shadcn/ui, Node test scripts with `node:assert/strict`.

**Spec:** User-approved brainstorm list (chat, 2026-08-17). One clarification resolved during planning: the requested "TTS fallback" for dictionary pronunciation **already exists** (`speakPronunciation` in `src/services/dictionary/pronunciation.ts:39` is wired as the final fallback of `playPronunciationCandidates`, and `DictionaryHeader.tsx:85-86` already passes `speechFallback`). Task 9 therefore delivers the *remaining* gap: read-aloud for the text-translation panel.

## Global Constraints

- Manifest V3; only add `contextMenus` permission (Task 13). No `<all_urls>` host permission, ever.
- The OpenRouter API key is read only in the background service worker; content script and popup never receive it (only `hasOpenRouterApiKey`).
- Server-side URL validation: every outbound request URL must be `http:`/`https:`; validate the host before fetching and reject `localhost`, loopback, private and reserved addresses. (Applies to Task 8's retry helper and any new fetch path; existing endpoints are fixed allowlisted constants in `src/shared/constants.ts`.)
- Popup UI copy is served by `getPopupCopy(targetLanguage)` in `src/components/dictionary/copy.ts` — add new keys there for all three languages (`en`, `vi`, `zh-CN`) whenever a task adds UI text in the popup.
- Tests follow the repo convention: plain Node scripts in `scripts/test-*.mjs` using `node:assert/strict`, importing sources via relative `.ts` paths, registered as `test:*` npm scripts.
- Do not reformat or "improve" code outside each task's listed files.
- Commit after every task with the given message.

---

# Phase 1 — Performance hot path

### Task 1: Remove per-selection settings round-trip

The selection handler currently `await refreshSettings()` before every lookup (`src/content/index.tsx:847`). Settings are already kept fresh by the `chrome.storage.onChanged` watcher (`watchSettings`, `src/content/index.tsx:905`) and the initial `refreshSettings()` in `init()`. Remove the await from the hot path.

**Files:**
- Modify: `src/content/index.tsx` (the debounced body inside `onSelectionEvent`, ~lines 845-864)
- Test: `scripts/test-selection-settings-cache.mjs`

**Interfaces:**
- Consumes: existing `refreshSettings()`, `applySettings()`, `watchSettings()` in `src/content/index.tsx`
- Produces: no new exports; selection path reads the module-level `settings` cache synchronously

- [ ] **Step 1: Write the failing test**

Create `scripts/test-selection-settings-cache.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");

// The debounced selection handler must not block on a settings round-trip.
const selectionHandler = contentSource.slice(
  contentSource.indexOf("function onSelectionEvent"),
  contentSource.indexOf("async function refreshSettings"),
);
assert.ok(selectionHandler.length > 0, "located onSelectionEvent body");
assert.doesNotMatch(selectionHandler, /await\s+refreshSettings\(\)/, "selection hot path must not await refreshSettings()");

// Settings freshness still comes from the storage watcher + init refresh.
assert.match(contentSource, /chrome\.storage\.onChanged\.addListener/, "storage.onChanged watcher remains");
const initBody = contentSource.slice(contentSource.indexOf("(function init()"));
assert.match(initBody, /refreshSettings\(\)/, "init still primes the settings cache");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-selection-settings-cache.mjs`
Expected: FAIL — `selection hot path must not await refreshSettings()`

- [ ] **Step 3: Implement**

In `src/content/index.tsx`, inside `onSelectionEvent`, change the debounced async body from:

```ts
    debounceTimer = window.setTimeout(() => {
      void (async () => {
        await refreshSettings();
       if (settings.selectionTriggerMode === "off") return;
```

to:

```ts
    debounceTimer = window.setTimeout(() => {
      void (async () => {
       if (settings.selectionTriggerMode === "off") return;
```

(Only the `await refreshSettings();` line is removed; the rest of the closure is unchanged. `refreshSettings` remains used by `init()` and is still defined.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-selection-settings-cache.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and run the selection regression tests**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-selection-trigger.mjs && node --experimental-strip-types scripts/test-selection-mode.mjs`
Expected: all PASS

- [ ] **Step 6: Register the npm script and commit**

Add to `package.json` `"scripts"` (alphabetical position near the other `test:selection-*` entries):

```json
"test:selection-settings-cache": "node --experimental-strip-types scripts/test-selection-settings-cache.mjs",
```

```bash
git add src/content/index.tsx scripts/test-selection-settings-cache.mjs package.json
git commit -m "perf: drop settings round-trip from selection hot path"
```

---

### Task 2: Parallel dictionary source race + inflight dedupe

`lookupDictionarySource` (`src/background/dictionaryHandlers.ts:21`) calls dictionaryapi.dev and only falls back to freedictionaryapi.com sequentially. Race both sources concurrently (prefer dictionaryapi.dev when both succeed) and dedupe identical in-flight lookups so two rapid selections of the same word share one network round.

**Files:**
- Create: `src/shared/inflight.ts`
- Modify: `src/background/dictionaryHandlers.ts`
- Test: `scripts/test-dictionary-source-race.mjs`

**Interfaces:**
- Produces (used by this task only): `export function raceDictionarySources(options): Promise<DictionaryEntry>` and `export class InflightDedupe` in `src/shared/inflight.ts`
- Consumes: `fetchFreeDictionary(word, signal)` from `src/services/dictionary/freeDictionary.ts`, `fetchFreeDictionaryApi(word, signal)` + `parseFreeDictionaryApiSource(raw, word)` from `src/services/dictionary/freeDictionaryApi.ts`, `getCached/setCached` from `src/services/dictionary/cache.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-dictionary-source-race.mjs`:

```js
import assert from "node:assert/strict";
import { raceDictionarySources, InflightDedupe } from "../src/shared/inflight.ts";

const primaryEntry = { word: "run", language: "en", meanings: [{ definition: "move fast" }], source: "free-api" };
const secondaryEntry = { word: "run", language: "en", meanings: [{ definition: "operate" }], source: "free-dictionary-api" };

// 1. Both succeed -> primary (dictionaryapi.dev) wins.
let winner = await raceDictionarySources({
  word: "run",
  fetchPrimary: async () => primaryEntry,
  fetchSecondary: async () => secondaryEntry,
});
assert.equal(winner.source, "free-api");

// 2. Primary fails -> secondary used.
winner = await raceDictionarySources({
  word: "run",
  fetchPrimary: async () => { throw new Error("NO_RESULT"); },
  fetchSecondary: async () => secondaryEntry,
});
assert.equal(winner.source, "free-dictionary-api");

// 3. Secondary fails -> primary used.
winner = await raceDictionarySources({
  word: "run",
  fetchPrimary: async () => primaryEntry,
  fetchSecondary: async () => { throw new Error("offline"); },
});
assert.equal(winner.source, "free-api");

// 4. Both fail -> primary's error is rethrown.
await assert.rejects(
  raceDictionarySources({
    word: "run",
    fetchPrimary: async () => { throw new Error("primary-error"); },
    fetchSecondary: async () => { throw new Error("secondary-error"); },
  }),
  /primary-error/,
);

// 5. Abort propagates immediately.
const controller = new AbortController();
controller.abort();
await assert.rejects(
  raceDictionarySources({
    word: "run",
    fetchPrimary: async () => primaryEntry,
    fetchSecondary: async () => secondaryEntry,
    signal: controller.signal,
  }),
);

// 6. InflightDedupe shares one run per key and clears after settle.
const dedupe = new InflightDedupe();
let runs = 0;
const factory = () => { runs += 1; return new Promise((resolve) => setTimeout(() => resolve("value"), 10)); };
const [a, b] = await Promise.all([dedupe.run("k", factory), dedupe.run("k", factory)]);
assert.equal(a, "value");
assert.equal(b, "value");
assert.equal(runs, 1);
await dedupe.run("k", factory);
assert.equal(runs, 2, "key is released after the first run settles");

// 7. InflightDedupe does not cache rejections.
let failures = 0;
const failing = () => { failures += 1; return Promise.reject(new Error("boom")); };
await assert.rejects(dedupe.run("bad", failing));
await assert.rejects(dedupe.run("bad", failing));
assert.equal(failures, 2);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-dictionary-source-race.mjs`
Expected: FAIL — cannot resolve `../src/shared/inflight.ts`

- [ ] **Step 3: Implement `src/shared/inflight.ts`**

```ts
import type { DictionaryEntry } from "@/shared/types";

export interface DictionarySourceRaceOptions {
  word: string;
  fetchPrimary: (signal?: AbortSignal) => Promise<DictionaryEntry>;
  fetchSecondary: (signal?: AbortSignal) => Promise<DictionaryEntry | null>;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: string }).name === "AbortError";
}

// Races dictionaryapi.dev against freedictionaryapi.com. The primary source
// wins when both succeed; either source alone still resolves; only when both
// fail does the primary's error propagate.
export async function raceDictionarySources(options: DictionarySourceRaceOptions): Promise<DictionaryEntry> {
  const { signal } = options;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const primary = options.fetchPrimary(signal);
  const secondary = options.fetchSecondary(signal);
  const secondarySettled = secondary.then(
    (entry) => ({ ok: true as const, entry }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  try {
    return await primary;
  } catch (primaryError) {
    if (isAbortError(primaryError) || signal?.aborted) throw primaryError;
    const secondaryResult = await secondarySettled;
    if (secondaryResult.ok && secondaryResult.entry) return secondaryResult.entry;
    throw primaryError;
  }
}

export class InflightDedupe {
  private readonly inflight = new Map<string, Promise<unknown>>();

  async run<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = factory().finally(() => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-dictionary-source-race.mjs`
Expected: PASS

- [ ] **Step 5: Wire the race + dedupe into `lookupDictionarySource`**

In `src/background/dictionaryHandlers.ts`, add imports:

```ts
import { InflightDedupe, raceDictionarySources } from "@/shared/inflight";
```

Add a module-level instance below the existing imports:

```ts
const lookupInflight = new InflightDedupe();
```

Replace the body of `lookupDictionarySource` with:

```ts
export async function lookupDictionarySource(payload: LookupRequest, signal: AbortSignal): Promise<LookupResponse> {
  const word = payload.word.trim();
  if (!word) return { entry: null, error: "EMPTY" };

  const cached = getCached(word, "en");
  if (cached) return { entry: cached, sourceEntry: cached, translationStatus: "source" };

  try {
    const entry = await lookupInflight.run(`en::${word.toLowerCase()}`, () =>
      raceDictionarySources({
        word,
        signal,
        fetchPrimary: (raceSignal) => fetchFreeDictionary(word, raceSignal),
        fetchSecondary: async (raceSignal) => {
          const raw = await fetchFreeDictionaryApi(word, raceSignal);
          return parseFreeDictionaryApiSource(raw, word);
        },
      }),
    );
    setCached(entry);
    return { entry, sourceEntry: entry, translationStatus: "source" };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ExtensionError) return { entry: null, error: error.code };
    return { entry: null, error: ERROR_CODES.NO_RESULT };
  }
}
```

- [ ] **Step 6: Verify existing behavior tests still pass**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-dictionary-translation.mjs && node --experimental-strip-types scripts/test-dictionary-remote-fallback.mjs && node --experimental-strip-types scripts/test-free-dictionary-api.mjs`
Expected: all PASS

- [ ] **Step 7: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:dictionary-source-race": "node --experimental-strip-types scripts/test-dictionary-source-race.mjs",
```

```bash
git add src/shared/inflight.ts src/background/dictionaryHandlers.ts scripts/test-dictionary-source-race.mjs package.json
git commit -m "perf: race dictionary sources and dedupe inflight lookups"
```

---

### Task 3: Speculative dictionary prefetch on selection

Warm the background dictionary cache as soon as a selection stabilizes (the 220ms debounce already gates this), so opening the popup — via icon click or immediate mode — hits the in-memory cache instead of the network.

**Files:**
- Modify: `src/shared/constants.ts` (add `PREFETCH_DICTIONARY` message type)
- Modify: `src/background/index.ts` (handle prefetch)
- Modify: `src/content/index.tsx` (send prefetch in the debounced handler)
- Test: `scripts/test-dictionary-prefetch.mjs`

**Interfaces:**
- Consumes: `lookupDictionarySource(payload, signal)` from Task 2; `classifySelection()` from `src/content/selectionMode.ts`
- Produces: `MESSAGE_TYPES.PREFETCH_DICTIONARY = "PREFETCH_DICTIONARY"`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-dictionary-prefetch.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.PREFETCH_DICTIONARY, "PREFETCH_DICTIONARY");

const [backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

// Background handles the prefetch by warming the lookup cache, swallowing errors.
assert.match(backgroundSource, /MESSAGE_TYPES\.PREFETCH_DICTIONARY/);
const prefetchHandler = backgroundSource.slice(
  backgroundSource.indexOf("MESSAGE_TYPES.PREFETCH_DICTIONARY"),
  backgroundSource.indexOf("MESSAGE_TYPES.PRONUNCIATION_FETCH"),
);
assert.match(prefetchHandler, /lookupDictionarySource/);

// Content script prefetches word selections once the debounce settles.
assert.match(contentSource, /MESSAGE_TYPES\.PREFETCH_DICTIONARY/);
const selectionHandler = contentSource.slice(
  contentSource.indexOf("function onSelectionEvent"),
  contentSource.indexOf("async function refreshSettings"),
);
assert.match(selectionHandler, /PREFETCH_DICTIONARY/);
assert.match(selectionHandler, /classifySelection/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-dictionary-prefetch.mjs`
Expected: FAIL — `MESSAGE_TYPES.PREFETCH_DICTIONARY` is undefined

- [ ] **Step 3: Implement**

In `src/shared/constants.ts`, add to `MESSAGE_TYPES` after `DICTIONARY_LOOKUP`:

```ts
  PREFETCH_DICTIONARY: "PREFETCH_DICTIONARY",
```

In `src/background/index.ts`, add this branch inside the `chrome.runtime.onMessage.addListener` callback, immediately after the `DICTIONARY_LOOKUP` block:

```ts
  if (type === MESSAGE_TYPES.PREFETCH_DICTIONARY) {
    const controller = new AbortController();
    lookupDictionarySource(payload as LookupRequest, controller.signal)
      .catch(() => {
        // Prefetch is best-effort; the real lookup reports errors.
      });
    sendResponse({ ok: true });
    return false;
  }
```

In `src/content/index.tsx`, inside the debounced body of `onSelectionEvent`, immediately after `lastSelectionText = sel.text;` add:

```ts
       const prefetchMode = classifySelection(sel.text);
       if (prefetchMode.kind === "word" && prefetchMode.lookupText) {
         void sendMessage(MESSAGE_TYPES.PREFETCH_DICTIONARY, {
           word: prefetchMode.lookupText,
           language: sel.pageLanguage,
           targetLanguage: settings.targetLanguage,
         });
       }
```

(`classifySelection` is already imported at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-dictionary-prefetch.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and regression**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-selection-settings-cache.mjs && node --experimental-strip-types scripts/test-background-stream-contract.mjs`
Expected: all PASS

- [ ] **Step 6: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:dictionary-prefetch": "node --experimental-strip-types scripts/test-dictionary-prefetch.mjs",
```

```bash
git add src/shared/constants.ts src/background/index.ts src/content/index.tsx scripts/test-dictionary-prefetch.mjs package.json
git commit -m "perf: prefetch dictionary entry while selection settles"
```

---

### Task 4: Batch AI stream updates per animation frame

The popup currently calls `setState` for every SSE chunk (`src/content/index.tsx:591-605`). Fast models re-render on every token. Accumulate chunk/thinking text and flush once per `requestAnimationFrame`.

**Files:**
- Create: `src/shared/streamBatcher.ts`
- Modify: `src/content/index.tsx` (module state + `handleAskAI` listeners)
- Test: `scripts/test-stream-batcher.mjs`

**Interfaces:**
- Produces: `export function createStreamBatcher(flush: (pending: { text: string; thinking: string }) => void): StreamBatcher` with `StreamBatcher = { appendText(text: string): void; appendThinking(text: string): void; flushNow(): void; dispose(): void }`
- Consumes: nothing beyond a `requestAnimationFrame`-like scheduler (injectable for tests)

- [ ] **Step 1: Write the failing test**

Create `scripts/test-stream-batcher.mjs`:

```js
import assert from "node:assert/strict";
import { createStreamBatcher } from "../src/shared/streamBatcher.ts";

// Deterministic scheduler: callbacks run only when we tick().
let scheduled = [];
const schedule = (cb) => { scheduled.push(cb); return scheduled.length; };
const cancel = (id) => { scheduled[id - 1] = null; };
const tick = () => { const queue = scheduled; scheduled = []; queue.forEach((cb) => cb && cb()); };

const flushes = [];
const batcher = createStreamBatcher((pending) => flushes.push(pending), { scheduleFrame: schedule, cancelFrame: cancel });

batcher.appendText("Hello ");
batcher.appendText("world");
batcher.appendThinking("step 1 ");
assert.equal(flushes.length, 0, "no flush before the frame fires");

tick();
assert.deepEqual(flushes, [{ text: "Hello world", thinking: "step 1 " }]);

batcher.appendThinking("step 2");
batcher.flushNow();
assert.deepEqual(flushes[1], { text: "", thinking: "step 2" });
assert.equal(flushes.length, 2);

// dispose cancels any pending frame and prevents later flushes.
batcher.appendText("late");
batcher.dispose();
tick();
assert.equal(flushes.length, 2, "disposed batcher never flushes");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-stream-batcher.mjs`
Expected: FAIL — cannot resolve `../src/shared/streamBatcher.ts`

- [ ] **Step 3: Implement `src/shared/streamBatcher.ts`**

```ts
export interface StreamBatcherPending {
  text: string;
  thinking: string;
}

export interface StreamBatcher {
  appendText(text: string): void;
  appendThinking(text: string): void;
  flushNow(): void;
  dispose(): void;
}

export interface StreamBatcherScheduler {
  scheduleFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
}

const defaultScheduler: StreamBatcherScheduler = {
  scheduleFrame: (callback) => (typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 16) as unknown as number)),
  cancelFrame: (id) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else clearTimeout(id);
  },
};

// Coalesces high-frequency stream deltas into one flush per animation frame so
// the popup re-renders at most ~60 times per second while streaming.
export function createStreamBatcher(
  flush: (pending: StreamBatcherPending) => void,
  scheduler: StreamBatcherScheduler = defaultScheduler,
): StreamBatcher {
  let text = "";
  let thinking = "";
  let frame: number | null = null;
  let disposed = false;

  const runFlush = () => {
    frame = null;
    if (disposed || (!text && !thinking)) return;
    const pending = { text, thinking };
    text = "";
    thinking = "";
    flush(pending);
  };

  const schedule = () => {
    if (frame !== null || disposed) return;
    frame = scheduler.scheduleFrame(runFlush);
  };

  return {
    appendText(next: string) {
      if (disposed || !next) return;
      text += next;
      schedule();
    },
    appendThinking(next: string) {
      if (disposed || !next) return;
      thinking += next;
      schedule();
    },
    flushNow() {
      if (frame !== null) {
        scheduler.cancelFrame(frame);
        frame = null;
      }
      runFlush();
    },
    dispose() {
      if (frame !== null) scheduler.cancelFrame(frame);
      frame = null;
      text = "";
      thinking = "";
      disposed = true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-stream-batcher.mjs`
Expected: PASS

- [ ] **Step 5: Wire the batcher into `handleAskAI`**

In `src/content/index.tsx`:

Add import:

```ts
import { createStreamBatcher, type StreamBatcher } from "@/shared/streamBatcher";
```

Add module state next to `let aiPort: chrome.runtime.Port | null = null;`:

```ts
let aiBatcher: StreamBatcher | null = null;
```

In `stopAIStream()`, dispose the batcher first:

```ts
function stopAIStream() {
  aiBatcher?.dispose();
  aiBatcher = null;
  if (!aiPort) return;
  const port = aiPort;
  aiPort = null;
  port.disconnect();
}
```

In `handleAskAI`, replace the `port.onMessage.addListener` block with:

```ts
    aiBatcher?.dispose();
    aiBatcher = createStreamBatcher((pending) => {
      if (myId !== currentRequestId || aiPort !== port || !state) return;
      setState({
        aiStreamText: `${state.aiStreamText}${pending.text}`,
        aiThinkingText: `${state.aiThinkingText}${pending.thinking}`,
      });
    });
    const batcher = aiBatcher;
    port.onMessage.addListener((event: AIStreamEvent) => {
      if (myId !== currentRequestId || aiPort !== port || !state) return;
      if (event.type === "chunk") {
        batcher.appendText(event.text);
      } else if (event.type === "thinking") {
        batcher.appendThinking(event.text);
      } else if (event.type === "done") {
        settled = true;
        batcher.flushNow();
        setState({ aiLoading: false, aiStreamText: event.raw, aiThinkingText: event.thinking });
      } else {
        settled = true;
        batcher.flushNow();
        setState({ aiLoading: false, aiError: event.code });
        toast.error(getPopupCopy(settings.targetLanguage).errorMessage(event.code));
      }
    });
```

- [ ] **Step 6: Type-check and regression**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-openrouter-stream.mjs && node --experimental-strip-types scripts/test-background-stream-contract.mjs`
Expected: all PASS

- [ ] **Step 7: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:stream-batcher": "node --experimental-strip-types scripts/test-stream-batcher.mjs",
```

```bash
git add src/shared/streamBatcher.ts src/content/index.tsx scripts/test-stream-batcher.mjs package.json
git commit -m "perf: batch AI stream updates per animation frame"
```

---

### Task 5: Event-driven viewport watcher

Replace the always-on 50ms poll (`startViewportWatcher`, `src/content/index.tsx:373-396`) with `visualViewport`/`window` resize events plus a low-frequency 250ms safety poll (needed only for CDP zoom overrides and SPA viewport mutations that fire no events).

**Files:**
- Modify: `src/content/index.tsx` (`startViewportWatcher`, `stopViewportWatcher`)
- Test: `scripts/test-viewport-watcher.mjs`

**Interfaces:**
- Consumes: existing `getPopupViewport()`, `placePopup()`, `placeSelectionTrigger()`, `getSelectionRect()`
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Create `scripts/test-viewport-watcher.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");
const watcher = contentSource.slice(
  contentSource.indexOf("function startViewportWatcher"),
  contentSource.indexOf("function schedulePopupPlacement"),
);
assert.ok(watcher.length > 0, "located viewport watcher");

// The watcher reacts to resize events instead of relying on a tight poll.
assert.match(watcher, /addEventListener\("resize"/);
// The residual safety poll runs at most 4 times per second.
assert.match(watcher, /250/);
assert.doesNotMatch(watcher, /setTimeout\(watch,\s*50\)/, "50ms tight poll removed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-viewport-watcher.mjs`
Expected: FAIL — `50ms tight poll removed`

- [ ] **Step 3: Implement**

In `src/content/index.tsx`, replace `startViewportWatcher` and `stopViewportWatcher` with:

```ts
let viewportWatchTimer: number | null = null;
let viewportResizeListener: (() => void) | null = null;
const VIEWPORT_POLL_INTERVAL_MS = 250;

function checkViewportChange() {
  if ((!popupWasOpened && !selectionTriggerInfo) || !currentSelectionInfo) return;
  const viewport = getPopupViewport();
  const viewportKey = [viewport.width, viewport.height, viewport.offsetLeft ?? 0, viewport.offsetTop ?? 0].join(":");
  if (viewportKey !== lastViewportKey) {
    lastViewportKey = viewportKey;
    if (popupWasOpened) placePopup(getSelectionRect(currentSelectionInfo));
    else placeSelectionTrigger(getSelectionRect(currentSelectionInfo));
  }
}

function startViewportWatcher() {
  if (!viewportResizeListener) {
    viewportResizeListener = () => checkViewportChange();
    window.addEventListener("resize", viewportResizeListener);
    window.visualViewport?.addEventListener("resize", viewportResizeListener);
    window.visualViewport?.addEventListener("scroll", viewportResizeListener);
  }
  if (viewportWatchTimer === null) {
    // Safety poll for CDP zoom overrides and SPA viewport mutations that do
    // not fire resize/visualViewport events (see the zoom E2E contract).
    const watch = () => {
      checkViewportChange();
      viewportWatchTimer = window.setTimeout(watch, VIEWPORT_POLL_INTERVAL_MS);
    };
    viewportWatchTimer = window.setTimeout(watch, VIEWPORT_POLL_INTERVAL_MS);
  }
}

function stopViewportWatcher() {
  if (viewportWatchTimer !== null) {
    window.clearTimeout(viewportWatchTimer);
    viewportWatchTimer = null;
  }
  if (viewportResizeListener) {
    window.removeEventListener("resize", viewportResizeListener);
    window.visualViewport?.removeEventListener("resize", viewportResizeListener);
    window.visualViewport?.removeEventListener("scroll", viewportResizeListener);
    viewportResizeListener = null;
  }
  lastViewportKey = "";
}
```

Also delete the now-duplicated declarations at the top of the file (`let viewportWatchTimer: number | null = null;` and `let lastViewportKey = "";` near line 56-57) — keep only `lastViewportKey` declared once at module scope:

```ts
let lastViewportKey = "";
```

(Keep the explanatory comment that was above them.) Note `resizeListener` in `addOutsideListeners` already handles scroll/resize re-anchoring; the watcher above is solely for viewport-size changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-viewport-watcher.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and positioning regression**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-positioning.mjs && node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: all PASS

- [ ] **Step 6: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:viewport-watcher": "node --experimental-strip-types scripts/test-viewport-watcher.mjs",
```

```bash
git add src/content/index.tsx scripts/test-viewport-watcher.mjs package.json
git commit -m "perf: event-driven viewport watcher with low-frequency safety poll"
```

---

### Task 6: Service worker keep-warm during active popup

MV3 service workers terminate after ~30s idle, which can kill in-flight streams or add cold-start latency. While a popup or trigger is open, the content script sends a lightweight ping every 20s; the background answers without work.

Note on the "preconnect" half of the original request: `<link rel="preconnect">` only helps document contexts, and content-script/background fetches to the three fixed API hosts do not benefit from it — the keep-warm ping plus Task 3's prefetch are what actually remove cold-start latency here, so no preconnect markup is added.

**Files:**
- Modify: `src/shared/constants.ts` (add `KEEP_WARM`)
- Modify: `src/background/index.ts` (answer ping)
- Modify: `src/content/index.tsx` (start/stop keep-warm with popup lifecycle)
- Test: `scripts/test-keep-warm.mjs`

**Interfaces:**
- Produces: `MESSAGE_TYPES.KEEP_WARM = "KEEP_WARM"`, `KEEP_WARM_INTERVAL_MS = 20000`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-keep-warm.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES, KEEP_WARM_INTERVAL_MS } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.KEEP_WARM, "KEEP_WARM");
assert.equal(KEEP_WARM_INTERVAL_MS, 20000);

const [backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(backgroundSource, /MESSAGE_TYPES\.KEEP_WARM/);
assert.match(contentSource, /startKeepWarm/);
assert.match(contentSource, /stopKeepWarm/);
// Keep-warm must stop when the popup closes.
const closePopupBody = contentSource.slice(contentSource.indexOf("function closePopup"), contentSource.indexOf("function stopAIStream"));
assert.match(closePopupBody, /stopKeepWarm\(\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-keep-warm.mjs`
Expected: FAIL — `KEEP_WARM` undefined

- [ ] **Step 3: Implement**

In `src/shared/constants.ts`, add to `MESSAGE_TYPES` after `OPEN_SETTINGS`:

```ts
  KEEP_WARM: "KEEP_WARM",
```

and below `SELECTION_DEBOUNCE_MS`:

```ts
export const KEEP_WARM_INTERVAL_MS = 20 * 1000;
```

In `src/background/index.ts`, add this branch as the first check inside the `onMessage` listener (before `GET_SETTINGS`):

```ts
  if (type === MESSAGE_TYPES.KEEP_WARM) {
    sendResponse({ ok: true });
    return false;
  }
```

In `src/content/index.tsx`, add module state near `aiPort`:

```ts
let keepWarmTimer: number | null = null;
```

and the functions after `stopAIStream`:

```ts
function startKeepWarm() {
  if (keepWarmTimer !== null) return;
  keepWarmTimer = window.setInterval(() => {
    void sendMessage(MESSAGE_TYPES.KEEP_WARM, undefined);
  }, KEEP_WARM_INTERVAL_MS);
}

function stopKeepWarm() {
  if (keepWarmTimer === null) return;
  window.clearInterval(keepWarmTimer);
  keepWarmTimer = null;
}
```

Import `KEEP_WARM_INTERVAL_MS` in the existing constants import line. Call `startKeepWarm();` inside `openPopup` right after `addOutsideListeners();`, inside `showSelectionTrigger` right after `addOutsideListeners();`, and call `stopKeepWarm();` at the top of `closePopup`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-keep-warm.mjs`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:keep-warm": "node --experimental-strip-types scripts/test-keep-warm.mjs",
```

```bash
git add src/shared/constants.ts src/background/index.ts src/content/index.tsx scripts/test-keep-warm.mjs package.json
git commit -m "perf: keep service worker warm while popup is active"
```

---

### Task 7: Exponential backoff for rate-limited OpenRouter requests

Wrap OpenRouter HTTP calls with bounded retries on 429/5xx, honoring `Retry-After`. Retries happen inside the background before any error reaches the popup.

**Files:**
- Create: `src/shared/retry.ts`
- Modify: `src/services/openrouter/client.ts` (route the four fetch call sites through the retry helper)
- Test: `scripts/test-openrouter-retry.mjs`

**Interfaces:**
- Produces: `export function computeRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number` and `export async function fetchWithRetry(url: string, init: RequestInit, options?: FetchRetryOptions): Promise<Response>` where `FetchRetryOptions = { maxRetries?: number; baseDelayMs?: number; fetchImpl?: typeof fetch }`
- Consumes: nothing

- [ ] **Step 1: Write the failing test**

Create `scripts/test-openrouter-retry.mjs`:

```js
import assert from "node:assert/strict";
import { computeRetryDelayMs, fetchWithRetry } from "../src/shared/retry.ts";

// Delay: exponential with cap; Retry-After seconds win when larger.
assert.equal(computeRetryDelayMs(0), 500);
assert.equal(computeRetryDelayMs(1), 1000);
assert.equal(computeRetryDelayMs(2), 2000);
assert.equal(computeRetryDelayMs(10), 4000, "delay is capped");
assert.equal(computeRetryDelayMs(0, "3"), 3000, "Retry-After seconds honored");
assert.ok(computeRetryDelayMs(0, "Wed, 21 Oct 2026 07:28:00 GMT") <= 4000, "HTTP-date bounded by cap");

// Reject non-http(s) URLs and private/loopback hosts.
await assert.rejects(fetchWithRetry("ftp://openrouter.ai/api", {}), /http/);
await assert.rejects(fetchWithRetry("https://localhost/x", {}), /host/i);
await assert.rejects(fetchWithRetry("https://127.0.0.1/x", {}), /host/i);
await assert.rejects(fetchWithRetry("https://10.0.0.5/x", {}), /host/i);
await assert.rejects(fetchWithRetry("https://192.168.1.10/x", {}), /host/i);

// 429 retried, then success.
let calls = 0;
const fakeFetch = async () => {
  calls += 1;
  if (calls === 1) return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
  return new Response("ok", { status: 200 });
};
const ok = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", { method: "POST" }, { fetchImpl: fakeFetch, baseDelayMs: 1 });
assert.equal(ok.status, 200);
assert.equal(calls, 2);

// 5xx retried up to maxRetries, then last response returned.
calls = 0;
const alwaysFail = async () => { calls += 1; return new Response("boom", { status: 503 }); };
const failed = await fetchWithRetry("https://openrouter.ai/x", {}, { fetchImpl: alwaysFail, maxRetries: 2, baseDelayMs: 1 });
assert.equal(failed.status, 503);
assert.equal(calls, 3, "initial attempt + 2 retries");

// 4xx (non-429) is not retried.
calls = 0;
const unauthorized = async () => { calls += 1; return new Response("no", { status: 401 }); };
await fetchWithRetry("https://openrouter.ai/x", {}, { fetchImpl: unauthorized, baseDelayMs: 1 });
assert.equal(calls, 1);

// AbortSignal aborts between retries.
const controller = new AbortController();
calls = 0;
const rateLimitedForever = async () => {
  calls += 1;
  controller.abort();
  return new Response("rate limited", { status: 429 });
};
await assert.rejects(
  fetchWithRetry("https://openrouter.ai/x", { signal: controller.signal }, { fetchImpl: rateLimitedForever, baseDelayMs: 1 }),
);
assert.equal(calls, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-openrouter-retry.mjs`
Expected: FAIL — cannot resolve `../src/shared/retry.ts`

- [ ] **Step 3: Implement `src/shared/retry.ts`**

```ts
const MAX_RETRY_DELAY_MS = 4000;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_RETRIES = 2;

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (host.startsWith("127.")) return true; // loopback
  if (host === "0.0.0.0") return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts;
    if (a === 10) return true;                                  // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
    if (a === 169 && b === 254) return true;                    // link-local
    if (a >= 224) return true;                                  // multicast + reserved
  }
  return host.endsWith(".local") || host.endsWith(".internal");
}

export function assertSafeRequestUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing request to invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Refusing non-http(s) request URL: ${url}`);
  }
  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new Error(`Refusing request to private or reserved host: ${parsed.hostname}`);
  }
}

export function computeRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const exponential = Math.min(DEFAULT_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  if (!retryAfterHeader) return exponential;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds * 1000, exponential), MAX_RETRY_DELAY_MS * 2);
  }
  const dateMs = Date.parse(retryAfterHeader);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }
  return exponential;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface FetchRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

// Bounded retry wrapper for OpenRouter calls: retries 429/5xx with
// exponential backoff (honoring Retry-After), never retries other 4xx.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  assertSafeRequestUrl(url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let response = await fetchImpl(url, init);
  for (let attempt = 0; attempt < maxRetries && isRetryableStatus(response.status); attempt += 1) {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const delay = computeRetryDelayMs(attempt, response.headers.get("Retry-After"));
    await sleep(Math.min(delay, baseDelayMs === 1 ? 1 : delay), init.signal);
    response = await fetchImpl(url, init);
  }
  return response;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-openrouter-retry.mjs`
Expected: PASS

- [ ] **Step 5: Route OpenRouter fetches through the retry helper**

In `src/services/openrouter/client.ts`:

Add import:

```ts
import { fetchWithRetry } from "@/shared/retry";
```

In `fetchOpenRouterWithReasoningFallback` (`src/services/openrouter/http.ts`), change the internal `request` helper from `fetchImpl(url, {...})` to:

```ts
  const request = (requestBody: Record<string, unknown>) => fetchWithRetry(url, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify(requestBody),
  }, { fetchImpl });
```

(import `fetchWithRetry` from `@/shared/retry` there). This covers `callOpenRouter` and `streamOpenRouter`.

In `translateDictionaryEntryWithOpenRouter`, `generateDictionaryEntryWithOpenRouter`, and `fetchOpenRouterModels`, replace each `response = await fetch(...)` with `response = await fetchWithRetry(...)` keeping the same init object (the models call passes `{ method: "GET", signal, headers }`).

- [ ] **Step 6: Run OpenRouter regression tests**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-openrouter-stream.mjs && node --experimental-strip-types scripts/test-openrouter-http-fallback.mjs`
Expected: all PASS

- [ ] **Step 7: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:openrouter-retry": "node --experimental-strip-types scripts/test-openrouter-retry.mjs",
```

```bash
git add src/shared/retry.ts src/services/openrouter/client.ts src/services/openrouter/http.ts scripts/test-openrouter-retry.mjs package.json
git commit -m "feat: retry rate-limited OpenRouter requests with exponential backoff"
```

---

# Phase 2 — UX polish

### Task 8: Read-aloud for the text translation panel

Dictionary pronunciation already falls back to `speechSynthesis` (see Spec note). The remaining gap: the translation panel has copy buttons but no way to *hear* the translation or the original text.

**Files:**
- Modify: `src/components/dictionary/TextTranslationPanel.tsx`
- Modify: `src/components/dictionary/copy.ts` (new keys: `speakTranslation`, `speakOriginal`)
- Test: `scripts/test-text-translation-speak.mjs`

**Interfaces:**
- Consumes: `speakPronunciation(fallback: { text: string; lang: "en-GB" | "en-US" })` from `src/services/dictionary/pronunciation.ts` — extend its `lang` union (see step 3)
- Produces: `PopupCopy.speakTranslation`, `PopupCopy.speakOriginal`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-text-translation-speak.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";

for (const language of ["en", "vi", "zh-CN"]) {
  const copy = getPopupCopy(language);
  assert.ok(copy.speakTranslation?.length > 0, `${language}: speakTranslation copy`);
  assert.ok(copy.speakOriginal?.length > 0, `${language}: speakOriginal copy`);
}

const panelSource = await readFile(new URL("../src/components/dictionary/TextTranslationPanel.tsx", import.meta.url), "utf8");
assert.match(panelSource, /speakPronunciation/);
assert.match(panelSource, /speakTranslation/);
assert.match(panelSource, /speakOriginal/);
// Translation is spoken in the target language, original in its detected source language.
assert.match(panelSource, /targetSpeechLang/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-text-translation-speak.mjs`
Expected: FAIL — `speakTranslation` missing

- [ ] **Step 3: Implement**

In `src/services/dictionary/pronunciation.ts`, widen the fallback lang type:

```ts
export interface PronunciationSpeechFallback {
  text: string;
  lang: string;
}
```

(`speakPronunciation` already matches voices by prefix; the union was only `"en-GB" | "en-US"`.)

In `src/components/dictionary/copy.ts`, add to the `PopupCopy` interface:

```ts
  speakTranslation: string;
  speakOriginal: string;
```

and to each language object:

- en: `speakTranslation: "Read translation aloud"`, `speakOriginal: "Read original aloud"`
- vi: `speakTranslation: "Đọc bản dịch"`, `speakOriginal: "Đọc văn bản gốc"`
- zh-CN: `speakTranslation: "朗读译文"`, `speakOriginal: "朗读原文"`

In `src/components/dictionary/TextTranslationPanel.tsx`:

Add imports:

```ts
import { Volume2 } from "lucide-react";
import { speakPronunciation } from "@/services/dictionary/pronunciation";
```

Add inside the component, above `return`:

```ts
  const targetSpeechLang = targetLanguage === "vi" ? "vi-VN" : targetLanguage === "zh-CN" ? "zh-CN" : "en-US";

  function speak(text: string, lang: string) {
    void speakPronunciation({ text, lang }).catch(() => toast.error(labels.audioFailed));
  }
```

In the translated-text section header (next to the copy button), add before the copy `Button`:

```tsx
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={labels.speakTranslation}
              onClick={() => speak(phase.translatedText, targetSpeechLang)}
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
```

(The button needs `phase.kind === "translation-ready"` scope — it already is inside that conditional section.)

In the original-text section header, add the same button before the copy button with `aria-label={labels.speakOriginal}` and `onClick={() => speak(phase.sourceText, "en-US")}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-text-translation-speak.mjs && node --experimental-strip-types scripts/test-pronunciation.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`

Add to `package.json` `"scripts"`:

```json
"test:text-translation-speak": "node --experimental-strip-types scripts/test-text-translation-speak.mjs",
```

```bash
git add src/components/dictionary/TextTranslationPanel.tsx src/components/dictionary/copy.ts src/services/dictionary/pronunciation.ts scripts/test-text-translation-speak.mjs package.json
git commit -m "feat: read translation panel text aloud via speech synthesis"
```

---

### Task 9: Animation polish (popup entrance, skeleton shimmer, reduced motion)

The popup already uses `animate-fade-in`. Add a subtle scale-up entrance, a shimmer on skeletons, and honor `prefers-reduced-motion`.

**Files:**
- Modify: `src/styles/popup.css`
- Test: `scripts/test-popup-animation.mjs`

**Interfaces:**
- Consumes: existing Tailwind setup inlined into the Shadow DOM (`popupCss` import in `src/content/index.tsx`)
- Produces: CSS keyframes `ext-pop-in`, `ext-shimmer`; class hooks `.ext-popup-wrapper [role="dialog"]`, `.animate-fade-in`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-popup-animation.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/popup.css", import.meta.url), "utf8");
assert.match(css, /@keyframes\s+ext-pop-in/);
assert.match(css, /@keyframes\s+ext-shimmer/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /\.animate-fade-in/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-animation.mjs`
Expected: FAIL — keyframes missing

- [ ] **Step 3: Implement**

Append to `src/styles/popup.css`:

```css
@keyframes ext-pop-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.ext-popup-wrapper [role="dialog"] {
  animation: ext-pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top center;
}

@keyframes ext-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.animate-pulse {
  animation: ext-shimmer 1.6s linear infinite;
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 0.18) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
}

@media (prefers-reduced-motion: reduce) {
  .ext-popup-wrapper [role="dialog"],
  .animate-fade-in,
  .animate-pulse {
    animation: none;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-animation.mjs`
Expected: PASS

- [ ] **Step 5: Build to confirm CSS inlines, then commit**

Run: `npm run build`
Expected: build succeeds (popup CSS is inlined into `content.js` via `?inline`).

Add to `package.json` `"scripts"`:

```json
"test:popup-animation": "node --experimental-strip-types scripts/test-popup-animation.mjs",
```

```bash
git add src/styles/popup.css scripts/test-popup-animation.mjs package.json
git commit -m "feat: polish popup entrance and skeleton animations"
```

---

### Task 10: Clearer translating status per tab

Today the dictionary tab shows a thin text banner while translating. Upgrade it to a spinner row, and surface a translating indicator on the dictionary tab button in the tab bar (so it is visible from the AI tab too).

**Files:**
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (banner markup + pass prop)
- Modify: `src/components/dictionary/PopupTabs.tsx` (indicator)
- Modify: `src/components/dictionary/copy.ts` (no new keys needed — reuses `translating`)
- Test: `scripts/test-translating-status.mjs`

**Interfaces:**
- Consumes: `TranslationStatus` from `src/shared/types.ts`
- Produces: new optional prop `dictionaryTranslating?: boolean` on `PopupTabs`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-translating-status.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [popupSource, tabsSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/PopupTabs.tsx", import.meta.url), "utf8"),
]);

// Spinner + aria-live status row while translating.
assert.match(popupSource, /aria-live="polite"/);
assert.match(popupSource, /Loader2/);
// Tab bar shows a translating dot on the dictionary tab.
assert.match(tabsSource, /dictionaryTranslating/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-translating-status.mjs`
Expected: FAIL

- [ ] **Step 3: Implement**

In `src/components/dictionary/PopupTabs.tsx`:

Add to `Props`: `dictionaryTranslating?: boolean;` and destructure it. In the tab button render, change the AI loading dot block so the dictionary tab also gets an indicator — after the existing `{id === "ai" && aiLoading && ...}` line add:

```tsx
            {id === "dictionary" && dictionaryTranslating && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
```

In `src/components/dictionary/DictionaryPopup.tsx`:

Add `import { Loader2 } from "lucide-react";` at the top.

Pass the prop to `PopupTabs`:

```tsx
      <PopupTabs
        activeTab={activeTab}
        aiLoading={aiLoading}
        dictionaryTranslating={translationStatus === "translating"}
        targetLanguage={targetLanguage}
        primaryLabel={isTranslationPhase ? labels.translationTab : undefined}
        onChange={onTabChange}
      />
```

Replace the `translationStatus === "translating"` banner inside the ready phase with:

```tsx
              {translationStatus === "translating" && (
                <div role="status" aria-live="polite" className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
                  {labels.translating}
                </div>
              )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-translating-status.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-settings-layout.mjs`

Add to `package.json` `"scripts"`:

```json
"test:translating-status": "node --experimental-strip-types scripts/test-translating-status.mjs",
```

```bash
git add src/components/dictionary/DictionaryPopup.tsx src/components/dictionary/PopupTabs.tsx scripts/test-translating-status.mjs package.json
git commit -m "feat: clearer translating status with spinner and tab indicator"
```

---

# Phase 3 — Interaction features

### Task 11: Multi-turn AI chat in the AI tab

Turn the AI tab from one-shot into a conversation: after a streamed answer, an input row lets the user send follow-up questions. History is kept per popup session and reset on each new lookup.

**Files:**
- Modify: `src/shared/types.ts` (`AIRequest.history`, `AIRequest.followUpQuestion`, `AIMessage`)
- Modify: `src/services/openrouter/messages.ts` (`OpenRouterPromptRequest` gains `history` + `followUpQuestion`; `buildOpenRouterMessages` inserts history between system and the lookup message)
- Modify: `src/content/index.tsx` (chat state + send handler)
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (pass-through props)
- Modify: `src/components/dictionary/AISection.tsx` (chat transcript + input row)
- Modify: `src/components/dictionary/copy.ts` (new keys)
- Test: `scripts/test-ai-chat.mjs`

**Interfaces:**
- Produces: `AIMessage = { role: "user" | "assistant"; content: string }` exported from `src/shared/types.ts`; `AIRequest.history?: AIMessage[]`; `AIRequest.followUpQuestion?: string`; new props on `AISection`: `messages: AIMessage[]`, `onSendMessage?: (text: string) => void`
- Consumes: existing `buildOpenRouterMessages(systemPrompt, req)` signature (extended, not changed)

Conversation model: `state.aiMessages` holds completed turns only. The in-progress answer is always shown from `aiStreamText`; the assistant message is appended to `aiMessages` on the `"done"` event. The first answer gets a synthetic user bubble containing the looked-up word so the transcript reads naturally.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-ai-chat.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOpenRouterMessages } from "../src/services/openrouter/messages.ts";

// Follow-up: history pairs are inserted between system and the lookup message,
// and the follow-up question is appended to the final user message.
const messages = buildOpenRouterMessages("SYSTEM", {
  word: "run",
  sentence: "I run daily.",
  history: [
    { role: "user", content: "run" },
    { role: "assistant", content: "To move quickly on foot." },
  ],
  followUpQuestion: "What is the past tense?",
});
assert.equal(messages[0].role, "system");
assert.equal(messages[0].content, "SYSTEM");
assert.equal(messages[1].role, "user");
assert.equal(messages[1].content, "run");
assert.equal(messages[2].role, "assistant");
assert.equal(messages[2].content, "To move quickly on foot.");
assert.equal(messages[3].role, "user");
assert.match(messages[3].content, /Selected text: run/);
assert.match(messages[3].content, /Follow-up question: What is the past tense\?/);

// Without history the shape is unchanged (system + one user message).
const plain = buildOpenRouterMessages("SYSTEM", { word: "run" });
assert.equal(plain.length, 2);
assert.doesNotMatch(plain[1].content, /Follow-up question/);

const [contentSource, sectionSource, copyModule] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/AISection.tsx", import.meta.url), "utf8"),
  import("../src/components/dictionary/copy.ts"),
]);
assert.match(contentSource, /aiMessages/);
assert.match(contentSource, /handleSendAIMessage/);
assert.match(sectionSource, /onSendMessage/);
for (const language of ["en", "vi", "zh-CN"]) {
  const copy = copyModule.getPopupCopy(language);
  assert.ok(copy.chatPlaceholder?.length > 0, `${language}: chatPlaceholder`);
  assert.ok(copy.chatSend?.length > 0, `${language}: chatSend`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-ai-chat.mjs`
Expected: FAIL — `history` not honored / `chatPlaceholder` missing

- [ ] **Step 3: Implement types + messages**

In `src/shared/types.ts`, add after `AIRequest`:

```ts
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}
```

and add to `AIRequest`:

```ts
  history?: AIMessage[];
  followUpQuestion?: string;
```

In `src/services/openrouter/messages.ts`, add to `OpenRouterPromptRequest`:

```ts
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  followUpQuestion?: string;
```

Replace the `return` statement of `buildOpenRouterMessages` with:

```ts
  if (req.followUpQuestion) userParts.push(`Follow-up question: ${req.followUpQuestion}`);

  return [
    { role: "system", content: systemPrompt },
    ...(req.history ?? []).map((item): OpenRouterMessage => ({ role: item.role, content: item.content })),
    { role: "user", content: userParts.join("\n") },
  ];
```

- [ ] **Step 4: Implement content-script chat state**

In `src/content/index.tsx`:

Add to `PopupState`:

```ts
  aiMessages: AIMessage[];
```

(import `AIMessage` from `@/shared/types`). Initialize `aiMessages: []` in `openPopup`'s state object.

In `handleAskAI`, replace the `const req: AIRequest = {...}` block with:

```ts
  const isFirstQuestion = state.aiMessages.length === 0;
  const followUpQuestion = !isFirstQuestion
    && state.aiMessages[state.aiMessages.length - 1]?.role === "user"
    ? state.aiMessages[state.aiMessages.length - 1].content
    : undefined;
  const req: AIRequest = {
    word: state.word,
    ...(settings.includeSelectionContext ? {
      sentence: currentSelectionInfo.sentence,
      contextBefore: currentSelectionInfo.contextBefore,
      contextAfter: currentSelectionInfo.contextAfter,
      pageLanguage: currentSelectionInfo.pageLanguage,
    } : {}),
    ...(isFirstQuestion ? {} : {
      history: state.aiMessages.slice(0, followUpQuestion ? -1 : undefined),
      followUpQuestion,
    }),
  };
```

In the `"done"` event branch, persist the exchange:

```ts
      } else if (event.type === "done") {
        settled = true;
        batcher.flushNow();
        const assistantMessage: AIMessage = { role: "assistant", content: event.raw };
        const nextMessages = isFirstQuestion
          ? [{ role: "user" as const, content: state.word }, assistantMessage]
          : [...state.aiMessages, assistantMessage];
        setState({ aiLoading: false, aiStreamText: event.raw, aiThinkingText: event.thinking, aiMessages: nextMessages });
      }
```

Add a send handler after `handleStopAI`:

```ts
function handleSendAIMessage(text: string) {
  const trimmed = text.trim();
  if (!state || !trimmed || state.aiLoading) return;
  setState({ aiMessages: [...state.aiMessages, { role: "user", content: trimmed }] });
  void handleAskAI({ revealTab: false });
}
```

Pass it through `PopupContainer` → `DictionaryPopup` → `AISection` as `onSendMessage={handleSendAIMessage}` and `messages={state.aiMessages}` (add the props to `PopupContainer`'s render call and to `DictionaryPopup`'s `Props`).

- [ ] **Step 5: Implement the AISection chat UI**

In `src/components/dictionary/copy.ts`, add to `PopupCopy`:

```ts
  chatPlaceholder: string;
  chatSend: string;
```

with values:
- en: `chatPlaceholder: "Ask a follow-up question…"`, `chatSend: "Send"`
- vi: `chatPlaceholder: "Hỏi tiếp một câu…"`, `chatSend: "Gửi"`
- zh-CN: `chatPlaceholder: "继续提问…"`, `chatSend: "发送"`

In `src/components/dictionary/AISection.tsx`:

Add props `messages: AIMessage[]` (import the type) and `onSendMessage?: (text: string) => void`. Add local state `const [draft, setDraft] = useState("");`.

Render the transcript: replace the single `{streamText && (...)}` block with a transcript that shows every completed turn from `messages` (user turns as right-aligned bubbles, assistant turns as Markdown), while the currently streaming answer keeps rendering from `streamText`:

```tsx
        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <div key={index} className="mb-2 flex justify-end">
                <span className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary/10 px-3 py-1.5 text-xs">{message.content}</span>
              </div>
            );
          }
          return (
            <div key={index} className="mb-3 min-w-0 max-w-full">
              <MarkdownContent>{message.content}</MarkdownContent>
            </div>
          );
        })}
```

Keep the existing `{streamText && (...)}` block immediately after it — during streaming `aiMessages` holds only completed turns, so nothing renders twice; on `"done"` the final text moves into `messages` and `streamText` is replaced by the same content.

After the error/empty blocks, add the input row (only when not loading and an answer exists):

```tsx
        {!loading && onSendMessage && (streamText || messages.some((message) => message.role === "assistant")) && (
          <form
            className="mt-3 flex items-center gap-2 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              onSendMessage(draft);
              setDraft("");
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={labels.chatPlaceholder}
              aria-label={labels.chatPlaceholder}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            <Button type="submit" size="sm" className="h-8 shrink-0 px-3" disabled={!draft.trim()}>
              {labels.chatSend}
            </Button>
          </form>
        )}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-ai-chat.mjs`
Expected: PASS

- [ ] **Step 7: Type-check, regression, commit**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-openrouter-stream.mjs && node --experimental-strip-types scripts/test-text-translation-ui.mjs`

Add to `package.json` `"scripts"`:

```json
"test:ai-chat": "node --experimental-strip-types scripts/test-ai-chat.mjs",
```

```bash
git add src/shared/types.ts src/services/openrouter/messages.ts src/content/index.tsx src/components/dictionary/DictionaryPopup.tsx src/components/dictionary/AISection.tsx src/components/dictionary/copy.ts scripts/test-ai-chat.mjs package.json
git commit -m "feat: multi-turn AI chat in the popup AI tab"
```

---

### Task 12: Context menu — right-click to look up or translate

Adds `contextMenus` permission and two menu items on selected text: "Tra từ" (word lookup) and "Dịch văn bản" (text translation). The background forwards the click to the tab; the content script opens the popup from the current selection.

**Files:**
- Modify: `public/manifest.json` (add `contextMenus` permission)
- Modify: `src/background/index.ts` (menu creation + click forwarding)
- Modify: `src/shared/constants.ts` (add `CONTEXT_LOOKUP` message type)
- Modify: `src/content/index.tsx` (handle the message)
- Test: `scripts/test-context-menu.mjs`

**Interfaces:**
- Produces: `MESSAGE_TYPES.CONTEXT_LOOKUP = "CONTEXT_LOOKUP"`; background→tab payload `{ mode: "word" | "text" }`
- Consumes: existing `openPopup(info, shouldAutoAsk)`, `getCurrentSelection()`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-context-menu.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.CONTEXT_LOOKUP, "CONTEXT_LOOKUP");

const [manifest, backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.ok(manifest.permissions.includes("contextMenus"), "manifest declares contextMenus");
assert.match(backgroundSource, /chrome\.contextMenus\.create/);
assert.match(backgroundSource, /ext-lookup-word/);
assert.match(backgroundSource, /ext-translate-text/);
assert.match(backgroundSource, /chrome\.tabs\.sendMessage/);
assert.match(contentSource, /CONTEXT_LOOKUP/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-context-menu.mjs`
Expected: FAIL

- [ ] **Step 3: Implement**

In `public/manifest.json`, change `"permissions": ["storage"]` to `"permissions": ["storage", "contextMenus"]`.

In `src/shared/constants.ts`, add to `MESSAGE_TYPES`:

```ts
  CONTEXT_LOOKUP: "CONTEXT_LOOKUP",
```

In `src/background/index.ts`, append before the final `export {}`:

```ts
const CONTEXT_MENU_IDS = { word: "ext-lookup-word", text: "ext-translate-text" } as const;

chrome.contextMenus?.removeAll(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.word,
    title: "Tra từ đã chọn",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.text,
    title: "Dịch văn bản đã chọn",
    contexts: ["selection"],
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const mode = info.menuItemId === CONTEXT_MENU_IDS.text ? "text" : "word";
  chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.CONTEXT_LOOKUP, payload: { mode } }).catch(() => {
    // The tab's content script may not be injected (e.g. chrome:// pages).
  });
});
```

In `src/content/index.tsx`, add inside the `init()` IIFE after the existing listeners:

```ts
  chrome.runtime.onMessage.addListener((message: { type?: string; payload?: { mode?: "word" | "text" } }, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.CONTEXT_LOOKUP) return false;
    const sel = getCurrentSelection();
    if (sel) {
      lastSelectionText = sel.text;
      void openPopup(sel, message.payload?.mode !== "text");
    }
    sendResponse({ ok: true });
    return false;
  });
```

Note: for `"text"` mode the popup's `classifySelection` already routes long selections to the translation panel; forcing `shouldAutoAsk=false` for text mode avoids burning an AI call. For `"word"` mode auto-ask follows the user setting.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-context-menu.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`

Add to `package.json` `"scripts"`:

```json
"test:context-menu": "node --experimental-strip-types scripts/test-context-menu.mjs",
```

```bash
git add public/manifest.json src/shared/constants.ts src/background/index.ts src/content/index.tsx scripts/test-context-menu.mjs package.json
git commit -m "feat: context menu entries to look up or translate selection"
```

---

### Task 13: Keyboard shortcuts (Alt+click instant lookup, toggle command)

Two shortcuts: (a) Alt+click on a selection opens the popup immediately regardless of trigger mode; (b) a browser command (`Ctrl+Shift+Y`, user-rebindable in Chrome) toggles the popup for the current selection or closes it.

**Files:**
- Modify: `public/manifest.json` (`commands` block)
- Modify: `src/background/index.ts` (command listener → tab message)
- Modify: `src/shared/constants.ts` (`TOGGLE_POPUP` message type)
- Modify: `src/content/index.tsx` (Alt detection + toggle handler)
- Test: `scripts/test-keyboard-shortcuts.mjs`

**Interfaces:**
- Produces: `MESSAGE_TYPES.TOGGLE_POPUP = "TOGGLE_POPUP"`; manifest command `toggle-popup`
- Consumes: `openPopup`, `closePopup`, `getCurrentSelection`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-keyboard-shortcuts.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGE_TYPES } from "../src/shared/constants.ts";

assert.equal(MESSAGE_TYPES.TOGGLE_POPUP, "TOGGLE_POPUP");

const [manifest, backgroundSource, contentSource] = await Promise.all([
  readFile(new URL("../public/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/background/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.ok(manifest.commands?.["toggle-popup"], "manifest declares toggle-popup command");
assert.match(backgroundSource, /chrome\.commands\.onClicked/);
assert.match(backgroundSource, /TOGGLE_POPUP/);
assert.match(contentSource, /altKey/);
assert.match(contentSource, /MESSAGE_TYPES\.TOGGLE_POPUP/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-keyboard-shortcuts.mjs`
Expected: FAIL

- [ ] **Step 3: Implement**

In `public/manifest.json`, add a top-level key after `"action"`:

```json
"commands": {
  "toggle-popup": {
    "suggested_key": { "default": "Ctrl+Shift+Y" },
    "description": "Bật/tắt popup tra từ cho vùng chọn hiện tại"
  }
},
```

In `src/shared/constants.ts`, add to `MESSAGE_TYPES`:

```ts
  TOGGLE_POPUP: "TOGGLE_POPUP",
```

In `src/background/index.ts`, add next to the `chrome.action?.onClicked` listener:

```ts
chrome.commands?.onClicked.addListener((command) => {
  if (command !== "toggle-popup") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.TOGGLE_POPUP }).catch(() => {
      // Content script not present on this page.
    });
  });
});
```

In `src/content/index.tsx`:

(a) Alt+click: in `onSelectionEvent(ev)`, capture the modifier before the debounce and thread it through. Change the signature usage: after `const pointerPosition = ...` add:

```ts
  const forceOpen = ev instanceof MouseEvent && ev.altKey;
```

and inside the debounced closure, replace the final mode branch:

```ts
       if (settings.selectionTriggerMode === "icon") showSelectionTrigger(sel);
       else void openPopup(sel, true);
```

with:

```ts
       if (forceOpen || settings.selectionTriggerMode === "popup") void openPopup(sel, true);
       else if (settings.selectionTriggerMode === "icon") showSelectionTrigger(sel);
```

Also, at the top of `onSelectionEvent`, do not early-return for `"off"` when Alt is held:

```ts
  if (settings.selectionTriggerMode === "off" && !(ev instanceof MouseEvent && ev.altKey)) return;
```

and mirror the same guard inside the debounced closure's `if (settings.selectionTriggerMode === "off") return;` check:

```ts
       if (settings.selectionTriggerMode === "off" && !forceOpen) return;
```

(b) Toggle: inside the `init()` IIFE, extend the `chrome.runtime.onMessage` listener added in Task 12 to also handle toggle (or add a second listener if Task 12's listener was not yet added):

```ts
    if (message?.type === MESSAGE_TYPES.TOGGLE_POPUP) {
      if (popupWasOpened || selectionTriggerInfo) {
        closePopup();
      } else {
        const sel = getCurrentSelection();
        if (sel) {
          lastSelectionText = sel.text;
          void openPopup(sel, true);
        }
      }
      sendResponse({ ok: true });
      return false;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-keyboard-shortcuts.mjs`
Expected: PASS

- [ ] **Step 5: Type-check, selection regression, commit**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-selection-trigger.mjs`

Add to `package.json` `"scripts"`:

```json
"test:keyboard-shortcuts": "node --experimental-strip-types scripts/test-keyboard-shortcuts.mjs",
```

```bash
git add public/manifest.json src/shared/constants.ts src/background/index.ts src/content/index.tsx scripts/test-keyboard-shortcuts.mjs package.json
git commit -m "feat: Alt+click instant lookup and toggle-popup command"
```

---

# Phase 4 — Vocabulary history & export

### Task 14: Vocabulary storage service + background handlers

Persist looked-up words (word, optional translation snapshot, timestamp, favorite flag) in `chrome.storage.local`, capped at 200 entries. Expose via typed messages.

**Files:**
- Create: `src/services/storage/vocabulary.ts`
- Modify: `src/shared/constants.ts` (message types)
- Modify: `src/shared/types.ts` (`VocabularyRecord`)
- Modify: `src/background/index.ts` (handlers)
- Modify: `src/background/dictionaryHandlers.ts` (record successful lookups)
- Test: `scripts/test-vocabulary-storage.mjs`

**Interfaces:**
- Produces:
  - `VocabularyRecord = { word: string; translation?: string; lookedUpAt: number; favorite: boolean }`
  - `VOCABULARY_STORAGE_KEY = "extention-translate:vocabulary"`, `VOCABULARY_MAX_ENTRIES = 200`
  - `listVocabulary(storage): Promise<VocabularyRecord[]>`, `recordVocabularyLookup(storage, word, translation?): Promise<VocabularyRecord[]>`, `toggleVocabularyFavorite(storage, word): Promise<VocabularyRecord[]>`, `removeVocabularyEntry(storage, word): Promise<VocabularyRecord[]>`, `clearVocabulary(storage): Promise<void>` where `storage = { get(key): Promise<Record<string, unknown>>; set(items): Promise<void> }` (same shape as `dictionaryTranslationStorage` in `src/content/index.tsx`)
  - `MESSAGE_TYPES.VOCABULARY_LIST | VOCABULARY_TOGGLE_FAVORITE | VOCABULARY_REMOVE | VOCABULARY_CLEAR`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-vocabulary-storage.mjs`:

```js
import assert from "node:assert/strict";
import {
  VOCABULARY_STORAGE_KEY,
  VOCABULARY_MAX_ENTRIES,
  listVocabulary,
  recordVocabularyLookup,
  toggleVocabularyFavorite,
  removeVocabularyEntry,
  clearVocabulary,
} from "../src/services/storage/vocabulary.ts";

function createMemoryStorage() {
  const data = {};
  return {
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => { Object.assign(data, items); },
    _data: data,
  };
}

const storage = createMemoryStorage();
assert.equal(VOCABULARY_STORAGE_KEY, "extention-translate:vocabulary");
assert.equal(VOCABULARY_MAX_ENTRIES, 200);

assert.deepEqual(await listVocabulary(storage), []);

await recordVocabularyLookup(storage, "run", "chạy");
await recordVocabularyLookup(storage, "beautiful", "đẹp");
let list = await listVocabulary(storage);
assert.equal(list.length, 2);
assert.equal(list[0].word, "beautiful", "newest first");
assert.equal(list[0].translation, "đẹp");
assert.equal(list[0].favorite, false);

// Re-recording an existing word refreshes timestamp/translation, no duplicate.
await recordVocabularyLookup(storage, "run", "vận hành");
list = await listVocabulary(storage);
assert.equal(list.length, 2);
assert.equal(list[0].word, "run");
assert.equal(list[0].translation, "vận hành");

// Favorite toggle survives re-record.
await toggleVocabularyFavorite(storage, "run");
list = await listVocabulary(storage);
assert.equal(list.find((item) => item.word === "run").favorite, true);
await recordVocabularyLookup(storage, "run");
list = await listVocabulary(storage);
assert.equal(list.find((item) => item.word === "run").favorite, true, "favorite preserved on re-record");

await removeVocabularyEntry(storage, "run");
assert.deepEqual((await listVocabulary(storage)).map((item) => item.word), ["beautiful"]);

// Cap at VOCABULARY_MAX_ENTRIES.
for (let index = 0; index < 205; index += 1) {
  await recordVocabularyLookup(storage, `word-${index}`);
}
list = await listVocabulary(storage);
assert.equal(list.length, VOCABULARY_MAX_ENTRIES);
assert.equal(list[0].word, "word-204");

await clearVocabulary(storage);
assert.deepEqual(await listVocabulary(storage), []);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-vocabulary-storage.mjs`
Expected: FAIL — module missing

- [ ] **Step 3: Implement `src/services/storage/vocabulary.ts`**

```ts
import type { VocabularyRecord } from "@/shared/types";

export const VOCABULARY_STORAGE_KEY = "extention-translate:vocabulary";
export const VOCABULARY_MAX_ENTRIES = 200;

export interface VocabularyStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function normalizeRecord(value: unknown): VocabularyRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.word !== "string" || !record.word.trim()) return null;
  return {
    word: record.word,
    translation: typeof record.translation === "string" && record.translation ? record.translation : undefined,
    lookedUpAt: typeof record.lookedUpAt === "number" ? record.lookedUpAt : Date.now(),
    favorite: record.favorite === true,
  };
}

export async function listVocabulary(storage: VocabularyStorageLike): Promise<VocabularyRecord[]> {
  const raw = await storage.get(VOCABULARY_STORAGE_KEY);
  const stored = raw[VOCABULARY_STORAGE_KEY];
  if (!Array.isArray(stored)) return [];
  return stored.map(normalizeRecord).filter((record): record is VocabularyRecord => record !== null);
}

async function save(storage: VocabularyStorageLike, records: VocabularyRecord[]): Promise<void> {
  await storage.set({ [VOCABULARY_STORAGE_KEY]: records });
}

export async function recordVocabularyLookup(
  storage: VocabularyStorageLike,
  word: string,
  translation?: string,
): Promise<VocabularyRecord[]> {
  const trimmed = word.trim();
  if (!trimmed) return listVocabulary(storage);
  const existing = await listVocabulary(storage);
  const previous = existing.find((record) => record.word.toLowerCase() === trimmed.toLowerCase());
  const next: VocabularyRecord = {
    word: trimmed,
    translation: translation ?? previous?.translation,
    lookedUpAt: Date.now(),
    favorite: previous?.favorite ?? false,
  };
  const records = [next, ...existing.filter((record) => record.word.toLowerCase() !== trimmed.toLowerCase())]
    .slice(0, VOCABULARY_MAX_ENTRIES);
  await save(storage, records);
  return records;
}

export async function toggleVocabularyFavorite(storage: VocabularyStorageLike, word: string): Promise<VocabularyRecord[]> {
  const records = await listVocabulary(storage);
  const next = records.map((record) =>
    record.word.toLowerCase() === word.trim().toLowerCase()
      ? { ...record, favorite: !record.favorite }
      : record,
  );
  await save(storage, next);
  return next;
}

export async function removeVocabularyEntry(storage: VocabularyStorageLike, word: string): Promise<VocabularyRecord[]> {
  const records = await listVocabulary(storage);
  const next = records.filter((record) => record.word.toLowerCase() !== word.trim().toLowerCase());
  await save(storage, next);
  return next;
}

export async function clearVocabulary(storage: VocabularyStorageLike): Promise<void> {
  await storage.set({ [VOCABULARY_STORAGE_KEY]: [] });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-vocabulary-storage.mjs`
Expected: PASS

- [ ] **Step 5: Add types, message types, background handlers, and auto-recording**

In `src/shared/types.ts`, add:

```ts
export interface VocabularyRecord {
  word: string;
  translation?: string;
  lookedUpAt: number;
  favorite: boolean;
}
```

In `src/shared/constants.ts`, add to `MESSAGE_TYPES`:

```ts
  VOCABULARY_LIST: "VOCABULARY_LIST",
  VOCABULARY_TOGGLE_FAVORITE: "VOCABULARY_TOGGLE_FAVORITE",
  VOCABULARY_REMOVE: "VOCABULARY_REMOVE",
  VOCABULARY_CLEAR: "VOCABULARY_CLEAR",
```

In `src/background/index.ts`, add a storage adapter near the top (mirroring the content script's adapter):

```ts
const vocabularyStorage = {
  get: (key: string) => new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items as Record<string, unknown>));
  }),
  set: (items: Record<string, unknown>) => new Promise<void>((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  }),
};
```

and add four branches in the `onMessage` listener (after `SAVE_SETTINGS`):

```ts
  if (type === MESSAGE_TYPES.VOCABULARY_LIST) {
    listVocabulary(vocabularyStorage).then((records) => sendResponse({ ok: true, payload: records }));
    return true;
  }

  if (type === MESSAGE_TYPES.VOCABULARY_TOGGLE_FAVORITE) {
    toggleVocabularyFavorite(vocabularyStorage, (payload as { word: string }).word)
      .then((records) => sendResponse({ ok: true, payload: records }));
    return true;
  }

  if (type === MESSAGE_TYPES.VOCABULARY_REMOVE) {
    removeVocabularyEntry(vocabularyStorage, (payload as { word: string }).word)
      .then((records) => sendResponse({ ok: true, payload: records }));
    return true;
  }

  if (type === MESSAGE_TYPES.VOCABULARY_CLEAR) {
    clearVocabulary(vocabularyStorage).then(() => sendResponse({ ok: true }));
    return true;
  }
```

(import the four functions from `@/services/storage/vocabulary`).

In `src/background/dictionaryHandlers.ts`, record successful lookups. At the end of the success path in `lookupDictionarySource` — just before `return { entry, sourceEntry: entry, translationStatus: "source" };` — add:

```ts
    void recordVocabularyLookup(backgroundVocabularyStorage, entry.word, firstTranslation(entry)).catch(() => {
      // History recording must never break a lookup.
    });
```

with helpers added to the same file:

```ts
import { recordVocabularyLookup, type VocabularyStorageLike } from "@/services/storage/vocabulary";

const backgroundVocabularyStorage: VocabularyStorageLike = {
  get: (key) => new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items as Record<string, unknown>));
  }),
  set: (items) => new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  }),
};

function firstTranslation(entry: DictionaryEntry): string | undefined {
  return entry.meanings.find((meaning) => meaning.translation)?.translation;
}
```

(import `DictionaryEntry` type — already available via the existing type imports.)

- [ ] **Step 6: Type-check and regression**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-vocabulary-storage.mjs && node --experimental-strip-types scripts/test-dictionary-source-race.mjs`
Expected: PASS

- [ ] **Step 7: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:vocabulary-storage": "node --experimental-strip-types scripts/test-vocabulary-storage.mjs",
```

```bash
git add src/services/storage/vocabulary.ts src/shared/types.ts src/shared/constants.ts src/background/index.ts src/background/dictionaryHandlers.ts scripts/test-vocabulary-storage.mjs package.json
git commit -m "feat: persist vocabulary history with favorites in storage"
```

---

### Task 15: Favorite star in the popup header

A star button next to the copy button toggles the favorite flag for the current word and reflects its current state.

**Files:**
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Modify: `src/components/dictionary/copy.ts` (`favoriteAdd`, `favoriteRemove`)
- Test: `scripts/test-popup-favorite.mjs`

**Interfaces:**
- Consumes: `MESSAGE_TYPES.VOCABULARY_TOGGLE_FAVORITE` (Task 14), `chrome.runtime.sendMessage`
- Produces: star toggle in header; `PopupCopy.favoriteAdd/favoriteRemove`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-popup-favorite.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPopupCopy } from "../src/components/dictionary/copy.ts";

for (const language of ["en", "vi", "zh-CN"]) {
  const copy = getPopupCopy(language);
  assert.ok(copy.favoriteAdd?.length > 0, `${language}: favoriteAdd`);
  assert.ok(copy.favoriteRemove?.length > 0, `${language}: favoriteRemove`);
}

const headerSource = await readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8");
assert.match(headerSource, /VOCABULARY_TOGGLE_FAVORITE/);
assert.match(headerSource, /Star/);
assert.match(headerSource, /isFavorite/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-favorite.mjs`
Expected: FAIL

- [ ] **Step 3: Implement**

In `src/components/dictionary/copy.ts`, add to `PopupCopy`:

```ts
  favoriteAdd: string;
  favoriteRemove: string;
```

Values:
- en: `favoriteAdd: "Add to vocabulary"`, `favoriteRemove: "Remove from vocabulary"`
- vi: `favoriteAdd: "Thêm vào sổ từ vựng"`, `favoriteRemove: "Bỏ khỏi sổ từ vựng"`
- zh-CN: `favoriteAdd: "加入词汇本"`, `favoriteRemove: "从词汇本移除"`

In `src/components/dictionary/DictionaryHeader.tsx`:

Add imports: `Star` from `lucide-react`, `MESSAGE_TYPES` from `@/shared/constants`, and `VOCABULARY_STORAGE_KEY`, `listVocabulary` are not needed — query favorite state via a new lightweight message. Simplest: read favorites through `VOCABULARY_LIST`.

Add state and effect inside the component:

```tsx
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.VOCABULARY_LIST, payload: undefined },
      (response: { ok?: boolean; payload?: Array<{ word: string; favorite: boolean }> } | undefined) => {
        if (cancelled || !response?.ok) return;
        const match = response.payload?.find((record) => record.word.toLowerCase() === entry.word.toLowerCase());
        setIsFavorite(match?.favorite ?? false);
      },
    );
    return () => { cancelled = true; };
  }, [entry.word]);

  function toggleFavorite() {
    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.VOCABULARY_TOGGLE_FAVORITE, payload: { word: entry.word } },
      (response: { ok?: boolean; payload?: Array<{ word: string; favorite: boolean }> } | undefined) => {
        if (!response?.ok) return;
        const match = response.payload?.find((record) => record.word.toLowerCase() === entry.word.toLowerCase());
        setIsFavorite(match?.favorite ?? false);
      },
    );
  }
```

Add the star button in the header actions, immediately before the copy `Tooltip`:

```tsx
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={isFavorite ? labels.favoriteRemove : labels.favoriteAdd}
              aria-pressed={isFavorite}
              onClick={toggleFavorite}
            >
              <Star
                className={`h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isFavorite ? labels.favoriteRemove : labels.favoriteAdd}</TooltipContent>
        </Tooltip>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-favorite.mjs`
Expected: PASS

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`

Add to `package.json` `"scripts"`:

```json
"test:popup-favorite": "node --experimental-strip-types scripts/test-popup-favorite.mjs",
```

```bash
git add src/components/dictionary/DictionaryHeader.tsx src/components/dictionary/copy.ts scripts/test-popup-favorite.mjs package.json
git commit -m "feat: favorite star for vocabulary in popup header"
```

---

### Task 16: Vocabulary section in Settings (list, filter, delete, clear, CSV/Anki export)

A new Settings section shows the vocabulary list with search, favorites filter, per-entry delete, clear-all, and export buttons (CSV and Anki-compatible CSV).

**Files:**
- Create: `src/shared/exporters.ts` (pure CSV builders)
- Create: `src/settings/sections/VocabularySection.tsx`
- Modify: `src/settings/navigation.ts` (add section)
- Modify: `src/settings/App.tsx` (render section)
- Test: `scripts/test-vocabulary-export.mjs`

**Interfaces:**
- Produces: `export function toVocabularyCsv(records: VocabularyRecord[]): string`, `export function toAnkiCsv(records: VocabularyRecord[]): string`
- Consumes: `VocabularyRecord`, `MESSAGE_TYPES.VOCABULARY_*` (Task 14)

- [ ] **Step 1: Write the failing test**

Create `scripts/test-vocabulary-export.mjs`:

```js
import assert from "node:assert/strict";
import { toVocabularyCsv, toAnkiCsv } from "../src/shared/exporters.ts";

const records = [
  { word: "run", translation: "chạy, vận hành", lookedUpAt: 1755400000000, favorite: true },
  { word: 'say "hi", ok', translation: 'nói "xin chào"', lookedUpAt: 1755400001000, favorite: false },
];

const csv = toVocabularyCsv(records);
const lines = csv.split("\n");
assert.equal(lines[0], "word,translation,favorite,lookedUpAt");
assert.equal(lines[1], "run,\"chạy, vận hành\",true,1755400000000");
assert.equal(lines[2], "\"say \"\"hi\"\", ok\",\"nói \"\"xin chào\"\"\",false,1755400001000");

const anki = toAnkiCsv(records);
const ankiLines = anki.split("\n");
assert.equal(ankiLines[0], "#separator:Comma");
assert.equal(ankiLines[1], "#html:false");
assert.equal(ankiLines[2], "run,chạy\\, vận hành");
assert.ok(ankiLines[3].startsWith('"say ""hi""'), "quotes are doubled in Anki export");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-vocabulary-export.mjs`
Expected: FAIL — module missing

- [ ] **Step 3: Implement `src/shared/exporters.ts`**

```ts
import type { VocabularyRecord } from "@/shared/types";

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toVocabularyCsv(records: VocabularyRecord[]): string {
  const header = "word,translation,favorite,lookedUpAt";
  const rows = records.map((record) => [
    csvField(record.word),
    csvField(record.translation ?? ""),
    record.favorite ? "true" : "false",
    String(record.lookedUpAt),
  ].join(","));
  return [header, ...rows].join("\n");
}

// Anki imports commas as field separators even inside quoted fields unless
// escaped, so commas inside values are backslash-escaped instead of quoted.
function ankiField(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/\n/g, "<br>");
  if (/"/.test(escaped)) return `"${escaped.replace(/"/g, '""')}"`;
  return escaped;
}

export function toAnkiCsv(records: VocabularyRecord[]): string {
  const header = ["#separator:Comma", "#html:false"];
  const rows = records.map((record) => [
    ankiField(record.word),
    ankiField(record.translation ?? record.word),
  ].join(","));
  return [...header, ...rows].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-vocabulary-export.mjs`
Expected: PASS

- [ ] **Step 5: Implement `src/settings/sections/VocabularySection.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Download, Search, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { toAnkiCsv, toVocabularyCsv } from "@/shared/exporters";
import type { VocabularyRecord } from "@/shared/types";

interface MessageResponse<T> {
  ok: boolean;
  payload?: T;
  error?: string;
}

function sendMessage<T>(type: string, payload?: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response?: MessageResponse<T>) => {
      resolve(response?.ok ? response.payload : undefined);
    });
  });
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VocabularySection() {
  const [records, setRecords] = useState<VocabularyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  async function refresh() {
    const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_LIST");
    setRecords(list ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      if (favoritesOnly && !record.favorite) return false;
      if (!normalized) return true;
      return record.word.toLowerCase().includes(normalized)
        || (record.translation ?? "").toLowerCase().includes(normalized);
    });
  }, [records, query, favoritesOnly]);

  async function toggleFavorite(word: string) {
    const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_TOGGLE_FAVORITE", { word });
    if (list) setRecords(list);
  }

  async function remove(word: string) {
    const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_REMOVE", { word });
    if (list) setRecords(list);
  }

  async function clearAll() {
    await sendMessage("VOCABULARY_CLEAR");
    setRecords([]);
    toast.success("Đã xóa toàn bộ sổ từ vựng");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm trong sổ từ vựng…"
            aria-label="Tìm trong sổ từ vựng"
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant={favoritesOnly ? "default" : "outline"}
          onClick={() => setFavoritesOnly((value) => !value)}
          aria-pressed={favoritesOnly}
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          Yêu thích
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{visible.length} mục</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={records.length === 0}
            onClick={() => downloadFile("extention-translate-vocabulary.csv", toVocabularyCsv(records))}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất CSV
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={records.length === 0}
            onClick={() => downloadFile("extention-translate-anki.csv", toAnkiCsv(records))}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất Anki
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={records.length === 0} onClick={() => void clearAll()}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xóa tất cả
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {records.length === 0
            ? "Chưa có từ nào được lưu. Tra từ trên web và đánh dấu sao để lưu vào đây."
            : "Không có mục nào khớp bộ lọc."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {visible.map((record) => (
            <li key={record.word} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                aria-label={record.favorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}
                aria-pressed={record.favorite}
                onClick={() => void toggleFavorite(record.word)}
                className="rounded p-1 hover:bg-accent"
              >
                <Star className={`h-4 w-4 ${record.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{record.word}</p>
                {record.translation && <p className="truncate text-xs text-muted-foreground">{record.translation}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(record.lookedUpAt).toLocaleDateString()}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                aria-label={`Xóa ${record.word}`} onClick={() => void remove(record.word)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Register the section**

In `src/settings/navigation.ts`:

Change the union:

```ts
export type SettingsSectionId = "overview" | "popup" | "openrouter" | "vocabulary" | "about";
```

Add `BookMarked` to the lucide import and insert this item into `SETTINGS_NAVIGATION` between the `openrouter` and `about` items:

```ts
  {
    id: "vocabulary",
    icon: BookMarked,
    title: "Sổ từ vựng",
    description: "Từ đã tra, yêu thích và xuất dữ liệu.",
  },
```

In `src/settings/App.tsx`, import `VocabularySection` and add after the `popup` section render:

```tsx
            {activeSection === "vocabulary" && <VocabularySection />}
```

In `scripts/test-settings-layout.mjs`, extend the two loops to include the new section:

```js
for (const id of ["overview", "popup", "openrouter", "vocabulary", "about"]) {
```

and

```js
for (const section of ["OverviewSection", "PopupDictionarySection", "OpenRouterSection", "VocabularySection", "AboutSection"]) {
```

and add `readSettingsSource("../src/settings/sections/VocabularySection.tsx")` to the `Promise.all` destructuring (add `vocabularySource`), including it in the `<section>`/`<Card>` loop at the bottom:

```js
for (const sectionSource of [overviewSource, popupSource, openRouterSource, vocabularySource, aboutSource]) {
```

For that loop to pass, wrap `VocabularySection`'s returned JSX in the same shell the other sections use — replace the outer `<div className="space-y-4">` in Step 5's component with:

```tsx
    <section className="w-full min-w-0 max-w-full space-y-4">
      <Card className="min-w-0 max-w-full">
        <div className="space-y-4 p-4">
          ...existing content...
        </div>
      </Card>
    </section>
```

(importing `Card` from `@/components/ui/card`).

- [ ] **Step 7: Type-check, run tests, commit**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-vocabulary-export.mjs && node --experimental-strip-types scripts/test-settings-layout.mjs`
Expected: PASS (if `test-settings-layout.mjs` asserts an exact section list, update its expected list to include `vocabulary` — that update is part of this task).

Add to `package.json` `"scripts"`:

```json
"test:vocabulary-export": "node --experimental-strip-types scripts/test-vocabulary-export.mjs",
```

```bash
git add src/shared/exporters.ts src/settings/sections/VocabularySection.tsx src/settings/navigation.ts src/settings/App.tsx scripts/test-vocabulary-export.mjs scripts/test-settings-layout.mjs package.json
git commit -m "feat: vocabulary settings section with CSV and Anki export"
```

---

# Phase 5 — Settings i18n

### Task 17: Extract settings-page copy into locale files

The popup is already localized via `copy.ts`; the Settings page is hardcoded Vietnamese. Extract all user-facing settings strings into typed locale files for `en`, `vi`, `zh-CN`, selected by `settings.targetLanguage`.

**Files:**
- Create: `src/settings/locales/types.ts`
- Create: `src/settings/locales/en.ts`
- Create: `src/settings/locales/vi.ts`
- Create: `src/settings/locales/zh-CN.ts`
- Create: `src/settings/locales/index.ts`
- Modify: `src/settings/App.tsx`, `src/settings/SettingsSidebar.tsx`, `src/settings/navigation.ts`, and all five files in `src/settings/sections/` (`SettingRow.tsx` has no hardcoded strings — it receives `title`/`description` as props and stays untouched)
- Test: `scripts/test-settings-i18n.mjs`

**Interfaces:**
- Produces: `export interface SettingsCopy` (flat string keys, full list in Step 3), `export function getSettingsCopy(language: TargetLanguage): SettingsCopy`, `export const SETTINGS_LOCALES: Record<TargetLanguage, SettingsCopy>`, `export function getSettingsNavigation(copy: SettingsCopy): SettingsNavigationItem[]` (replaces the static `SETTINGS_NAVIGATION` array)
- Consumes: `TargetLanguage` from `src/shared/types.ts`

Scope note: `getOpenRouterSettingsValidationError` in `src/shared/types.ts` keeps its Vietnamese messages — it is a shared validation contract covered by existing tests, and localizing it would change a tested public signature. Everything rendered by the settings UI chrome is localized.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-settings-i18n.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SETTINGS_LOCALES, getSettingsCopy } from "../src/settings/locales/index.ts";

const languages = ["en", "vi", "zh-CN"];
const referenceKeys = Object.keys(SETTINGS_LOCALES.vi).sort();
assert.ok(referenceKeys.length >= 30, "locale map covers the settings surface");

for (const language of languages) {
  const copy = getSettingsCopy(language);
  assert.deepEqual(Object.keys(copy).sort(), referenceKeys, `${language} has the same keys as vi`);
  for (const [key, value] of Object.entries(copy)) {
    assert.ok(typeof value === "string" && value.length > 0, `${language}.${key} is a non-empty string`);
  }
}

// Settings components consume the locale helper, not hardcoded Vietnamese.
const files = [
  "../src/settings/App.tsx",
  "../src/settings/sections/OverviewSection.tsx",
  "../src/settings/sections/PopupDictionarySection.tsx",
  "../src/settings/sections/OpenRouterSection.tsx",
  "../src/settings/sections/AboutSection.tsx",
];
for (const file of files) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  assert.match(source, /getSettingsCopy/, `${file} uses getSettingsCopy`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-settings-i18n.mjs`
Expected: FAIL — locales module missing

- [ ] **Step 3: Implement locale files**

Create `src/settings/locales/types.ts` with the complete flat key map (every user-facing settings string, audited from the eight settings files):

```ts
export interface SettingsCopy {
  // Navigation (titles + descriptions for the five sections)
  navOverviewTitle: string;
  navOverviewDescription: string;
  navPopupTitle: string;
  navPopupDescription: string;
  navOpenRouterTitle: string;
  navOpenRouterDescription: string;
  navVocabularyTitle: string;
  navVocabularyDescription: string;
  navAboutTitle: string;
  navAboutDescription: string;

  // Sidebar
  sidebarNavLabel: string;
  sidebarSubtitle: string;
  sidebarVersionPrefix: string; // rendered as `${prefix} ${version}`

  // App shell / save bar
  breadcrumbRoot: string;
  loading: string;
  saveBarDirty: string;
  saveBarSaving: string;
  saveBarError: string;
  discard: string;
  save: string;
  saving: string;
  savedToast: string;
  saveFailedToast: string;
  contactError: string;
  unacknowledgedError: string;
  sendError: string;

  // Overview
  overviewHeading: string;
  overviewIntro: string;
  statTriggerMode: string;
  statDisplayLanguage: string;
  statAutoAsk: string;
  statAutoAskOnValue: string;
  statAutoAskOffValue: string;
  statAutoAskOnBadge: string;
  statAutoAskOffBadge: string;
  statApiKey: string;
  statApiKeyConfigured: string;
  statApiKeyMissing: string;
  statApiKeyReadyBadge: string;
  statApiKeySetupBadge: string;
  quickLinksTitle: string;
  quickLinksDescription: string;

  // Popup & Dictionary section
  popupHeading: string;
  selectionCardTitle: string;
  selectionCardDescription: string;
  triggerIconLabel: string;
  triggerIconDescription: string;
  triggerPopupLabel: string;
  triggerPopupDescription: string;
  triggerOffLabel: string;
  triggerOffDescription: string;
  themeCardTitle: string;
  themeCardDescription: string;
  themeAutoLabel: string;
  themeAutoDescription: string;
  themeLightLabel: string;
  themeLightDescription: string;
  themeDarkLabel: string;
  themeDarkDescription: string;
  languageTitle: string;
  languageDescription: string;
  languagePlaceholder: string;
  aiCardTitle: string;
  aiCardDescription: string;
  autoAskTitle: string;
  autoAskDescription: string;
  contextTitle: string;
  contextDescription: string;
  previewTitle: string;
  previewDescription: string;

  // OpenRouter section
  openrouterHeading: string;
  connectionCardTitle: string;
  connectionCardDescriptionLead: string; // followed by the openrouter.ai/keys link
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  showKeyAria: string;
  hideKeyAria: string;
  clearKey: string;
  checkKey: string;
  checkingKey: string;
  keyCheckOk: string; // contains {count}
  keyCheckFailed: string;
  keyCheckError: string;
  apiKeyNote: string;
  modelLabel: string;
  modelHint: string;
  behaviorCardTitle: string;
  behaviorCardDescription: string;
  thinkingTitle: string;
  thinkingDescription: string;
  reasoningEffortTitle: string;
  reasoningEffortDescription: string;
  reasoningBudgetLabel: string;
  reasoningBudgetPlaceholder: string;
  reasoningBudgetHint: string;
  maxTokensLabel: string;
  maxTokensHint: string;
  systemPromptLabel: string;
  resetSystemPrompt: string;
  systemPromptHint: string;

  // Vocabulary section
  vocabularySearchPlaceholder: string;
  vocabularyFavoritesFilter: string;
  vocabularyCountSuffix: string;
  vocabularyExportCsv: string;
  vocabularyExportAnki: string;
  vocabularyClearAll: string;
  vocabularyClearedToast: string;
  vocabularyEmptyAll: string;
  vocabularyEmptyFiltered: string;
  vocabularyFavoriteAddAria: string;
  vocabularyFavoriteRemoveAria: string;
  vocabularyRemoveAriaPrefix: string;

  // About section
  aboutTitle: string;
  aboutVersionPrefix: string; // rendered as `${prefix} ${version}.`
  aboutSourcesLead: string; // followed by the two source links
  aboutSourcesTail: string; // preceded by the links, e.g. "(CC BY-SA 4.0) ..."
  aboutPrivacy: string;
  aboutBrowserSupport: string;
  aboutDocsLink: string;
}
```

Create `src/settings/locales/vi.ts` — exact current strings copied verbatim from the components (`export const vi: SettingsCopy = { ... }`):

```ts
import type { SettingsCopy } from "./types";

export const vi: SettingsCopy = {
  navOverviewTitle: "Tổng quan",
  navOverviewDescription: "Xem nhanh trạng thái tiện ích.",
  navPopupTitle: "Popup & Từ điển",
  navPopupDescription: "Điều chỉnh tra từ khi bôi đen.",
  navOpenRouterTitle: "OpenRouter AI",
  navOpenRouterDescription: "Quản lý AI, model và hướng dẫn trả lời.",
  navVocabularyTitle: "Sổ từ vựng",
  navVocabularyDescription: "Từ đã tra, yêu thích và xuất dữ liệu.",
  navAboutTitle: "Giới thiệu",
  navAboutDescription: "Nguồn dữ liệu, quyền riêng tư và hỗ trợ.",
  sidebarNavLabel: "Điều hướng cài đặt",
  sidebarSubtitle: "Cài đặt tiện ích",
  sidebarVersionPrefix: "Phiên bản",
  breadcrumbRoot: "Cài đặt",
  loading: "Đang tải…",
  saveBarDirty: "Bạn có thay đổi chưa lưu.",
  saveBarSaving: "Đang lưu thay đổi…",
  saveBarError: "Không thể lưu. Vui lòng thử lại.",
  discard: "Hủy thay đổi",
  save: "Lưu thay đổi",
  saving: "Đang lưu…",
  savedToast: "Đã lưu cài đặt",
  saveFailedToast: "Không thể lưu cài đặt",
  contactError: "Không thể liên hệ tiện ích.",
  unacknowledgedError: "Tiện ích không xác nhận yêu cầu.",
  sendError: "Không thể gửi yêu cầu đến tiện ích.",
  overviewHeading: "Tổng quan",
  overviewIntro: "ExtentionTranslate giúp bạn tra nghĩa tiếng Anh và nhận giải thích từ AI ngay khi đọc web. Dưới đây là trạng thái hiện tại của tiện ích.",
  statTriggerMode: "Cách kích hoạt khi bôi đen",
  statDisplayLanguage: "Ngôn ngữ hiển thị",
  statAutoAsk: "Tự động hỏi AI",
  statAutoAskOnValue: "Bật khi mở popup",
  statAutoAskOffValue: "Đang tắt",
  statAutoAskOnBadge: "Đang bật",
  statAutoAskOffBadge: "Đang tắt",
  statApiKey: "OpenRouter API key",
  statApiKeyConfigured: "Đã cấu hình",
  statApiKeyMissing: "Chưa cấu hình",
  statApiKeyReadyBadge: "Sẵn sàng",
  statApiKeySetupBadge: "Cần thiết lập",
  quickLinksTitle: "Đi đến phần cài đặt",
  quickLinksDescription: "Chọn khu vực bạn muốn điều chỉnh.",
  popupHeading: "Popup & Từ điển",
  selectionCardTitle: "Khi bôi đen văn bản",
  selectionCardDescription: "Chọn cách tiện ích phản hồi sau khi bạn bôi đen một từ hoặc cụm từ.",
  triggerIconLabel: "Hiện icon cạnh vùng chọn",
  triggerIconDescription: "Bấm icon để mở popup khi bạn cần xem nghĩa.",
  triggerPopupLabel: "Mở popup ngay khi bôi đen",
  triggerPopupDescription: "Tra từ ngay lập tức sau khi vùng chọn được xác nhận.",
  triggerOffLabel: "Tắt thao tác khi bôi đen",
  triggerOffDescription: "Không hiện icon hoặc popup trên website.",
  themeCardTitle: "Giao diện & ngôn ngữ",
  themeCardDescription: "Chọn nền sáng hoặc tối cho popup và trang cài đặt, cùng ngôn ngữ hiển thị kết quả.",
  themeAutoLabel: "Tự động (theo hệ thống)",
  themeAutoDescription: "Theo chế độ sáng/tối của máy bạn.",
  themeLightLabel: "Sáng",
  themeLightDescription: "Luôn dùng nền sáng.",
  themeDarkLabel: "Tối",
  themeDarkDescription: "Luôn dùng nền tối.",
  languageTitle: "Ngôn ngữ hiển thị",
  languageDescription: "Kết quả trong tab Từ điển lấy dữ liệu gốc từ dictionaryapi.dev, ưu tiên dịch ngay trên Chrome/Edge; nếu không khả dụng sẽ thử FreeDictionaryAPI.com rồi mới đến OpenRouter.",
  languagePlaceholder: "Chọn ngôn ngữ",
  aiCardTitle: "AI trong popup",
  aiCardDescription: "Điều chỉnh cách tab AI hoạt động khi bạn tra từ.",
  autoAskTitle: "Tự động hỏi AI khi mở popup",
  autoAskDescription: "Mỗi popup mới sẽ hỏi AI một lần nếu đã có OpenRouter API key. Tắt mặc định để tránh phát sinh chi phí ngoài ý muốn.",
  contextTitle: "Gửi ngữ cảnh xung quanh cho AI",
  contextDescription: "Khi bật, AI nhận thêm câu đầy đủ và phần văn bản trước/sau vùng bôi đen. Khi tắt, AI chỉ nhận đúng nội dung bạn đã chọn.",
  previewTitle: "Xem trước popup",
  previewDescription: "Bản xem trước hiển thị theo ngôn ngữ bạn chọn ở trên.",
  openrouterHeading: "OpenRouter AI",
  connectionCardTitle: "Kết nối OpenRouter",
  connectionCardDescriptionLead: "Cấu hình để sử dụng tính năng \"Hỏi AI\". Lấy API key tại",
  apiKeyLabel: "OpenRouter API Key",
  apiKeyPlaceholder: "sk-or-v1-...",
  showKeyAria: "Hiện API key",
  hideKeyAria: "Ẩn API key",
  clearKey: "Xóa key",
  checkKey: "Kiểm tra key",
  checkingKey: "Đang kiểm tra…",
  keyCheckOk: "Key hợp lệ — {count} model khả dụng.",
  keyCheckFailed: "Key không hợp lệ hoặc không kết nối được OpenRouter.",
  keyCheckError: "Không kiểm tra được key. Vui lòng thử lại.",
  apiKeyNote: "API key được lưu cục bộ trong trình duyệt và chỉ được dùng để gọi OpenRouter.",
  modelLabel: "Model",
  modelHint: "Tìm kiếm và chọn từ hơn 500+ model của OpenRouter. Có thể nhập model tuỳ chỉnh.",
  behaviorCardTitle: "Hành vi AI",
  behaviorCardDescription: "Điều chỉnh cách AI suy luận và trả lời trong popup.",
  thinkingTitle: "Bật chế độ suy luận AI",
  thinkingDescription: "Cho phép model hỗ trợ reasoning suy luận trước khi trả lời. Phần suy luận được thu gọn mặc định trong popup.",
  reasoningEffortTitle: "Mức reasoning",
  reasoningEffortDescription: "Chọn mức độ suy luận khi không nhập Reasoning budget chính xác.",
  reasoningBudgetLabel: "Reasoning budget",
  reasoningBudgetPlaceholder: "Tự động",
  reasoningBudgetHint: "Để trống để dùng mức reasoning. Phạm vi: 1024–8192 token.",
  maxTokensLabel: "Max output tokens",
  maxTokensHint: "Giới hạn tổng output của Hỏi AI. Phạm vi: 512–8192 token.",
  systemPromptLabel: "System Prompt",
  resetSystemPrompt: "Khôi phục mặc định",
  systemPromptHint: "System Prompt điều khiển ngôn ngữ và cách trả lời của tab AI trong popup. Khi từ điển không có dữ liệu, prompt này cũng định dạng bản dịch JSON dùng cho tab Từ điển.",
  vocabularySearchPlaceholder: "Tìm trong sổ từ vựng…",
  vocabularyFavoritesFilter: "Yêu thích",
  vocabularyCountSuffix: "mục",
  vocabularyExportCsv: "Xuất CSV",
  vocabularyExportAnki: "Xuất Anki",
  vocabularyClearAll: "Xóa tất cả",
  vocabularyClearedToast: "Đã xóa toàn bộ sổ từ vựng",
  vocabularyEmptyAll: "Chưa có từ nào được lưu. Tra từ trên web và đánh dấu sao để lưu vào đây.",
  vocabularyEmptyFiltered: "Không có mục nào khớp bộ lọc.",
  vocabularyFavoriteAddAria: "Đánh dấu yêu thích",
  vocabularyFavoriteRemoveAria: "Bỏ yêu thích",
  vocabularyRemoveAriaPrefix: "Xóa",
  aboutTitle: "Giới thiệu",
  aboutVersionPrefix: "ExtentionTranslate phiên bản",
  aboutSourcesLead: "Dữ liệu từ điển tiếng Anh sử dụng",
  aboutSourcesTail: "(CC BY-SA 4.0) làm nguồn dự phòng.",
  aboutPrivacy: "OpenRouter API key của bạn chỉ được lưu cục bộ trong trình duyệt và dùng để gọi OpenRouter.",
  aboutBrowserSupport: "Tiện ích hỗ trợ Google Chrome và Microsoft Edge.",
  aboutDocsLink: "Xem tài liệu dictionaryapi.dev",
};
```

Create `src/settings/locales/en.ts` (`export const en: SettingsCopy`) translating every key:

```ts
import type { SettingsCopy } from "./types";

export const en: SettingsCopy = {
  navOverviewTitle: "Overview",
  navOverviewDescription: "A quick look at the extension's status.",
  navPopupTitle: "Popup & Dictionary",
  navPopupDescription: "Adjust how selection lookups work.",
  navOpenRouterTitle: "OpenRouter AI",
  navOpenRouterDescription: "Manage AI, models, and response instructions.",
  navVocabularyTitle: "Vocabulary",
  navVocabularyDescription: "Looked-up words, favorites, and data export.",
  navAboutTitle: "About",
  navAboutDescription: "Data sources, privacy, and support.",
  sidebarNavLabel: "Settings navigation",
  sidebarSubtitle: "Extension settings",
  sidebarVersionPrefix: "Version",
  breadcrumbRoot: "Settings",
  loading: "Loading…",
  saveBarDirty: "You have unsaved changes.",
  saveBarSaving: "Saving changes…",
  saveBarError: "Could not save. Please try again.",
  discard: "Discard changes",
  save: "Save changes",
  saving: "Saving…",
  savedToast: "Settings saved",
  saveFailedToast: "Could not save settings",
  contactError: "Could not reach the extension.",
  unacknowledgedError: "The extension did not acknowledge the request.",
  sendError: "Could not send the request to the extension.",
  overviewHeading: "Overview",
  overviewIntro: "ExtentionTranslate lets you look up English meanings and get AI explanations while reading the web. Here is the current state of the extension.",
  statTriggerMode: "Selection trigger",
  statDisplayLanguage: "Display language",
  statAutoAsk: "Automatic Ask AI",
  statAutoAskOnValue: "On when the popup opens",
  statAutoAskOffValue: "Off",
  statAutoAskOnBadge: "Enabled",
  statAutoAskOffBadge: "Disabled",
  statApiKey: "OpenRouter API key",
  statApiKeyConfigured: "Configured",
  statApiKeyMissing: "Not configured",
  statApiKeyReadyBadge: "Ready",
  statApiKeySetupBadge: "Setup needed",
  quickLinksTitle: "Go to settings area",
  quickLinksDescription: "Pick the area you want to adjust.",
  popupHeading: "Popup & Dictionary",
  selectionCardTitle: "When you select text",
  selectionCardDescription: "Choose how the extension responds after you select a word or phrase.",
  triggerIconLabel: "Show an icon next to the selection",
  triggerIconDescription: "Click the icon to open the popup when you need a definition.",
  triggerPopupLabel: "Open the popup immediately on selection",
  triggerPopupDescription: "Look up instantly once the selection is confirmed.",
  triggerOffLabel: "Disable selection actions",
  triggerOffDescription: "No icon or popup on websites.",
  themeCardTitle: "Appearance & language",
  themeCardDescription: "Choose the light or dark theme for the popup and settings page, plus the result display language.",
  themeAutoLabel: "Automatic (follow system)",
  themeAutoDescription: "Follows your device's light/dark mode.",
  themeLightLabel: "Light",
  themeLightDescription: "Always use a light background.",
  themeDarkLabel: "Dark",
  themeDarkDescription: "Always use a dark background.",
  languageTitle: "Display language",
  languageDescription: "Dictionary tab results come from dictionaryapi.dev and are translated on-device in Chrome/Edge first; if unavailable, FreeDictionaryAPI.com is tried before OpenRouter.",
  languagePlaceholder: "Choose a language",
  aiCardTitle: "AI in the popup",
  aiCardDescription: "Adjust how the AI tab behaves when you look up words.",
  autoAskTitle: "Automatically ask AI when the popup opens",
  autoAskDescription: "Each new popup asks AI once when an OpenRouter API key is configured. Off by default to avoid unexpected costs.",
  contextTitle: "Send surrounding context to AI",
  contextDescription: "When on, AI also receives the full sentence and the text before/after the selection. When off, AI receives only the selected text.",
  previewTitle: "Popup preview",
  previewDescription: "The preview renders in the language you chose above.",
  openrouterHeading: "OpenRouter AI",
  connectionCardTitle: "Connect OpenRouter",
  connectionCardDescriptionLead: "Configure the \"Ask AI\" feature. Get an API key at",
  apiKeyLabel: "OpenRouter API Key",
  apiKeyPlaceholder: "sk-or-v1-...",
  showKeyAria: "Show API key",
  hideKeyAria: "Hide API key",
  clearKey: "Clear key",
  checkKey: "Check key",
  checkingKey: "Checking…",
  keyCheckOk: "Key is valid — {count} models available.",
  keyCheckFailed: "The key is invalid or OpenRouter is unreachable.",
  keyCheckError: "Could not check the key. Please try again.",
  apiKeyNote: "The API key is stored locally in your browser and only used to call OpenRouter.",
  modelLabel: "Model",
  modelHint: "Search and pick from 500+ OpenRouter models. Custom model names are allowed.",
  behaviorCardTitle: "AI behavior",
  behaviorCardDescription: "Adjust how the AI reasons and answers in the popup.",
  thinkingTitle: "Enable AI reasoning mode",
  thinkingDescription: "Lets supporting models reason before answering. Reasoning is collapsed by default in the popup.",
  reasoningEffortTitle: "Reasoning effort",
  reasoningEffortDescription: "Choose the reasoning level when no exact reasoning budget is set.",
  reasoningBudgetLabel: "Reasoning budget",
  reasoningBudgetPlaceholder: "Automatic",
  reasoningBudgetHint: "Leave empty to use the effort level. Range: 1024–8192 tokens.",
  maxTokensLabel: "Max output tokens",
  maxTokensHint: "Caps the total Ask AI output. Range: 512–8192 tokens.",
  systemPromptLabel: "System Prompt",
  resetSystemPrompt: "Restore default",
  systemPromptHint: "The System Prompt controls the AI tab's language and answer style. When the dictionary has no data, this prompt also shapes the JSON translation used by the Dictionary tab.",
  vocabularySearchPlaceholder: "Search your vocabulary…",
  vocabularyFavoritesFilter: "Favorites",
  vocabularyCountSuffix: "items",
  vocabularyExportCsv: "Export CSV",
  vocabularyExportAnki: "Export Anki",
  vocabularyClearAll: "Delete all",
  vocabularyClearedToast: "Vocabulary cleared",
  vocabularyEmptyAll: "No saved words yet. Look up words on the web and star them to save them here.",
  vocabularyEmptyFiltered: "No items match the filter.",
  vocabularyFavoriteAddAria: "Mark as favorite",
  vocabularyFavoriteRemoveAria: "Remove favorite",
  vocabularyRemoveAriaPrefix: "Delete",
  aboutTitle: "About",
  aboutVersionPrefix: "ExtentionTranslate version",
  aboutSourcesLead: "English dictionary data uses",
  aboutSourcesTail: "(CC BY-SA 4.0) as the fallback source.",
  aboutPrivacy: "Your OpenRouter API key is stored locally in the browser and only used to call OpenRouter.",
  aboutBrowserSupport: "The extension supports Google Chrome and Microsoft Edge.",
  aboutDocsLink: "View dictionaryapi.dev documentation",
};
```

Create `src/settings/locales/zh-CN.ts` (`export const zhCN: SettingsCopy`):

```ts
import type { SettingsCopy } from "./types";

export const zhCN: SettingsCopy = {
  navOverviewTitle: "总览",
  navOverviewDescription: "快速查看扩展状态。",
  navPopupTitle: "弹窗与词典",
  navPopupDescription: "调整划词查询行为。",
  navOpenRouterTitle: "OpenRouter AI",
  navOpenRouterDescription: "管理 AI、模型与回答指令。",
  navVocabularyTitle: "词汇本",
  navVocabularyDescription: "已查询的词、收藏与数据导出。",
  navAboutTitle: "关于",
  navAboutDescription: "数据来源、隐私与支持。",
  sidebarNavLabel: "设置导航",
  sidebarSubtitle: "扩展设置",
  sidebarVersionPrefix: "版本",
  breadcrumbRoot: "设置",
  loading: "加载中…",
  saveBarDirty: "你有未保存的更改。",
  saveBarSaving: "正在保存更改…",
  saveBarError: "无法保存，请重试。",
  discard: "放弃更改",
  save: "保存更改",
  saving: "保存中…",
  savedToast: "设置已保存",
  saveFailedToast: "无法保存设置",
  contactError: "无法连接到扩展。",
  unacknowledgedError: "扩展未确认该请求。",
  sendError: "无法向扩展发送请求。",
  overviewHeading: "总览",
  overviewIntro: "ExtentionTranslate 让你在浏览网页时即时查询英语释义并获得 AI 解释。以下是扩展的当前状态。",
  statTriggerMode: "划词触发方式",
  statDisplayLanguage: "显示语言",
  statAutoAsk: "自动询问 AI",
  statAutoAskOnValue: "打开弹窗时启用",
  statAutoAskOffValue: "已关闭",
  statAutoAskOnBadge: "已启用",
  statAutoAskOffBadge: "已关闭",
  statApiKey: "OpenRouter API 密钥",
  statApiKeyConfigured: "已配置",
  statApiKeyMissing: "未配置",
  statApiKeyReadyBadge: "就绪",
  statApiKeySetupBadge: "需要配置",
  quickLinksTitle: "前往设置区域",
  quickLinksDescription: "选择你想调整的区域。",
  popupHeading: "弹窗与词典",
  selectionCardTitle: "选中文本时",
  selectionCardDescription: "选择选中单词或短语后扩展的响应方式。",
  triggerIconLabel: "在选区旁显示图标",
  triggerIconDescription: "需要查看释义时点击图标打开弹窗。",
  triggerPopupLabel: "选中后立即打开弹窗",
  triggerPopupDescription: "选区确认后立即查询。",
  triggerOffLabel: "关闭划词操作",
  triggerOffDescription: "网站上不显示图标或弹窗。",
  themeCardTitle: "外观与语言",
  themeCardDescription: "为弹窗和设置页选择浅色或深色主题，并选择结果显示语言。",
  themeAutoLabel: "自动（跟随系统）",
  themeAutoDescription: "跟随设备的明暗模式。",
  themeLightLabel: "浅色",
  themeLightDescription: "始终使用浅色背景。",
  themeDarkLabel: "深色",
  themeDarkDescription: "始终使用深色背景。",
  languageTitle: "显示语言",
  languageDescription: "词典标签页的结果来自 dictionaryapi.dev，优先在 Chrome/Edge 本地翻译；不可用时先尝试 FreeDictionaryAPI.com，最后才是 OpenRouter。",
  languagePlaceholder: "选择语言",
  aiCardTitle: "弹窗中的 AI",
  aiCardDescription: "调整查词时 AI 标签页的行为。",
  autoAskTitle: "打开弹窗时自动询问 AI",
  autoAskDescription: "配置了 OpenRouter API 密钥后，每个新弹窗会询问一次 AI。默认关闭以避免意外费用。",
  contextTitle: "向 AI 发送周围上下文",
  contextDescription: "开启后，AI 会收到完整句子及选区前后的文本。关闭后，AI 只收到所选内容。",
  previewTitle: "弹窗预览",
  previewDescription: "预览按你在上方选择的语言显示。",
  openrouterHeading: "OpenRouter AI",
  connectionCardTitle: "连接 OpenRouter",
  connectionCardDescriptionLead: "配置“询问 AI”功能。在此获取 API 密钥：",
  apiKeyLabel: "OpenRouter API 密钥",
  apiKeyPlaceholder: "sk-or-v1-...",
  showKeyAria: "显示 API 密钥",
  hideKeyAria: "隐藏 API 密钥",
  clearKey: "清除密钥",
  checkKey: "验证密钥",
  checkingKey: "验证中…",
  keyCheckOk: "密钥有效——{count} 个模型可用。",
  keyCheckFailed: "密钥无效或无法连接 OpenRouter。",
  keyCheckError: "无法验证密钥，请重试。",
  apiKeyNote: "API 密钥仅保存在浏览器本地，只用于调用 OpenRouter。",
  modelLabel: "模型",
  modelHint: "从 500 多个 OpenRouter 模型中搜索选择，也可以输入自定义模型。",
  behaviorCardTitle: "AI 行为",
  behaviorCardDescription: "调整 AI 在弹窗中的推理与回答方式。",
  thinkingTitle: "启用 AI 推理模式",
  thinkingDescription: "允许支持的模型在回答前先推理。推理内容在弹窗中默认折叠。",
  reasoningEffortTitle: "推理强度",
  reasoningEffortDescription: "未填写精确推理预算时使用的推理级别。",
  reasoningBudgetLabel: "推理预算",
  reasoningBudgetPlaceholder: "自动",
  reasoningBudgetHint: "留空则使用推理强度。范围：1024–8192 token。",
  maxTokensLabel: "最大输出 token",
  maxTokensHint: "限制“询问 AI”的总输出。范围：512–8192 token。",
  systemPromptLabel: "系统提示词",
  resetSystemPrompt: "恢复默认",
  systemPromptHint: "系统提示词控制弹窗 AI 标签页的语言和回答方式。词典无数据时，该提示词还决定词典标签页使用的 JSON 翻译格式。",
  vocabularySearchPlaceholder: "搜索词汇本…",
  vocabularyFavoritesFilter: "收藏",
  vocabularyCountSuffix: "项",
  vocabularyExportCsv: "导出 CSV",
  vocabularyExportAnki: "导出 Anki",
  vocabularyClearAll: "全部删除",
  vocabularyClearedToast: "已清空词汇本",
  vocabularyEmptyAll: "还没有保存的单词。在网页上查词并加星即可保存到这里。",
  vocabularyEmptyFiltered: "没有符合筛选条件的条目。",
  vocabularyFavoriteAddAria: "标记为收藏",
  vocabularyFavoriteRemoveAria: "取消收藏",
  vocabularyRemoveAriaPrefix: "删除",
  aboutTitle: "关于",
  aboutVersionPrefix: "ExtentionTranslate 版本",
  aboutSourcesLead: "英语词典数据使用",
  aboutSourcesTail: "（CC BY-SA 4.0）作为备用来源。",
  aboutPrivacy: "你的 OpenRouter API 密钥仅保存在浏览器本地，只用于调用 OpenRouter。",
  aboutBrowserSupport: "本扩展支持 Google Chrome 和 Microsoft Edge。",
  aboutDocsLink: "查看 dictionaryapi.dev 文档",
};
```

Create `src/settings/locales/index.ts`:

```ts
import type { TargetLanguage } from "@/shared/types";
import type { SettingsCopy } from "./types";
import { en } from "./en";
import { vi } from "./vi";
import { zhCN } from "./zh-CN";

export type { SettingsCopy } from "./types";

export const SETTINGS_LOCALES: Record<TargetLanguage, SettingsCopy> = {
  en,
  vi,
  "zh-CN": zhCN,
};

export function getSettingsCopy(language: TargetLanguage): SettingsCopy {
  return SETTINGS_LOCALES[language] ?? SETTINGS_LOCALES.en;
}
```

- [ ] **Step 4: Migrate settings components**

In every file below, add `import { getSettingsCopy } from "../locales";` (sections use `"../locales"`; `App.tsx`, `SettingsSidebar.tsx`, `navigation.ts` use `"./locales"`), derive `const copy = getSettingsCopy(settings.targetLanguage)`, and swap each hardcoded string for its key. Component structure, classes, and behavior stay identical — only string sources change.

`src/settings/navigation.ts`: replace the static `SETTINGS_NAVIGATION` array with a function that builds it from copy (icons stay in this file):

```ts
import { BookMarked, BookText, Info, LayoutDashboard, Sparkles, type LucideIcon } from "lucide-react";
import type { SettingsCopy } from "./locales";

export type SettingsSectionId = "overview" | "popup" | "openrouter" | "vocabulary" | "about";

export interface SettingsNavigationItem {
  id: SettingsSectionId;
  icon: LucideIcon;
  title: string;
  description: string;
}

export function getSettingsNavigation(copy: SettingsCopy): SettingsNavigationItem[] {
  return [
    { id: "overview", icon: LayoutDashboard, title: copy.navOverviewTitle, description: copy.navOverviewDescription },
    { id: "popup", icon: BookText, title: copy.navPopupTitle, description: copy.navPopupDescription },
    { id: "openrouter", icon: Sparkles, title: copy.navOpenRouterTitle, description: copy.navOpenRouterDescription },
    { id: "vocabulary", icon: BookMarked, title: copy.navVocabularyTitle, description: copy.navVocabularyDescription },
    { id: "about", icon: Info, title: copy.navAboutTitle, description: copy.navAboutDescription },
  ];
}
```

`src/settings/SettingsSidebar.tsx`: add a `targetLanguage: TargetLanguage` prop (import the type), compute `copy` and `const navigation = getSettingsNavigation(copy)`. Replace: both `aria-label="Điều hướng cài đặt"` → `copy.sidebarNavLabel`; `"Cài đặt tiện ích"` → `copy.sidebarSubtitle`; `` `Phiên bản ${version}` `` → `` `${copy.sidebarVersionPrefix} ${version}` ``. `NavigationItems` receives `navigation` via prop instead of importing `SETTINGS_NAVIGATION`.

`src/settings/App.tsx`: `settings` state already carries `targetLanguage`; compute `copy` and `navigation = getSettingsNavigation(copy)`. Replace: `"Cài đặt"` breadcrumb → `copy.breadcrumbRoot`; `"Đang tải…"` → `copy.loading`; save-bar strings → `copy.saveBarDirty/saveBarSaving/saveBarError`; `"Hủy thay đổi"` → `copy.discard`; `"Lưu thay đổi"`/`"Đang lưu…"` → `copy.save`/`copy.saving`; toasts → `copy.savedToast`/`copy.saveFailedToast`; the three `sendMessage` error literals → `copy.contactError`/`copy.unacknowledgedError`/`copy.sendError`. Use `navigation` for `activeNavigation` lookup and pass `targetLanguage={settings.targetLanguage}` to `SettingsSidebar` and `VocabularySection`.

`src/settings/sections/OverviewSection.tsx`: replace the `SETTINGS_NAVIGATION` import with `getSettingsNavigation` + `getSettingsCopy`; `const quickLinks = getSettingsNavigation(copy).filter((item) => item.id !== "overview");`. Map every literal to its key (`overviewHeading`, `overviewIntro`, the four `stat*` labels/values/badges, `quickLinksTitle`, `quickLinksDescription`).

`src/settings/sections/PopupDictionarySection.tsx`: move `TRIGGER_OPTIONS`/`THEME_OPTIONS` inside the component (they now depend on `copy`) and map each label/description to its key (`triggerIconLabel` … `themeDarkDescription`). Replace card titles/descriptions, `languageTitle`/`languageDescription`/`languagePlaceholder`, `autoAskTitle`/`autoAskDescription`, `contextTitle`/`contextDescription`, `previewTitle`/`previewDescription`, and the sr-only heading.

`src/settings/sections/OpenRouterSection.tsx`: map all literals to keys; the key-check success message becomes `copy.keyCheckOk.replace("{count}", String(count))`.

`src/settings/sections/AboutSection.tsx`: add a `targetLanguage: TargetLanguage` prop; map `aboutTitle`, `` `${copy.aboutVersionPrefix} ${getExtensionVersion()}.` ``, `aboutPrivacy`, `aboutBrowserSupport`, `aboutDocsLink`. The sources row keeps its two `<a>` links between `copy.aboutSourcesLead` and `copy.aboutSourcesTail`.

`src/settings/sections/VocabularySection.tsx` (created in Task 16): add a `targetLanguage: TargetLanguage` prop and map its literals to the `vocabulary*` keys; the count line becomes `` `${visible.length} ${copy.vocabularyCountSuffix}` `` and the remove aria-label `` `${copy.vocabularyRemoveAriaPrefix} ${record.word}` ``.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-settings-i18n.mjs`
Expected: PASS

- [ ] **Step 6: Full settings regression + type-check**

Run: `npx tsc --noEmit && node --experimental-strip-types scripts/test-settings-layout.mjs && node --experimental-strip-types scripts/test-settings-persistence.mjs && node --experimental-strip-types scripts/test-settings-language.mjs`

`test-settings-layout.mjs` asserts Vietnamese literals that now live in the locale files — update those assertions (this belongs to this task):

- Line 52 `assert.match(sidebarSource, /Phiên bản/);` → `assert.match(sidebarSource, /sidebarVersionPrefix/);`
- Line 54 `assert.match(overviewSource, /Tổng quan/);` → `assert.match(overviewSource, /overviewHeading/);`
- Line 69 `SETTINGS_NAVIGATION.filter(...)` → `assert.match(overviewSource, /getSettingsNavigation\(copy\)\.filter\(\(item\) => item\.id !== "overview"\)/);`
- Line 72 `assert.match(popupSource, /Khi bôi đen văn bản/);` → `assert.match(popupSource, /selectionCardTitle/);`
- Line 76 `assert.match(popupSource, /Gửi ngữ cảnh xung quanh cho AI/);` → `assert.match(popupSource, /contextTitle/);`

If `test-settings-persistence.mjs` or `test-settings-language.mjs` assert any of the migrated literals, apply the same treatment (assert the locale key usage instead).

- [ ] **Step 7: Register npm script and commit**

Add to `package.json` `"scripts"`:

```json
"test:settings-i18n": "node --experimental-strip-types scripts/test-settings-i18n.mjs",
```

```bash
git add src/settings scripts/test-settings-i18n.mjs package.json
git commit -m "feat: localize settings page with en/vi/zh-CN locale files"
```

---

# Final verification

- [ ] **Full test sweep**

Run every test script:

```bash
npx tsc --noEmit
npm run build
```

then run all `test:*` scripts in `package.json` (each must PASS). On Windows Git Bash, iterate them via:

```bash
node -e "const p=require('./package.json');const {execSync}=require('child_process');for(const [name,cmd] of Object.entries(p.scripts)){if(name.startsWith('test:')){console.log(name);execSync(cmd,{stdio:'inherit'});}}"
```

- [ ] **Manual smoke checklist (load `dist/` unpacked in Chrome/Edge)**

1. Select a word → icon appears instantly (no settings round-trip delay); popup opens with dictionary source fast (parallel race + prefetch).
2. Select the same word twice quickly → only one network round (DevTools network panel).
3. AI tab streams smoothly; follow-up input appears after the answer; a second question keeps the first exchange visible; Stop still works.
4. Right-click a selection → both context-menu entries work.
5. Alt+click a selection opens the popup even in "off" mode; Ctrl+Shift+Y toggles.
6. Translation panel: copy and read-aloud buttons work for original + translation.
7. Star a word in the popup → appears in Settings → Sổ từ vựng; favorite persists; CSV and Anki exports download.
8. Settings page renders fully in vi/en/zh-CN when switching the display language; save/discard unchanged.
9. Popup entrance animation plays; skeletons shimmer; no animation with OS "reduce motion" on.
10. Translating banner shows spinner; dictionary tab dot pulses while translating; switching tabs keeps it visible.
