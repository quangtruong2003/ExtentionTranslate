# OpenRouter Markdown, Thinking, Popup, and Audio Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render arbitrary streamed OpenRouter Markdown with optional collapsed thinking, constrain the popup at every viewport size, and make dictionary pronunciation resilient to preload, provider, and UK/US source failures.

**Architecture:** Keep the existing MV3 background-owned OpenRouter Chat Completions stream. Extend SSE and runtime-port contracts with a separate reasoning channel, keep raw answer text opaque, and render it through one Markdown/GFM component in the closed Shadow DOM. Preserve dictionaryapi.dev as the dictionary/audio source while changing pronunciation into an ordered direct/proxy/fallback playback pipeline that calls `play()` during the trusted gesture.

**Tech Stack:** TypeScript 5.6, React 18, `react-markdown`, `remark-gfm`, Radix Collapsible/ScrollArea, Chrome MV3 runtime ports, OpenRouter SSE, dictionaryapi.dev, Vite 5, Tailwind CSS, Node strip-types contract tests, Chromium CDP smoke tests.

## Global Constraints

- `dictionaryapi.dev` remains the source for Dictionary tab entries and pronunciation URLs.
- Dictionary translation remains a separate JSON-schema OpenRouter request; Markdown changes apply only to the OpenRouter explanation tab.
- The AI explanation request must not inject `targetLanguage` and must not force `response_format: { type: "json_object" }`.
- `openRouterThinkingEnabled` is persisted in Settings, defaults to `true`, and applies to all new explanation streams.
- The content script never receives the OpenRouter API key.
- Raw HTML is not enabled in Markdown.
- Popup width is at most `min(560px, viewport width - 24px)` and height is at most `min(680px, viewport height - 24px)`.
- Audio failure is reported once only after direct, proxy, and alternate pronunciation candidates fail.
- Existing unrelated workspace files are not reformatted or refactored.
- This workspace has no Git metadata, so tasks end with test and artifact checks rather than commit steps.

---

### Task 1: Persist the global thinking setting

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/services/storage/settings.ts`
- Modify: `src/settings/App.tsx`
- Create: `scripts/test-settings-thinking.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ExtensionSettings.openRouterThinkingEnabled: boolean`.
- Produces: `normalizeSettings(stored: Partial<ExtensionSettings> | undefined): ExtensionSettings` in the Node-testable shared types module.
- Consumed by: background stream setup in Task 3.

- [x] **Step 1: Write the failing settings migration test**

Create `scripts/test-settings-thinking.mjs` with literal expectations:

```js
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/shared/types.ts";

