# Hybrid Dictionary Popup Upgrade Design

## Goal

Upgrade the selection popup without changing the dictionary source contract:
`dictionaryapi.dev` remains the source of the first tab, while OpenRouter adds
target-language translation for that tab and a separate streaming AI tab.

## Product behavior

When the user selects English text and auto-popup is enabled:

1. The popup opens immediately at the selection with a loading state.
2. The Dictionary tab fetches the English source entry from
   `dictionaryapi.dev`.
3. With `targetLanguage = en`, the source entry is displayed unchanged.
4. With `targetLanguage = vi` or `zh-CN`, OpenRouter translates the source
   entry into the same structured dictionary schema. The translated entry is
   displayed while the original word, IPA, and audio URLs remain intact.
5. If translation is unavailable because the API key is missing or the request
   fails, the English dictionary entry remains visible with a non-blocking
   fallback indicator.
6. The OpenRouter tab is independent from dictionary translation. It uses the
   user-configured system prompt without injecting `targetLanguage` and streams
   response chunks as they arrive. The final response is parsed as JSON when
   possible; partial or non-JSON output remains readable as streamed text.
7. Clicking a pronunciation button plays the selected dictionary audio. The
   audio is preloaded when the entry is ready, reused for the click, and
   replaced when another pronunciation is selected. Playback failures are
   surfaced as a small Vietnamese error toast.

## Settings

Replace the current two-option target language list with:

- `en` — English
- `vi` — Tiếng Việt
- `zh-CN` — 简体中文

The setting label describes dictionary translation, not AI language forcing.
The AI tab's language and format are controlled only by the editable system
prompt.

## Data contracts

The lookup response distinguishes source and displayed data:

```ts
type TranslationStatus = "source" | "translated" | "fallback";

interface LookupResponse {
  entry: DictionaryEntry | null;
  sourceEntry?: DictionaryEntry;
  translationStatus?: TranslationStatus;
  error?: string;
}
```

The displayed entry must keep `word`, phonetic text, and audio URLs from the
source entry unless a value is missing. Translation may change part of speech,
definition, examples, phrases, and synonyms, but must return the same JSON
shape so the existing renderer remains safe and predictable.

OpenRouter streaming uses a long-lived runtime port:

```ts
type AIStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; raw: string; structured: AIExplanation | null }
  | { type: "error"; code: string };
```

The background owns the API key and parses OpenRouter SSE frames. The content
script owns tab state and renders every `chunk` without waiting for the final
JSON parse.

## UI and responsive layout

The popup becomes a two-tab dialog:

```text
[ Từ điển ] [ OpenRouter ]
--------------------------
active tab content
```

The Dictionary tab is active on open. Starting AI switches to the OpenRouter
tab and shows a streaming state; switching back never loses the dictionary
result. The AI content is not rendered below the dictionary content.

The wrapper is measured after each phase change and positioned using actual
dialog dimensions. Placement order is:

1. Right of the selection when the measured width fits.
2. Left of the selection when right placement does not fit.
3. Below or above the selection when neither side has room.

The dialog width is capped by `min(560px, viewport width - 24px)` and height by
`min(680px, viewport height - 24px)`. `visualViewport` dimensions and offsets
are used when available, and resize/scroll/visualViewport events re-anchor the
dialog. This keeps the popup inside the visible area at browser zoom levels.

## Error and lifecycle behavior

- Each selection gets a request id; stale dictionary translation and AI stream
  events are ignored.
- Closing the popup disconnects the AI port and stops active audio.
- Dictionary source failures use the existing error state.
- Translation failures preserve the English source entry and show a subtle
  fallback label rather than replacing usable data with a blank panel.
- AI stream failures stay in the OpenRouter tab with a retry action.
- No API key is exposed to the content script.

## Verification requirements

- Unit-test the target-language contract, translation response normalization,
  SSE parser, responsive placement, and pronunciation lifecycle.
- Run the existing Chromium content-script smoke test for selection, popup
  persistence, no TooltipProvider errors, and side/viewport anchoring.
- Add a stream smoke test with a local SSE fixture so tests do not depend on an
  OpenRouter key or network timing.
- Run `npm run build` and inspect the fresh `dist/` artifact before reporting
  completion.
