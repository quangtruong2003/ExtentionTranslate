# Adaptive Selection Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep single-word selections on the existing dictionary flow while translating every phrase, sentence, or paragraph in full with the Chrome/Edge browser Translator API.

**Architecture:** A pure selection classifier decides between `word` and `text` before any background lookup. Word selections retain the current dictionary pipeline; text selections use a generalized browser-translator session cache and render a dedicated translation panel through new discriminated popup phases.

**Tech Stack:** React 18, TypeScript, Chrome MV3 content scripts, browser `Translator` API, Vite, Node contract/unit tests, Chromium content-script smoke test.

## Global Constraints

- Work in the current source checkout; do not create a worktree.
- One Unicode lexical token uses Dictionary; every other non-empty selection uses Translation.
- Preserve internal apostrophes and hyphens for dictionary words.
- Preserve source line breaks for sentence/paragraph display and translation.
- Bound selected content at exactly 2,000 characters.
- Browser Translator runs before any remote AI behavior and must be feature-detected.
- Never degrade a failed sentence translation into a single-word dictionary result.
- Do not silently send raw selected text to OpenRouter as a translation fallback.
- Preserve OpenRouter tab behavior, Auto Ask, trigger modes, popup positioning, cleanup, and the existing word dictionary fallback chain.
- Target languages remain `en`, `vi`, and `zh-CN`; browser language codes are `en`, `vi`, and `zh`.

---

### Task 1: Classify and normalize selected content

**Files:**
- Create: `src/content/selectionMode.ts`
- Create: `scripts/test-selection-mode.mjs`
- Modify: `src/shared/constants.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `SelectionMode`, `classifySelection(rawText: string): SelectionMode`, and `normalizeBrowserSourceLanguage(pageLanguage?: string): "en" | "vi" | "zh" | undefined`.
- Consumes: no React, Chrome, or network APIs; this module remains deterministic and directly testable.

- [ ] **Step 1: Write and register the failing classifier test**

  Add cases for `Uranium`, `don't`, `state-of-the-art`, `run.`, `run away`, a full sentence, a multiline paragraph, a URL, a number with symbols, repeated spaces, and `en-US` / `vi-VN` / `zh-CN` page-language normalization. Assert `MAX_SELECTION_LENGTH === 2000`. Register:

  ```json
  "test:selection-mode": "node --experimental-strip-types scripts/test-selection-mode.mjs"
  ```

- [ ] **Step 2: Run the classifier test and verify it fails**

  Run: `npm run test:selection-mode`

  Expected: FAIL because the script and exports do not exist.

- [ ] **Step 3: Implement the pure classifier**

  Use this public contract:

  ```ts
  export type BrowserSourceLanguage = "en" | "vi" | "zh";

  export type SelectionMode =
    | { kind: "word"; sourceText: string; lookupText: string }
    | { kind: "text"; sourceText: string };

  export function classifySelection(rawText: string): SelectionMode;
  export function normalizeBrowserSourceLanguage(pageLanguage?: string): BrowserSourceLanguage | undefined;
  ```

  Normalize CRLF to LF, collapse horizontal whitespace, preserve line breaks, trim surrounding whitespace, and strip surrounding Unicode punctuation/symbols only from the candidate lookup key. Accept internal apostrophes and Unicode hyphen variants in a word.

- [ ] **Step 4: Increase the bounded paragraph limit**

  Set:

  ```ts
  export const MAX_SELECTION_LENGTH = 2000;
  ```

- [ ] **Step 5: Run the classifier test**

  Run: `npm run test:selection-mode`

  Expected: PASS for every classification, normalization, and limit case.

### Task 2: Generalize browser Translator sessions and add raw-text translation

**Files:**
- Modify: `src/services/dictionary/browserTranslator.ts`
- Modify: `scripts/test-browser-translator.mjs`

**Interfaces:**
- Consumes: `BrowserSourceLanguage` from `src/content/selectionMode.ts` and existing `TargetLanguage`.
- Produces: `translateText(input: string, sourceLanguage: "en" | "vi" | "zh", targetLanguage: "en" | "vi" | "zh", signal?: AbortSignal): Promise<string | null>` on `BrowserDictionaryTranslator`.
- Preserves: existing `warm(targetLanguage)` and `translate(DictionaryEntry, targetLanguage, signal)` behavior for English dictionary entries.

