# Popup Reliability and Settings UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a dictionary-first, reliably pronounceable and stream-safe selection popup plus a responsive, extensible Settings shell for Chrome and Edge.

**Architecture:** Preserve the existing content/background/provider boundaries, but separate automatic AI execution from tab navigation, centralize dictionary presentation normalization, add browser speech as the terminal audio fallback, and make the SSE parser flush provider-specific final response shapes. Build Settings as a responsive shell with focused section components sharing one settings draft.

**Tech Stack:** React 18, TypeScript 5.6, Chrome MV3, Vite 5, Tailwind CSS, Radix UI, Lucide React, react-markdown, remark-gfm, Node strip-types regression scripts.

## Global Constraints

- Work directly in `D:\ExtentionTranslate`; do not create a worktree.
- The workspace has no `.git` metadata, so replace commit steps with a changed-file inventory and do not attempt to push.
- Preserve the provider order: `dictionaryapi.dev` → Chrome/Edge Translator → `FreeDictionaryAPI.com` → OpenRouter.
- Do not use OpenRouter to refine a successful browser translation.
- Preserve `react-markdown` plus `remark-gfm`; do not convert OpenRouter answers into a fixed JSON UI.
- Remove only the visible close button; Escape and outside-click dismissal must remain.
- Preserve all existing settings values and storage keys.
- Test source behavior first, then run the full suite, build, and inspect `dist` separately.

---

### Task 1: Dictionary-first popup navigation and balanced tabs

**Files:**
- Modify: `src/content/index.tsx`
- Modify: `src/components/dictionary/PopupTabs.tsx`
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `scripts/test-auto-ask.mjs`
- Create: `scripts/test-popup-layout.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `PopupState.activeTab`, `openPopup(info, shouldAutoAsk)`, and `PopupTab`.
- Produces: `handleAskAI(options?: { revealTab?: boolean }): Promise<void>`; auto ask passes `{ revealTab: false }`, deliberate Ask AI passes `{ revealTab: true }`.

- [ ] **Step 1: Update the auto-ask regression to require background execution without navigation**

```js
assert.match(openPopupSource, /handleAskAI\(\{ revealTab: false \}\)/);
assert.match(handleAskAISource, /if \(revealTab\) nextState\.activeTab = "ai"/);
assert.doesNotMatch(openPopupSource, /activeTab: "ai"/);
```

- [ ] **Step 2: Add a popup layout contract test**

```js
assert.match(tabsSource, /grid-cols-2/);
assert.match(tabsSource, /w-full/);
assert.doesNotMatch(headerSource, /\bX\b/);
assert.doesNotMatch(headerSource, /onClose/);
assert.match(popupSource, /max-w-\[min\(560px,calc\(100vw-24px\)\)\]/);
```

- [ ] **Step 3: Run both tests and verify the current code fails for the intended reasons**

Run: `npm run test:auto-ask && npm run test:popup-layout`

Expected: auto-ask fails because `handleAskAI()` always sets `activeTab: "ai"`; layout fails because tabs use flex/intrinsic widths and the header imports `X`.

- [ ] **Step 4: Separate request intent from navigation**

```ts
async function handleAskAI({ revealTab = true }: { revealTab?: boolean } = {}) {
  if (!state || !currentSelectionInfo) return;
  const nextState: Partial<PopupState> = {
    aiLoading: true,
    aiError: undefined,
    aiStreamText: "",
    aiThinkingText: "",
    aiThinkingEnabled: settings.openRouterThinkingEnabled,
    aiDone: true,
  };
  if (revealTab) nextState.activeTab = "ai";
  setState(nextState);
}
```

Wire automatic execution to `handleAskAI({ revealTab: false })`; wrap the popup’s deliberate `onAskAI` callback with `() => void handleAskAI({ revealTab: true })`.

- [ ] **Step 5: Make tab triggers equal and remove the close action**

Use `grid w-full grid-cols-2` for the tablist and `w-full justify-center` for triggers. Remove `X`, `onClose`, and close-tooltip JSX from `DictionaryHeader`; remove the now-unused prop only through `DictionaryPopup`, while keeping `PopupContainer`/content-script closure handlers for Escape and outside click.

- [ ] **Step 6: Run focused tests**

Run: `npm run test:auto-ask && npm run test:popup-layout && npm run test:positioning`

Expected: PASS.

---

### Task 2: Locale-aware translated dictionary presentation

**Files:**
- Create: `src/services/dictionary/presentation.ts`
- Modify: `src/services/dictionary/translationWorkflow.ts`
- Modify: `src/services/dictionary/translation.ts`
- Create: `scripts/test-dictionary-presentation.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeSentencePresentation(text: string, language: TargetLanguage): string` and `normalizeDictionaryPresentation(entry: DictionaryEntry, language: TargetLanguage): DictionaryEntry`.
- Consumes: translated entries from cache, browser Translator, FreeDictionaryAPI/OpenRouter remote fallback, and JSON normalization.

- [ ] **Step 1: Write presentation regression cases**

```js
assert.equal(normalizeSentencePresentation("  để bật ", "vi"), "Để bật.");
assert.equal(normalizeSentencePresentation("đến trạng thái hoạt động.", "vi"), "Đến trạng thái hoạt động.");
assert.equal(normalizeSentencePresentation("turn it on!", "en"), "Turn it on!");
assert.equal(normalizeSentencePresentation("快速移动", "zh-CN"), "快速移动。");
assert.equal(normalizeSentencePresentation("V2/V3", "vi"), "V2/V3");
```

Also assert that only `definition`, `translation`, and `examples` are sentence-normalized; `partOfSpeech`, `synonyms`, phrase labels, IPA, and the selected word remain unchanged.

- [ ] **Step 2: Run the new test and verify it fails because the module does not exist**

Run: `npm run test:dictionary-presentation`

Expected: FAIL with module-not-found for `presentation.ts`.

- [ ] **Step 3: Implement conservative presentation normalization**

```ts
const TERMINAL_PUNCTUATION = /[.!?。！？…]$/u;

