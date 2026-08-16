# Hybrid Dictionary Popup Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `dictionaryapi.dev` as the Dictionary tab source, add schema-safe English/Vietnamese/Simplified-Chinese translation for that tab, stream the independent OpenRouter tab, make pronunciation playback real, and keep the popup usable at viewport edges and browser zoom.

**Architecture:** The background service worker remains the only owner of OpenRouter credentials and network calls. Dictionary source lookup returns immediately; an optional translation pass returns a normalized `DictionaryEntry` with source audio/phonetics preserved. AI explanation uses a long-lived `chrome.runtime.Port` and OpenRouter SSE events. The content script owns tab state, audio playback, and measured popup placement.

**Tech Stack:** TypeScript, React 18, Chrome MV3 runtime messaging/ports, OpenRouter SSE, Vite, Tailwind/shadcn primitives, Node 24 strip-types unit scripts, Chromium CDP smoke tests.

## Global Constraints

- `dictionaryapi.dev` remains the source for the first tab's English dictionary entry.
- Supported dictionary target languages are exactly `en`, `vi`, and `zh-CN`.
- The OpenRouter explanation tab receives the configured system prompt without injecting `targetLanguage`.
- Translation failure falls back to the English dictionary entry instead of blanking the popup.
- The OpenRouter API key remains in the background service worker and is never sent to the content script.
- Popup content is rendered in the existing closed Shadow DOM and must not depend on host-page CSS.
- No new runtime dependency is added unless the current code cannot implement the required behavior.

### Task 1: Lock language and dictionary translation contracts

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Create: `src/services/dictionary/translation.ts`
- Create: `scripts/test-dictionary-translation.mjs`
- Modify: `package.json`

**Interfaces:**
- `TargetLanguage = "en" | "vi" | "zh-CN"`.
- `TranslationStatus = "source" | "translated" | "fallback"`.
- `translateDictionaryEntry(entry, targetLanguage, translate)` returns a normalized entry while preserving `word`, `phonetics`, and audio URLs.
- `normalizeTranslatedEntry(raw, sourceEntry, targetLanguage)` rejects malformed JSON and fills safe source fallbacks.

- [x] **Step 1: Write failing tests** for the three language values, preservation of audio/phonetics, rejection of malformed translation fields, and fallback to the source entry.
- [x] **Step 2: Run `npm run test:dictionary-translation` and confirm the expected RED failure.**
- [x] **Step 3: Implement the type contract and pure normalization helper.**
- [x] **Step 4: Add a script entry and run the test until GREEN.**

### Task 2: Add OpenRouter SSE parsing and structured translation request

**Files:**
- Modify: `src/services/openrouter/client.ts`
- Create: `src/services/openrouter/sse.ts`
- Modify: `src/shared/types.ts`
- Create: `scripts/test-openrouter-stream.mjs`
- Modify: `package.json`

**Interfaces:**
- `parseOpenRouterSSE(buffer)` yields `{ text, done }` events from `data:` frames and tolerates split frames across reads.
- `streamOpenRouter(config, req, onChunk)` reads `response.body`, parses `choices[0].delta.content`, and returns `{ raw, structured }` after `[DONE]`.
- `translateDictionaryEntryWithOpenRouter(config, sourceEntry, targetLanguage)` uses a fixed JSON-schema translation wrapper and returns the normalized dictionary entry.
- `callOpenRouter` remains available for non-streaming model calls only where needed by the existing settings/model flow.

- [x] **Step 1: Write a local SSE fixture test** covering split chunks, `[DONE]`, empty deltas, malformed frames, and final JSON parsing.
- [x] **Step 2: Run the test and confirm RED because the parser/stream function is absent.**
- [x] **Step 3: Implement the parser and streaming fetch with `stream: true`, preserving existing error-code mapping.**
- [x] **Step 4: Implement the translation prompt wrapper; pass the selected target language only to this translation request.**
- [x] **Step 5: Run the local stream test until GREEN.**

### Task 3: Wire background lookup, translation fallback, and AI streaming ports

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/types.ts`
- Create: `scripts/test-background-stream-contract.mjs`

**Interfaces:**
- Dictionary lookup fetches and caches the English source entry first, then translates only when `targetLanguage` is `vi` or `zh-CN` and a key is configured.
- `chrome.runtime.onConnect` accepts a named `ai-explain-stream` port and sends `AIStreamEvent` values.
- Stream requests are invalidated by request id and stop work when the port disconnects.

- [x] **Step 1: Add contract tests for `en` source behavior, translated behavior, missing-key fallback, and stream event ordering.**
- [x] **Step 2: Run the contract test and confirm RED.**
- [x] **Step 3: Update lookup handling to read settings, preserve source cache semantics, and return `translationStatus`.**
- [x] **Step 4: Add the port listener, stream cancellation, and structured final event.**
- [x] **Step 5: Run the contract test and confirm GREEN.**

### Task 4: Replace the stacked popup with accessible tabs and live stream rendering

**Files:**
- Create: `src/components/dictionary/PopupTabs.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Modify: `src/components/dictionary/AISection.tsx`
- Modify: `src/content/index.tsx`
- Modify: `src/components/dictionary/MeaningSection.tsx`

