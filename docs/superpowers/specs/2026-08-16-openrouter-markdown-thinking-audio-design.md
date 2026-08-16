# OpenRouter Markdown, Thinking, Popup, and Audio Reliability Design

## Goal

Upgrade the existing two-tab selection popup so the OpenRouter tab renders
arbitrary streamed Markdown, optionally streams model reasoning in a compact
collapsible section, never grows beyond the visible viewport, and reliably
plays pronunciation audio from dictionaryapi.dev.

This design extends the existing hybrid popup design. It does not change the
Dictionary tab's source contract: dictionaryapi.dev remains the source of the
English dictionary entry, and OpenRouter may still translate that structured
entry into Vietnamese or Simplified Chinese.

## Approved approach

Keep the existing OpenRouter Chat Completions endpoint and SSE transport.
Extend that transport with separate answer and reasoning events instead of
migrating to the beta Responses API.

The AI answer is an opaque Markdown string controlled by the saved System
Prompt. The OpenRouter tab must not parse JSON and reconstruct a fixed UI from
fields such as `contextualMeaning`, `grammarNote`, or `additionalExamples`.
Dictionary translation remains a separate structured JSON operation because
the Dictionary tab requires a stable `DictionaryEntry` schema.

## Settings behavior

Add one persisted setting:

```ts
interface ExtensionSettings {
  showPopupOnSelection: boolean;
  autoAskAIOnPopup: boolean;
  targetLanguage: TargetLanguage;
  openRouterApiKey: string;
  openRouterModel: string;
  systemPrompt: string;
  openRouterThinkingEnabled: boolean;
}
```

`autoAskAIOnPopup` defaults to `false`. When enabled and an OpenRouter API key
is configured, a newly opened selection popup starts exactly one Ask AI stream
and selects the OpenRouter tab. Re-rendering, dictionary refreshes, settings
updates, and retrying the dictionary lookup do not start duplicate automatic
requests. Missing API keys suppress the automatic request.

`openRouterThinkingEnabled` defaults to `true` for new and existing installs.
The existing default merge in `getSettings()` supplies the value when older
stored settings do not contain it.

The Settings page places a switch in the AI / OpenRouter card, near the model
selector. Vietnamese copy:

- Label: `Bật chế độ suy luận AI`
- Help text: `Cho phép model hỗ trợ reasoning suy luận trước khi trả lời. Phần suy luận được thu gọn mặc định trong popup.`

The setting applies to every OpenRouter explanation popup. There is no per-
popup mode switch. The setting does not affect dictionary translation calls.

## OpenRouter request and stream contracts

The AI explanation stream request keeps `stream: true` and removes
`response_format: { type: "json_object" }`. The response format is controlled
only by the saved System Prompt.

When thinking is enabled, the request includes:

```ts
reasoning: { enabled: true }
```

When thinking is disabled, the request includes:

```ts
reasoning: { effort: "none" }
```

The SSE parser supports both the current structured reasoning shape and a
legacy plain-text field:

```ts
type OpenRouterSSEEvent =
  | { type: "chunk"; text: string }
  | { type: "thinking"; text: string }
  | { type: "done" };
```

For `choices[0].delta.reasoning_details`, only human-readable
`reasoning.text.text` and `reasoning.summary.summary` values are emitted.
Encrypted reasoning payloads and signatures are ignored. The parser also
accepts provider variants at `choices[0].delta.reasoning_content` and
`choices[0].delta.reasoning` as compatibility fallbacks. If a provider places
reasoning inside `delta.content` using `<think>` or `<thinking>` blocks, the
streaming parser removes those tags from the answer channel and sends their
body to the thinking channel, including when a tag is split across chunks.

The background-to-content port contract becomes:

```ts
type AIStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "thinking"; text: string }
  | { type: "done"; raw: string; thinking: string }
  | { type: "error"; code: string };
```

`raw` contains only the final answer. `thinking` contains only displayable
reasoning text. Chunk ordering is preserved within each channel. A model that
does not support reasoning may emit no thinking events; this is a valid
successful response.

The stream parser also normalizes provider/model response variations: text
parts in `delta.content`, `delta.text`, or `delta.output_text` are accepted.
OpenRouter may return an error chunk with HTTP 200, so top-level `error` and
`finish_reason: "error"` are converted to retryable UI errors instead of being
treated as an empty successful answer. If a provider returns only readable
reasoning and no answer channel, that received text is promoted to the final
answer once and the thinking disclosure is cleared. If neither channel has
text, the stream fails with `EMPTY_RESPONSE` and the user sees a localized
retry message instead of the generic no-response empty state.

## Markdown rendering

Add `react-markdown` and `remark-gfm` as runtime dependencies. Create a focused
`MarkdownContent` component used for both partial streaming output and the
completed answer.

The component supports:

- headings;
- paragraphs, bold, italic, and strikethrough;
- ordered and unordered lists;
- task lists;
- inline code and fenced code blocks;
- blockquotes;
- links;
- GitHub-style tables.

Raw HTML remains disabled. Links open in a new tab with
`rel="noreferrer noopener"`. The renderer does not add a JSON parser or a
JSON-to-Markdown adapter.

Streaming may temporarily contain incomplete Markdown syntax. The component
re-renders the accumulated raw text after each answer chunk; partial syntax is
allowed to settle naturally when later chunks arrive.

## Thinking interaction design

The OpenRouter panel owns two independent strings: `thinkingText` and
`streamText`.

When thinking is enabled and the request is active, a compact disclosure row
is shown above the answer:

- English active label: `AI is thinking…`
- Vietnamese active label: `AI đang suy nghĩ…`
- Simplified Chinese active label: `AI 正在思考…`

After reasoning stops or the first answer chunk arrives, the completed label
is `Thinking`, `Suy luận`, or `思考过程` respectively.