export function normalizeSentencePresentation(text: string, language: TargetLanguage): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed || /^[A-Z0-9/+-]{2,}$/u.test(trimmed)) return trimmed;
  const cased = language === "zh-CN"
    ? trimmed
    : trimmed.replace(/^([\p{L}])/u, (letter) => letter.toLocaleUpperCase(language === "vi" ? "vi-VN" : "en-US"));
  return TERMINAL_PUNCTUATION.test(cased) ? cased : `${cased}${language === "zh-CN" ? "。" : "."}`;
}
```

Map immutable copies of meanings and normalize definition/translation/examples only.

- [ ] **Step 4: Apply normalization at every translated-entry boundary**

Normalize cached, browser, and remote translated results in `translationWorkflow.ts`, and normalize valid JSON output in `normalizeTranslatedEntry`. Do not normalize English source entries returned with `status: "source"` or `"fallback"`.

- [ ] **Step 5: Run focused translation tests**

Run: `npm run test:dictionary-presentation && npm run test:dictionary-translation && npm run test:browser-translator && npm run test:dictionary-translation-workflow && npm run test:dictionary-translation-cache`

Expected: PASS after updating exact expectations only where sentence presentation intentionally changes.

---

### Task 3: UK/US pronunciation with speech-synthesis fallback

**Files:**
- Modify: `src/services/dictionary/pronunciation.ts`
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Modify: `scripts/test-pronunciation.mjs`

**Interfaces:**
- Add: `export interface PronunciationSpeechFallback { text: string; lang: "en-GB" | "en-US" }`.
- Extend: `playPronunciationCandidates(urls, documentLike?, onError?, speechFallback?): Promise<void>`.
- Add: `speakPronunciation(fallback: PronunciationSpeechFallback, windowLike?: Window): Promise<void>`.

- [ ] **Step 1: Add failing tests for missing/broken recordings**

```js
await playPronunciationCandidates([], documentLike, onError, { text: "especially", lang: "en-GB" });
assert.equal(spoken.at(-1).text, "especially");
assert.equal(spoken.at(-1).lang, "en-GB");

await playPronunciationCandidates([brokenUrl], documentLike, onError, { text: "especially", lang: "en-US" });
assert.equal(spoken.at(-1).lang, "en-US");
assert.equal(errors, 0);
```

Mock `speechSynthesis.getVoices`, `cancel`, `speak`, and `SpeechSynthesisUtterance`; fire `onend` to resolve. Add a failure case where both audio and speech are unavailable and `onError` runs once.

- [ ] **Step 2: Run the pronunciation test and verify the fallback assertions fail**

Run: `npm run test:pronunciation`

Expected: FAIL because empty candidates return without speaking and no speech fallback parameter exists.

- [ ] **Step 3: Implement regional speech fallback**

```ts
const voices = synthesis.getVoices();
const voice = voices.find((item) => item.lang.toLowerCase() === fallback.lang.toLowerCase())
  ?? voices.find((item) => item.lang.toLowerCase().startsWith("en"));