- [ ] **Step 1: Add failing raw-text and session-key tests**

  Assert that raw text is translated intact, `en->vi` and `vi->en` create separate sessions, concurrent calls for one pair share one creation promise, empty output returns `null` and drops the failed session, abort returns `null`, same-language input returns trimmed source without creating a session, and `destroy()` closes all source/target sessions.

- [ ] **Step 2: Run the browser translator test and verify it fails**

  Run: `npm run test:browser-translator`

  Expected: FAIL because `translateText()` and generalized source/target sessions are absent.

- [ ] **Step 3: Generalize the factory and cache key**

  Update `BrowserTranslatorFactory` to accept `sourceLanguage` and `targetLanguage` values from `"en" | "vi" | "zh"`. Key `sessionPromises` and `sessions` with `${sourceLanguage}->${targetLanguage}` rather than target language alone.

- [ ] **Step 4: Implement raw-text translation**

  Add:

  ```ts
  async translateText(
    input: string,
    sourceLanguage: BrowserLanguage,
    targetLanguage: BrowserLanguage,
    signal?: AbortSignal,
  ): Promise<string | null>
  ```

  Return trimmed source immediately for the same language. Otherwise acquire the pair session, call the existing non-empty translation guard, and drop the pair session on a non-abort failure.

- [ ] **Step 5: Preserve dictionary translation through `en` source sessions**

  Keep `warm("vi" | "zh-CN")` and dictionary `translate()` mapped to `en->vi` or `en->zh` pairs. Run existing dictionary-entry assertions unchanged.

- [ ] **Step 6: Run the browser translator test**

  Run: `npm run test:browser-translator`

  Expected: PASS for existing dictionary behavior and the new raw-text cases.

### Task 3: Add the adaptive Translation panel UX

**Files:**
- Create: `src/components/dictionary/TextTranslationPanel.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `src/components/dictionary/PopupTabs.tsx`
- Modify: `src/components/dictionary/copy.ts`
- Create: `scripts/test-text-translation-ui.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces these additional `PopupPhase` members:

  ```ts
  | { kind: "translation-loading"; sourceText: string }
  | { kind: "translation-ready"; sourceText: string; translatedText: string; provider: "browser" | "source" }
  | { kind: "translation-error"; sourceText: string; code: "TRANSLATOR_UNAVAILABLE" | "TRANSLATION_FAILED" }
  ```

- `TextTranslationPanel` consumes a translation phase, `targetLanguage`, `hasApiKey`, `onRetry`, and `onAskAI`.
- `PopupTabs` accepts optional `primaryLabel`; omission keeps the current dictionary label.

- [ ] **Step 1: Write and register the failing UI contract test**

  Verify the new popup phases, dynamic first-tab label, absence of `DictionaryHeader` for translation phases, source and target copy buttons, preserved whitespace, localized loading/error copy in English/Vietnamese/Chinese, browser badge, retry action, and conditional OpenRouter action. Register:

  ```json
  "test:text-translation-ui": "node scripts/test-text-translation-ui.mjs"
  ```

- [ ] **Step 2: Run the UI contract test and verify it fails**

  Run: `npm run test:text-translation-ui`

  Expected: FAIL because the panel, phases, and localized strings do not exist.

- [ ] **Step 3: Add localized adaptive copy**

  Extend `PopupCopy` with `translationTab`, `originalText`, `translatedText`, `browserTranslationBadge`, `translationPreparing`, `translatorUnavailable`, `translationFailed`, `copyOriginal`, and `copyTranslation` for all three target languages.

- [ ] **Step 4: Implement `TextTranslationPanel`**

  Render the complete source text immediately. For loading, show a compact status row and target skeleton. For ready, render the translated text as the visually primary card and expose separate copy buttons. For error, keep source visible and show Retry plus Ask AI only when an API key is configured. Use `whitespace-pre-wrap`, `break-words`, and `min-w-0` to prevent long-line popup expansion.

- [ ] **Step 5: Route adaptive phases in `DictionaryPopup`**

  Render `DictionaryHeader` and `MeaningSection` only for `{ kind: "ready" }`. Pass `labels.translationTab` as the first-tab label for translation phases and render `TextTranslationPanel` in the first tab.

- [ ] **Step 6: Run popup tests**

  Run:

  ```powershell
  npm run test:text-translation-ui
  npm run test:popup-layout
  npm run test:popup-copy
  ```

  Expected: all PASS; existing dictionary and OpenRouter tab contracts remain valid.