assert.equal(DEFAULT_SETTINGS.openRouterThinkingEnabled, true);
assert.equal(normalizeSettings({ openRouterApiKey: "old" }).openRouterThinkingEnabled, true);
assert.equal(normalizeSettings({ openRouterThinkingEnabled: false }).openRouterThinkingEnabled, false);
console.log("PASS: thinking setting defaults and migration are stable.");
```

Add `"test:settings-thinking": "node --experimental-strip-types scripts/test-settings-thinking.mjs"` to `package.json` only after the RED run.

- [x] **Step 2: Run the test directly and verify RED**

Run:

```powershell
node --experimental-strip-types scripts/test-settings-thinking.mjs
```

Expected: failure because `normalizeSettings` is not exported.

- [x] **Step 3: Implement the minimal settings contract**

Add the boolean field, default, and normalizer in `src/shared/types.ts`:

```ts
export function normalizeSettings(stored: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
```

Import and use `normalizeSettings` from `getSettings()` and `onSettingsChanged()` so old stored objects migrate at every read boundary.

- [x] **Step 4: Add the Settings switch and save path**

In `src/settings/App.tsx`, preserve the value in `handleSave()` and add a Switch near the model selector:

```tsx
<Switch
  id="openrouter-thinking"
  checked={settings.openRouterThinkingEnabled}
  onCheckedChange={(value) => setSettings({ ...settings, openRouterThinkingEnabled: value })}
/>
```

Use the approved Vietnamese label and help text from the design spec.

- [x] **Step 5: Verify GREEN and existing Settings behavior**

Run:

```powershell
npm run test:settings-thinking
npm run test:settings-language
```

Expected: both scripts print `PASS` and exit 0.

---

### Task 2: Split OpenRouter SSE into answer and thinking channels

**Files:**
- Modify: `src/services/openrouter/messages.ts`
- Modify: `src/services/openrouter/sse.ts`
- Modify: `src/services/openrouter/client.ts`
- Modify: `scripts/test-openrouter-stream.mjs`

**Interfaces:**
- Produces: `buildOpenRouterStreamBody(model, messages, thinkingEnabled)`.
- Produces: `OpenRouterSSEEvent` with `chunk`, `thinking`, and `done` variants.
- Produces: `consumeOpenRouterStream(body, onChunk, onThinking): Promise<{ raw: string; thinking: string; sawDone: boolean }>`.
- Produces: `streamOpenRouter(config, req, onChunk, onThinking)` where `OpenRouterConfig` includes `thinkingEnabled?: boolean`.
- Consumed by: background streaming adapter in Task 3.

- [x] **Step 1: Extend the OpenRouter contract test before production changes**

Add literal assertions to `scripts/test-openrouter-stream.mjs`:

```js
const thinkingBody = buildOpenRouterStreamBody("openrouter/auto", promptMessages, true);
assert.deepEqual(thinkingBody.reasoning, { enabled: true });
assert.equal("response_format" in thinkingBody, false);

const noThinkingBody = buildOpenRouterStreamBody("openrouter/auto", promptMessages, false);
assert.deepEqual(noThinkingBody.reasoning, { effort: "none" });
```

Add SSE fixtures for:

```text
data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"Check context.\n"}]}}]}

data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.summary","summary":"Context checked."}]}}]}

data: {"choices":[{"delta":{"reasoning":"Legacy thought. "}}]}

data: {"choices":[{"delta":{"content":"Final **answer**."}}]}

data: [DONE]