The reasoning body is collapsed by default. If reasoning begins before the
answer, the disclosure header remains visible but its body does not expand
automatically. The user may expand or collapse it at any time. When the first
answer chunk arrives or generation completes, the disclosure is collapsed so
the answer retains visual priority; the user can reopen it afterward.

When thinking is disabled, or a model returns no readable reasoning, no empty
reasoning disclosure is rendered. The answer loading state uses neutral copy
such as `Generating response…` rather than claiming the model is reasoning.

## Popup sizing and overflow rules

The outer popup remains capped at:

```css
max-width: min(560px, calc(100vw - 24px));
max-height: min(680px, calc(100vh - 24px));
```

The root, tab panel, scrolling region, Markdown wrapper, and all flex children
must use `min-width: 0` and must not derive popup width from min-content.

Normal prose uses `overflow-wrap: anywhere` and `word-break: break-word` so a
single unbroken URL or token cannot widen the dialog. Inline code may wrap.
Fenced code blocks and tables retain their internal formatting and use their
own horizontal scrolling containers. Images, if Markdown support later allows
them, may never exceed the content width.

The OpenRouter panel owns one vertical scroller within the popup height cap.
The popup itself remains anchored by the existing measured placement logic and
visualViewport handling at browser zoom levels.

## Pronunciation reliability design

dictionaryapi.dev remains the only accepted pronunciation host. Playback uses
an ordered list of unique candidate URLs: the requested UK or US URL first,
then the other available pronunciation as fallback. Prepared candidates are
tried in that same order before new direct or proxied elements are created.

Audio preparation has two paths:

1. Background preload fetches dictionary audio through the existing extension
   proxy, materializes the returned bytes as a Blob URL, and calls `load()`.
2. If preload is not ready at interaction time, the click handler synchronously
   creates or reuses an audio element with the direct dictionary URL and calls
   `play()` during the trusted user gesture. Proxy materialization remains the
   fallback if the direct source fails.

The audio element must not use `display: none`; it is visually hidden without
removing it from layout/media processing. Only one pronunciation plays at a
time. Starting another pronunciation pauses and rewinds the previous audio.

Playback waits for `loadeddata` or `canplay` when the initial `play()` promise
rejects because data is still loading. Network and decode failures clear the
failed prepared element, pending source promise, and Blob URL before advancing
to the next candidate. Pointer and click forwarding are deduplicated so one
physical action produces one playback attempt.

Each playback/proxy strategy has a short 1.5-second failure budget so a UK
source that hangs cannot make the popup appear silent while the US fallback is
available. `Unable to play audio` is shown exactly once and only after all
direct, proxied, and UK/US fallback candidates fail. Missing audio URLs leave
the button disabled and do not show an error.

## Error and lifecycle behavior

- Closing or replacing the popup disconnects the OpenRouter port and ignores
  stale answer and thinking events.
- Closing the popup pauses active audio, removes prepared elements, and revokes
  Blob URLs owned by the popup.
- Malformed SSE frames are ignored without terminating a valid stream.
- Provider stream errors remain visible in the OpenRouter tab with a retry
  action; already received Markdown remains available until retry or close.
- Empty or model-specific provider responses never silently resolve as a
  successful empty answer.
- API keys remain in the background service worker.
- Saved System Prompt text is not rewritten during migration.

## Verification requirements

### Markdown

- Server-render representative Markdown and assert headings, emphasis, inline
  code, fenced code, lists, task lists, strikethrough, and tables produce HTML.
- Verify raw HTML is not executed and links receive safe target/rel attributes.
- Verify a long unbroken token and a wide table stay inside a 560px popup in a
  Chromium smoke test.

### Thinking

- Test request bodies for enabled and disabled reasoning settings.
- Test SSE frames containing answer chunks, `reasoning_details`,
  `reasoning_content`, legacy `reasoning`, encrypted details, inline thinking
  tags, malformed frames, split frames, and `[DONE]`.
- Test background port ordering for separate answer and thinking events.
- Test Settings persistence and default migration from older stored values.
- Test automatic Ask AI persistence, missing-key suppression, and one-shot
  behavior for a newly opened popup.
- Verify the disclosure starts collapsed, auto-collapses on the first answer
  chunk, and remains manually reopenable.

### Audio

- Test direct trusted-click playback, preloaded Blob playback, a stalled UK
  source falling back to a prepared US source, loading retry, UK-to-US and
  US-to-UK fallback, duplicate-event suppression, resource cleanup, and one
  final error callback.
- Run the Chromium content-script smoke test against a fresh build. If the test
  browser cannot decode or fetch media in its environment, report that as a
  browser limitation rather than claiming live audible playback.

### Completion

- Run all existing contract tests and the new focused tests.
- Run `npm run build`.
- Inspect fresh `dist/background.js`, `dist/content.js`, and settings assets for
  the Markdown dependencies, reasoning request/event contracts, and popup
  overflow rules.
- Reload the unpacked extension artifact used by the user before considering
  source changes complete.

## Acceptance criteria

1. OpenRouter Markdown renders without visible Markdown control characters for
   valid syntax and without any JSON-specific formatting dependency.
2. The Settings thinking switch controls every new OpenRouter request and
   defaults to enabled.
3. Readable model reasoning streams into a collapsed disclosure while answer
   Markdown streams independently.
4. Long prose, URLs, code blocks, and tables never widen the popup beyond the
   visible viewport.
5. Clicking an available UK or US speaker starts one playback attempt and uses
   direct, proxy, and alternate-pronunciation fallbacks before showing one
   failure message.
6. Dictionary data still originates from dictionaryapi.dev, and dictionary
   translation remains schema-safe and independent from AI-tab Markdown.