const utterance = new SpeechSynthesisUtterance(fallback.text);
utterance.lang = fallback.lang;
if (voice) utterance.voice = voice;
synthesis.cancel();
synthesis.speak(utterance);
```

Resolve on `onstart` so long utterances do not block the click flow; reject on `onerror`. Track and cancel the active utterance in `stopPreparedPronunciations()`.

- [ ] **Step 4: Keep UK/US controls enabled for valid words**

Pass `{ text: entry.word, lang: "en-GB" }` from UK and `{ text: entry.word, lang: "en-US" }` from US. Build candidate lists with requested-region recording first and other-region recording second. Render a button whenever the corresponding phonetic row exists; do not disable it because the URL is absent.

- [ ] **Step 5: Run focused tests and build-time type checking**

Run: `npm run test:pronunciation && npx tsc --noEmit`

Expected: PASS.

---

### Task 4: Provider-compatible OpenRouter stream finalization

**Files:**
- Modify: `src/services/openrouter/sse.ts`
- Modify: `src/content/index.tsx`
- Modify: `src/components/dictionary/AISection.tsx`
- Modify: `scripts/test-openrouter-stream.mjs`
- Modify: `scripts/test-background-stream-contract.mjs`
- Modify: `scripts/test-thinking-ui.mjs`

**Interfaces:**
- Extend internal `OpenRouterChoice` with `message?: { content?: unknown }` and `text?: unknown`.
- Add: `consumeOpenRouterSSE(buffer, contentParser, options?: { flushRemainder?: boolean })`.
- Add `aiRequested: boolean` to local popup state and `requested: boolean` to `AISection` props.

- [ ] **Step 1: Add failing parser fixtures**

```js
const unterminated = new ReadableStream({ start(controller) {
  controller.enqueue(encoder.encode('data: {"choices":[{"message":{"content":"Final answer"}}]}'));
  controller.close();
}});
assert.equal((await consumeOpenRouterStream(unterminated, onChunk)).raw, "Final answer");
```

Add equivalent cases for `choices[0].text`, a closed stream without `[DONE]`, reasoning plus final answer, and partial answer followed by an error event.

- [ ] **Step 2: Run OpenRouter tests and verify final-frame cases fail with `EMPTY_RESPONSE`**

Run: `npm run test:openrouter-stream && npm run test:background-stream`

Expected: FAIL in the new final-frame/provider-shape assertions.

- [ ] **Step 3: Parse final response shapes and flush the SSE remainder**

Factor frame parsing into one internal function. On EOF, treat a non-empty remainder as one final frame even without `\n\n`. Extract content from `delta`, then `message.content`, then `choice.text`; keep reasoning extraction restricted to reasoning fields and tags.

```ts
if (done) {
  process(decoder.decode());
  processRemainder();
  for (const event of contentParser.flush()) apply(event);
}
```

Do not turn reasoning-only streams into answers; keep the existing `EMPTY_RESPONSE` contract.

- [ ] **Step 4: Make AI empty-state semantics explicit**

Initialize `aiRequested: false`; set it true when a request starts. Pass it to `AISection`. Render the neutral no-response message only when `!requested`; after a request, rely on loading, answer, or explicit error. Preserve `aiStreamText` when receiving an error so partial Markdown remains visible with a retry notice.

- [ ] **Step 5: Run stream, thinking, and Markdown regressions**

Run: `npm run test:openrouter-stream && npm run test:background-stream && npm run test:thinking-ui && npm run test:markdown`

Expected: PASS, including `react-markdown` and `remark-gfm` coverage.

---

### Task 5: Responsive Settings application shell

**Files:**
- Create: `src/settings/navigation.ts`
- Create: `src/settings/SettingsSidebar.tsx`
- Create: `src/settings/sections/OverviewSection.tsx`
- Create: `src/settings/sections/PopupDictionarySection.tsx`
- Create: `src/settings/sections/OpenRouterSection.tsx`
- Create: `src/settings/sections/AboutSection.tsx`
- Modify: `src/settings/App.tsx`
- Create: `scripts/test-settings-layout.mjs`
- Modify: `scripts/test-settings-language.mjs`
- Modify: `scripts/test-settings-thinking.mjs`
- Modify: `scripts/test-auto-ask.mjs`
- Modify: `package.json`

**Interfaces:**
- `type SettingsSectionId = "overview" | "popup" | "openrouter" | "about"`.
- `SettingsSidebar({ activeSection, onSelect })` renders desktop and compact navigation.
- Section components consume explicit values/callbacks; `App` remains the only owner of the complete `ExtensionSettings` draft, API key, model, prompt, and save state.

- [ ] **Step 1: Add a failing Settings shell contract test**

```js
assert.match(appSource, /SettingsSidebar/);
assert.match(appSource, /icons\/icon48\.png/);
assert.match(appSource, /sticky/);
assert.match(sidebarSource, /aria-current/);
for (const id of ["overview", "popup", "openrouter", "about"]) assert.match(navigationSource, new RegExp(id));
```

Retain existing assertions for `showPopupOnSelection`, `targetLanguage`, `autoAskAIOnPopup`, `openRouterThinkingEnabled`, API key, model, and System Prompt.

- [ ] **Step 2: Run Settings tests and verify the shell contract fails**

Run: `npm run test:settings-layout && npm run test:settings-language && npm run test:settings-thinking && npm run test:auto-ask`

Expected: FAIL because the current page is one stacked column with a generic BookOpen tile.

- [ ] **Step 3: Build the navigation and shell**

Use an `aside` at desktop widths, compact horizontal navigation below the project header on narrow widths, and a sticky content header with section title, description, save state, and Save button. Render the icon using `chrome.runtime.getURL("icons/icon48.png")` with `/icons/icon48.png` fallback for Vite preview.

- [ ] **Step 4: Move existing controls into focused sections without changing persistence**

Keep `handleSave` constructing every field exactly once. Pass field callbacks down, for example:

```ts
<PopupDictionarySection
  settings={settings}
  onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