```

Assert readable reasoning text is emitted in order, encrypted details are ignored, answer text remains separate, and split/malformed frames do not terminate parsing.

- [x] **Step 2: Run `npm run test:openrouter-stream` and verify RED**

Expected: wrong request body and missing `thinking` events.

- [x] **Step 3: Implement request-body reasoning behavior**

Change the builder signature and return shape:

```ts
export function buildOpenRouterStreamBody(
  model: string,
  messages: OpenRouterMessage[],
  thinkingEnabled: boolean,
) {
  return {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 700,
    reasoning: thinkingEnabled ? { enabled: true } : { effort: "none" },
    stream: true,
  };
}
```

Do not change `buildDictionaryTranslationMessages` or the dictionary translation request's JSON response format.

- [x] **Step 4: Implement readable reasoning extraction**

In `src/services/openrouter/sse.ts`, emit text from `reasoning.text.text` and `reasoning.summary.summary`. Ignore `reasoning.encrypted`. Use `delta.reasoning` only when the current delta has no readable `reasoning_details`, preventing duplicate display.

Accumulate answer and reasoning independently in `consumeOpenRouterStream`; invoke `onChunk` and `onThinking` only for non-empty strings.

- [x] **Step 5: Wire client configuration and verify GREEN**

Pass `config.thinkingEnabled ?? true` to the body builder. Return `{ raw, thinking }` from `streamOpenRouter` without parsing answer JSON for the streaming explanation path.

Run:

```powershell
npm run test:openrouter-stream
```

Expected: all prompt, SSE, reasoning, malformed-frame, split-frame, and `[DONE]` assertions pass.

---

### Task 3: Propagate thinking through background and content state

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/background/streaming.ts`
- Modify: `src/background/index.ts`
- Modify: `src/content/index.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `scripts/test-background-stream-contract.mjs`

**Interfaces:**
- Produces: `AIStreamEvent` with `{ type: "thinking"; text: string }` and done `{ raw, thinking }`.
- Produces: `PopupState.aiThinkingText: string` and `PopupState.aiThinkingEnabled: boolean`.
- Consumed by: `AISection` in Task 4.

- [x] **Step 1: Write the failing background event-order test**

Change the test runner fixture so it calls answer and thinking callbacks in this order:

```js
onThinking("Check ");
onThinking("context.");
onChunk("Final ");
onChunk("answer.");
return { raw: "Final answer.", thinking: "Check context." };
```

Assert exact port messages:

```js
[
  { type: "thinking", text: "Check " },
  { type: "thinking", text: "context." },
  { type: "chunk", text: "Final " },
  { type: "chunk", text: "answer." },
  { type: "done", raw: "Final answer.", thinking: "Check context." },
]
```

- [x] **Step 2: Run `npm run test:background-stream` and verify RED**

Expected: callback signature and event union do not support thinking.

- [x] **Step 3: Implement the background adapter**

Update `StreamRunner` to receive `onChunk` and `onThinking`. Post each callback as its matching `AIStreamEvent`. Pass `settings.openRouterThinkingEnabled` to `streamOpenRouter` in `src/background/index.ts`.

- [x] **Step 4: Implement content state accumulation**

On popup open, initialize:

```ts
aiThinkingText: "",
aiThinkingEnabled: settings.openRouterThinkingEnabled,
```

On Ask AI, clear both answer and reasoning strings. Append `thinking` events independently. On `done`, set final raw and thinking strings and clear loading. Include both strings in the placement effect dependencies.

Do not use `event.structured` to render the AI tab.

- [x] **Step 5: Verify background and TypeScript contracts**

Run:

```powershell
npm run test:background-stream
npx tsc --noEmit
```

Expected: event ordering test passes and TypeScript reports no errors.

---

### Task 4: Render raw Markdown/GFM and compact thinking UX

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/dictionary/MarkdownContent.ts`
- Modify: `src/components/dictionary/AISection.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `src/components/dictionary/copy.ts`
- Create: `scripts/test-markdown-rendering.mjs`

**Interfaces:**
- Produces: `MarkdownContent({ children, className? })` rendering Markdown without raw HTML.
- Produces: `AISection` props `streamText`, `thinkingText`, `thinkingEnabled`, `loading`, `error`, `targetLanguage`, and `onRetry`.
- Produces: localized loading/thinking copy.

- [x] **Step 1: Write the Markdown behavior test first**

Create a server-render test that imports the real `MarkdownContent` and renders a literal fixture containing `## Heading`, bold, italic, strikethrough, inline code, an unordered list, a checked task-list item, a two-column GFM table, a fenced TypeScript block containing `const value = 1;`, and `<script>window.__unsafe = true</script>`.

Assert output contains `h2`, `strong`, `em`, `del`, `code`, `ul`, checkbox input, `table`, and `pre`; assert no `<script>` element is emitted. Add a link fixture and assert `target="_blank"` and both safe `rel` tokens.

- [x] **Step 2: Run the Markdown test and verify RED**

Run:

```powershell
node --experimental-strip-types scripts/test-markdown-rendering.mjs
```

Expected: import failure because `MarkdownContent` is absent.

- [x] **Step 3: Install dependencies and implement `MarkdownContent`**

Run:

```powershell
npm install react-markdown remark-gfm
```

Implement the component with `React.createElement` in a `.ts` file so the Node strip-types test can import the production component. Pass `remarkPlugins: [remarkGfm]` and custom renderers for safe links, wrapping tables, inline code, and scrollable fenced code.

Add `"test:markdown": "node --experimental-strip-types scripts/test-markdown-rendering.mjs"` to `package.json`.

- [x] **Step 4: Replace structured AI rendering**