**Interfaces:**
- `PopupTabs` exposes `activeTab: "dictionary" | "ai"`, accessible `role="tablist"`, and tab panels.
- Dictionary content receives `translationStatus` and shows a small fallback/source indicator without changing the source entry layout.
- AI state contains `streamText`, `structured`, `loading`, and `error`; every chunk re-renders the active AI panel.

- [x] **Step 1: Add component-level behavior checks through the content smoke harness** for two tabs, no AI section below Dictionary, and tab switching preserving state.
- [x] **Step 2: Run the harness and confirm RED against the current stacked layout.**
- [x] **Step 3: Implement the tab bar and move AI content into the AI tab.**
- [x] **Step 4: Connect `chrome.runtime.connect` in the content script, render chunks immediately, parse final JSON, and disconnect on close/stale selection.**
- [x] **Step 5: Run the harness and confirm GREEN, including no TooltipProvider/runtime errors.**

### Task 5: Make pronunciation playback reliable in the real browser

**Files:**
- Modify: `src/services/dictionary/pronunciation.ts`
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Modify: `scripts/test-pronunciation.mjs`
- Modify: `scripts/test-content-script.mjs`

**Interfaces:**
- `preparePronunciation(url)` preloads a reusable audio element when source data arrives.
- `playPreparedPronunciation(url)` resets and plays on the trusted click event, stopping the previous audio.
- Errors remove failed resources and produce one user-facing toast.

- [x] **Step 1: Add a real URL smoke fixture and assert preload, `src`, `readyState`, and `play()` lifecycle.**
- [x] **Step 2: Run the test and confirm RED against click-only creation.**
- [x] **Step 3: Implement preload/reuse and explicit promise/error handling.**
- [x] **Step 4: Run unit and Chromium audio lifecycle checks; record any browser limitation separately from code failures.**

### Task 6: Implement viewport/zoom-aware side placement

**Files:**
- Modify: `src/content/positioning.ts`
- Modify: `src/content/index.tsx`
- Modify: `src/content/shadowRoot.ts`
- Modify: `src/styles/popup.css`
- Modify: `scripts/test-content-script.mjs`

**Interfaces:**
- `computePopupPosition(selectionRect, popupRect, viewport)` chooses right, left, below, or above using measured dimensions and returns clamped coordinates.
- Placement reads `visualViewport` width/height/offset when available and falls back to `window.innerWidth/innerHeight`.
- The popup uses `max-width: min(560px, calc(100vw - 24px))` and `max-height: min(680px, calc(100vh - 24px))`.

- [x] **Step 1: Write positioning tests for right/left fallback, narrow viewport, above/below fallback, scroll offset, and zoom-scaled viewport.**
- [x] **Step 2: Run tests and confirm RED against the current fixed-width below/above algorithm.**
- [x] **Step 3: Implement measured placement and visualViewport listeners.**
- [x] **Step 4: Run the positioning tests and Chromium smoke test at 100%, 125%, and 150% emulation.**

### Task 7: Update Settings and build artifact verification

**Files:**
- Modify: `src/settings/App.tsx`
- Modify: `src/shared/types.ts`
- Modify: `public/manifest.json`
- Modify: `README.md`
- Modify: `scripts/test-content-script.mjs`

- [x] **Step 1: Add a settings smoke assertion for exactly English, Tiếng Việt, and 简体中文, and for the revised help text.**
- [x] **Step 2: Implement the settings copy/value update and ensure saved settings propagate live to content tabs.**
- [x] **Step 3: Run `npm run build` and inspect `dist/manifest.json`, `dist/background.js`, and `dist/content.js` for the new runtime contracts.**
- [x] **Step 4: Run all unit scripts and the Chromium smoke suite against the fresh `dist/`.**

### Task 8: Final requirement audit

- [x] **Step 1: Verify dictionary source remains `dictionaryapi.dev` and English fallback is visible when translation fails.**
- [x] **Step 2: Verify translation target values and that AI explanation does not receive `targetLanguage`.**
- [x] **Step 3: Verify AI chunks arrive incrementally and final JSON parsing is optional.**
- [x] **Step 4: Verify audio uses a real available URL and trusted click playback path.**
- [x] **Step 5: Verify tab layout, side placement, responsive limits, and zoom cases with fresh runtime evidence.**
- [x] **Step 6: Report only claims supported by the fresh commands and artifact checks.**