### Task 4: Branch the content flow before dictionary lookup

**Files:**
- Modify: `src/content/index.tsx`
- Create: `scripts/test-adaptive-selection-flow.mjs`
- Modify: `scripts/test-content-script.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `classifySelection`, `normalizeBrowserSourceLanguage`, new translation `PopupPhase` values, and `BrowserDictionaryTranslator.translateText()`.
- Produces: `translateSelectedText(info: SelectionInfo, sourceText: string, requestId: number): Promise<void>`.

- [ ] **Step 1: Write and register the failing orchestration contract test**

  Assert that `openPopup()` classifies before sending `DICTIONARY_LOOKUP`, text mode returns before dictionary lookup, selected source text is passed intact to browser translation, word mode passes `lookupText` to dictionary lookup, request IDs and abort signals guard stale responses, target-language changes reopen the same adaptive mode, and Auto Ask remains independent of the first-tab mode. Register:

  ```json
  "test:adaptive-selection-flow": "node scripts/test-adaptive-selection-flow.mjs"
  ```

- [ ] **Step 2: Run the orchestration test and verify it fails**

  Run: `npm run test:adaptive-selection-flow`

  Expected: FAIL because `openPopup()` still sends every selection to `DICTIONARY_LOOKUP`.

- [ ] **Step 3: Initialize adaptive state in `openPopup()`**

  Classify `info.text` once. Set `state.word` to the normalized source text. For text mode, initialize `{ kind: "translation-loading", sourceText }`, keep `activeTab: "dictionary"`, run Auto Ask exactly as today, call `translateSelectedText()`, and return before `sendMessage(DICTIONARY_LOOKUP, ...)`.

- [ ] **Step 4: Preserve the word dictionary flow**

  For word mode, use `lookupText` in `DICTIONARY_LOOKUP` and keep `sourceDictionaryEntry`, dictionary translation, pronunciation, and remote fallbacks unchanged.

- [ ] **Step 5: Implement cancellable raw-text translation**

  Normalize the page language to `en`, `vi`, or `zh`, default to `en`, map the Settings target to the browser language, and reuse `translationController`. Same-language selections complete with provider `source`; successful browser output completes with provider `browser`; unavailable/empty/error outcomes enter an actionable translation error phase. Guard every mutation with `requestId === currentRequestId`, `!signal.aborted`, and active `state`.

- [ ] **Step 6: Extend the content smoke test**

  Keep the existing `run` word journey. Add a sentence journey that selects `Uranium is a radioactive material.`, asserts the full sentence is visible, asserts the adaptive Translation tab/panel is mounted, and asserts the dictionary-only UK/US pronunciation header is absent. The smoke test may accept a browser translation result or the explicit local-translator-unavailable state depending on the installed Chromium capability.

- [ ] **Step 7: Run content-flow verification**

  Run:

  ```powershell
  npm run test:adaptive-selection-flow
  npm run test:auto-ask
  npm run test:selection-trigger
  npm run test:content-script
  ```

  Expected: all PASS; sentence selection never renders a one-word dictionary card.

### Task 5: Regression and production build verification

**Files:**
- Modify: generated `dist/` only; it remains ignored by Git.

**Interfaces:**
- Consumes: all source changes from Tasks 1–4.
- Produces: a loadable Chrome/Edge MV3 extension at `D:\ExtentionTranslate\dist`.

- [ ] **Step 1: Run focused regression tests**

  Run all dictionary translation, browser translator, adaptive selection, popup, Auto Ask, trigger, Markdown/thinking, positioning, and pronunciation scripts defined in `package.json`.

  Expected: every script exits zero.

- [ ] **Step 2: Typecheck and build**

  Run: `npm run build`

  Expected: TypeScript and both Vite builds pass; the existing content chunk warning above 500 kB may remain non-blocking.

- [ ] **Step 3: Verify the built artifact**

  Confirm `dist/manifest.json`, `dist/content.js`, `dist/settings.html`, and project icons exist. Search `dist/content.js` for the adaptive translation copy and ensure the working tree contains no generated `dist/` changes.

- [ ] **Step 4: Final merged-source check**

  Run:

  ```powershell
  git diff --check
  git status -sb
  ```

  Expected: no whitespace errors and only intentional source/test/plan changes before commit.