Refactor `AISection` so both partial and completed answer text use `MarkdownContent`. Remove the field-by-field `AIExplanation` UI and `highlight` dependency. Keep error/retry behavior.

Use Radix Collapsible with local `thinkingOpen` state. Initialize closed. When `streamText` changes from empty to non-empty or loading becomes false, set it closed. The trigger remains available after completion.

Use labels:

```ts
aiThinking: string;
thinking: string;
generatingResponse: string;
```

with English, Vietnamese, and Simplified Chinese values from the design spec.

- [x] **Step 5: Verify Markdown and popup copy GREEN**

Run:

```powershell
npm run test:markdown
npm run test:popup-copy
npx tsc --noEmit
```

Expected: Markdown semantics and safe HTML assertions pass; localized copy contracts and TypeScript pass.

---

### Task 5: Prevent long content from widening the popup

**Files:**
- Modify: `src/content/positioning.ts`
- Modify: `src/content/index.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `src/components/dictionary/AISection.tsx`
- Modify: `src/styles/popup.css`
- Modify: `scripts/test-positioning.mjs`
- Modify: `scripts/test-content-script.mjs`

**Interfaces:**
- Produces: `constrainPopupSize(popup, viewport): PopupSize` with maximum width 560, maximum height 680, and 12px viewport padding on each side.
- Consumed by: `placePopup()` before setting host dimensions and computing placement.

- [x] **Step 1: Write the failing size-constraint test**

Add literal cases:

```js
assert.deepEqual(
  constrainPopupSize({ width: 2400, height: 1400 }, { width: 1280, height: 800 }),
  { width: 560, height: 680 },
);
assert.deepEqual(
  constrainPopupSize({ width: 900, height: 900 }, { width: 360, height: 480 }),
  { width: 336, height: 456 },
);
```

- [x] **Step 2: Run `npm run test:positioning` and verify RED**

Expected: missing `constrainPopupSize` export.

- [x] **Step 3: Implement fixed measurement constraints**

Implement the pure helper and call it in `placePopup()`. Set the popup width to the constrained width before measuring, then set the host width/height from the constrained measured size. Never write an unconstrained `measured.width` to the host.

- [x] **Step 4: Harden layout and Markdown overflow**

Apply `min-w-0 max-w-full overflow-hidden` to popup roots and tab panels. Add a `.ext-markdown` utility in `popup.css` with:

```css
overflow-wrap: anywhere;
word-break: break-word;
min-width: 0;
max-width: 100%;
```

Give `pre` and the table wrapper `max-width: 100%; overflow-x: auto;`. Keep one vertical scroller in the AI panel.

- [x] **Step 5: Add a Chromium long-content smoke assertion**

Use a controlled local stream/popup state or DOM fixture containing a 2,000-character unbroken token and a wide table. Assert popup width is at most `min(560, visual viewport width - 24)` and remains anchored to the selection at 100%, 125%, and 150% emulation.

- [x] **Step 6: Verify positioning GREEN**

Run:

```powershell
npm run test:positioning
npm run build
npm run test:content-script
```

Expected: pure constraints, fresh build, viewport bounds, and anchoring checks pass.

---

### Task 6: Fix pronunciation root causes and add ordered fallback

**Files:**
- Modify: `src/services/dictionary/pronunciation.ts`
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Modify: `scripts/test-pronunciation.mjs`
- Modify: `scripts/test-content-script.mjs`

**Interfaces:**
- Produces: `playPronunciationCandidates(urls, documentLike, onError)` where candidates are unique and tried in order.
- Produces: one active audio element and one terminal error callback per physical action.
- Consumed by: UK and US speaker buttons.

- [x] **Step 1: Record the verified root-cause hypothesis**

The current no-preload path awaits `PRONUNCIATION_FETCH` before constructing the audio element and calling `play()`. A click before preload completes can therefore lose Chrome's transient user activation. Provider evidence also shows individual dictionary audio URLs can fail independently (for example one `run` pronunciation returned HTTP 502 while the alternate returned audio/mpeg 200), so one URL cannot be treated as authoritative.

- [x] **Step 2: Replace the existing audio test with failing behavioral cases**

Use specific fake audio instances whose `play()` promises can resolve, reject while `readyState === 0`, or reject with a media error. Add tests proving:

1. `play()` is called synchronously before an unresolved proxy promise settles.
2. A first candidate failure advances to the second candidate.
3. `loadeddata`/`canplay` retries a loading candidate.
4. duplicate pointer/click calls within the dedupe window start only one attempt.
5. exhausted candidates call `onError` exactly once.
6. cleanup pauses/removes audio and revokes owned Blob URLs.

- [x] **Step 3: Run `npm run test:pronunciation` and verify RED**

Expected: the synchronous-play and ordered-candidate cases fail against the current await-before-play implementation.

- [x] **Step 4: Implement trusted-gesture direct playback**

When no prepared proxy element exists, synchronously create/reuse an audio element with the direct dictionary URL and call `play()` before awaiting any runtime message. Change the hidden style from `display: none` to a visually hidden 1px element.

Keep proxy preload in parallel. If the direct source emits a network/decode error, discard it and use the materialized proxy source when available.

- [x] **Step 5: Implement ordered UK/US fallback**

In `DictionaryHeader`, pass `[requestedUrl, alternateUrl]` after removing empty and duplicate values. Remove nested error callbacks. The service owns progression and calls the UI error callback once after every source strategy and candidate fails.

- [x] **Step 6: Verify unit audio GREEN**

Run:

```powershell
npm run test:pronunciation
```

Expected: synchronous gesture, retry, fallback, dedupe, cleanup, and one-error assertions pass.

- [x] **Step 7: Run browser audio evidence check**

Build fresh `dist`, load it in the Chromium smoke harness, select `run`, click both speaker controls, and assert a playback attempt is made and no immediate `Unable to play audio` toast appears when an alternate source is available. Record media loader/network limitations separately; do not claim audible hardware output from automation.

---

### Task 7: Full regression and artifact audit

**Files:**
- Modify: `README.md`
- Verify: `dist/manifest.json`
- Verify: `dist/background.js`
- Verify: `dist/content.js`
- Verify: generated Settings assets under `dist/assets/`

**Interfaces:**
- Consumes all contracts produced by Tasks 1-6.
- Produces the fresh unpacked extension artifact in `dist/`.

- [x] **Step 1: Update documentation**

Document that OpenRouter answers are raw Markdown controlled by System Prompt, thinking is a global Settings toggle, and dictionary audio uses dictionaryapi.dev direct/proxy fallback.

- [x] **Step 2: Run every focused contract test**

Run:

```powershell
npm run test:dictionary-translation
npm run test:openrouter-stream
npm run test:background-stream
npm run test:positioning
npm run test:settings-language
npm run test:settings-thinking
npm run test:popup-copy
npm run test:markdown
npm run test:pronunciation
```

Expected: every command exits 0 with a `PASS` result.

- [x] **Step 3: Build and run Chromium smoke test**

Run:

```powershell
npm run build
npm run test:content-script
```

Expected: TypeScript and Vite builds exit 0, popup selection/tab/zoom/overflow checks pass, and no TooltipProvider or uncaught runtime error appears.

- [x] **Step 4: Inspect the fresh artifact**

Verify:

- `dist/manifest.json` still grants only dictionaryapi.dev/OpenRouter host permissions needed by this feature;
- `dist/background.js` contains streaming and reasoning contracts;
- `dist/content.js` contains Markdown/GFM rendering and thinking labels;
- generated Settings assets contain the persisted thinking switch;
- no API key literal or diagnostic logging was introduced.

- [x] **Step 5: Re-read the approved spec line by line**

Map every acceptance criterion to a passing test or artifact check. Report any browser media limitation explicitly instead of upgrading it to a live audible-playback claim.