/>
```

Keep label/switch IDs unchanged (`show-popup`, `target-language`, `auto-ask-ai`, `openrouter-thinking`) so accessibility and existing tests remain stable.

- [ ] **Step 5: Run Settings tests and type checking**

Run: `npm run test:settings-layout && npm run test:settings-language && npm run test:settings-thinking && npm run test:auto-ask && npx tsc --noEmit`

Expected: PASS.

---

### Task 6: Full verification, dist audit, and browser smoke test

**Files:**
- Modify only test/build outputs in `dist/` through `npm run build`.
- Inspect: `dist/manifest.json`, `dist/settings.html`, generated JS/CSS bundles, and `dist/icons/*`.

**Interfaces:**
- Consumes every deliverable from Tasks 1–5.
- Produces a requirement-by-requirement evidence report and a loadable extension build.

- [ ] **Step 1: Run every declared regression script**

Run the full list from `package.json`:

```powershell
$tests = (Get-Content package.json -Raw | ConvertFrom-Json).scripts.PSObject.Properties |
  Where-Object Name -like 'test:*' |
  ForEach-Object Name
foreach ($test in $tests) { npm run $test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: every test exits 0.

- [ ] **Step 2: Build production artifacts**

Run: `npm run build`

Expected: TypeScript, both Vite builds, and icon generation exit 0.

- [ ] **Step 3: Audit the generated extension rather than source alone**

Verify:

```powershell
Test-Path dist\manifest.json
Test-Path dist\settings.html
Get-ChildItem dist\icons
rg -n "react-markdown|remark-gfm|dictionaryapi|freedictionaryapi|speechSynthesis|en-GB|en-US" dist
```

Also verify removed close-button copy is not referenced by the popup header bundle and Settings contains the four navigation labels/project icon.

- [ ] **Step 4: Run available Chrome/Edge content-script smoke coverage**

Run: `npm run test:content-script`

Expected: PASS when a supported browser/debug port is available. Confirm popup existence, Dictionary active state, bounds after zoom, Escape dismissal, and pronunciation invocation. If the harness reports an environment-only skip, record it as partial manual QA rather than a pass.

- [ ] **Step 5: Review changed-file inventory and acceptance criteria**

Run: `Get-ChildItem docs\superpowers,src,scripts,dist -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 80 FullName,LastWriteTime`

Check every acceptance criterion in the design spec against direct source, test output, build output, and browser evidence. Do not claim audible-device verification unless actual playback was observed.
