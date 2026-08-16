# Popup Reliability and Settings UX Design

## Goal

Make text-selection lookup feel immediate, predictable, and dependable in Chrome and Edge. The popup must open on the dictionary, pronounce UK and US variants reliably, render OpenRouter answers from heterogeneous streaming models, and provide an extensible Settings experience without changing existing user settings unexpectedly.

## Product decisions

- Use a controlled upgrade of the current architecture rather than a rewrite.
- Preserve the provider order already agreed with the user:
  1. `dictionaryapi.dev` supplies the primary dictionary entry.
  2. Chrome/Edge Translator translates the entry when the selected display language is not English.
  3. `FreeDictionaryAPI.com` is the next dictionary fallback.
  4. OpenRouter is the final fallback.
- Do not use OpenRouter to silently refine every successful browser translation. This preserves immediate display, avoids hidden token use, and keeps the fallback contract understandable.
- Normalize translated sentence presentation locally: trim excess whitespace, capitalize the first letter when the language supports casing, and add terminal punctuation to sentence-like definitions and examples when missing. Do not alter IPA, words, phrases, synonyms, Markdown, or abbreviations.
- Keep `react-markdown` and `remark-gfm` as the OpenRouter answer renderer. Never convert the answer into a fixed JSON UI.

## Popup behavior

### Opening and navigation

- Every new selection opens with `activeTab = "dictionary"`.
- Auto Ask AI may start one background OpenRouter request after the popup opens, but it must not navigate away from Dictionary.
- A deliberate click on the Ask AI button starts or reuses the request and switches to OpenRouter.
- Clicking a tab only changes the visible panel; it does not cancel either lookup.
- The Dictionary and OpenRouter tab triggers use an equal two-column layout with full-width hit targets.
- Remove the visual close button. The popup remains dismissible with Escape, clicking outside, changing selection, or opening a replacement popup.

### Sizing and overflow

- Keep the popup inside the visual viewport with a bounded responsive width and height.
- All tab panels and Markdown descendants must use `min-width: 0`, wrap long text and URLs, and scroll vertically rather than expand horizontally.
- Header controls may wrap or compact at narrow viewport widths without covering the selected word.

### Translation presentation

- Apply presentation normalization at the translated-entry boundary so every dictionary UI receives consistent text regardless of provider.
- Use locale-aware capitalization for Vietnamese, English, and Simplified Chinese. Chinese text is trimmed and punctuated but not case-transformed.
- Preserve the selected word highlighting after normalization.
- Provider or translation failure must never erase a valid source entry. Show the English source entry with the existing fallback status when no translated entry is available.

## Pronunciation reliability

### Playback chain

Each UK or US button receives the selected word and preferred locale. A click tries these sources in order:

1. A preloaded dictionary recording for the requested region.
2. A direct dictionary recording for the requested region.
3. The same recording fetched through the extension background and played from an object URL.
4. A recording from the other English region when available.
5. Browser Speech Synthesis for the selected word, preferring an exact `en-GB` or `en-US` voice, then any compatible English voice.

The two regional buttons remain independently labelled UK and US. Falling back to speech synthesis must still request the corresponding locale.

### Interaction rules

- Keep playback inside the trusted pointer/click interaction path to satisfy browser autoplay restrictions.
- Stop the previous pronunciation before starting another one.
- Prevent duplicate playback from shadow-root event forwarding.
- Do not disable a pronunciation button merely because Dictionary API has no audio URL; the selected word is sufficient for speech synthesis.
- A technical failure is reported only after both recorded audio and browser speech synthesis are unavailable. It must not claim success when no sound was requested from either mechanism.

## OpenRouter streaming reliability

### Separation of channels

- Reasoning fields and `<think>`/`<thinking>` tags append only to the collapsed Thinking disclosure.
- Answer fields append only to the Markdown response.
- Reasoning content is never promoted into the answer when a provider returns reasoning only.

### Provider compatibility

The parser accepts answer content from common OpenRouter-compatible shapes, including:

- `choices[0].delta.content`, `delta.text`, and `delta.output_text`.
- `choices[0].message.content` and `choices[0].text` in final provider events.
- String, text-object, and arrays of text parts.
- A final SSE frame that is not followed by a blank line.
- Streams that close without an explicit `[DONE]` after delivering answer content.

At EOF, the parser flushes both the undecoded SSE remainder and partial thinking-tag state before deciding whether the response is empty.

### UI state

- Preserve and render any valid answer already received if a later stream or transport error occurs. The error becomes a secondary retry notice below the answer.
- Show “AI has not responded” only before any request has ever started. After a request, a genuinely empty response becomes an explicit retryable error instead of an ambiguous empty state.
- Auto Ask AI and manual Ask AI share one request lifecycle per popup generation to prevent duplicate charges and crossed streams.
- Stale events from a previous selection cannot update the current popup.

## Settings information architecture

### Shell

- Use the existing project icon from `public/icons` rather than a generic icon tile.
- Add a fixed desktop sidebar and a compact responsive navigation pattern for narrow widths.
- Add a sticky page header containing the active section title, description, save status, and primary Save action.
- Retain a single source of truth for the editable settings draft. Navigation must not discard unsaved changes.

### Sections

1. **Overview**: concise explanation, current popup/AI state summary, and navigation shortcuts.
2. **Popup & Dictionary**: enable-on-selection, display language, auto Ask AI, and short provider/fallback explanation.
3. **OpenRouter AI**: API key, model, Thinking toggle, and System Prompt.
4. **About**: version, data providers, attribution, and privacy note.

The page should expose only existing user-facing capabilities in this implementation. The new structure is extensible, but it must not add speculative settings.

### Accessibility and feedback

- Sidebar items and compact navigation expose current state with `aria-current` or equivalent semantics.
- Every switch keeps its explicit label association and keyboard behavior.
- Saving has clear idle, saving, success, and failure states and remains reachable without scrolling to the page bottom.
- API-key visibility remains an explicit toggle; secret values are not logged.

## Component boundaries

- `content/index.tsx`: owns popup generation, request lifecycle, and explicit-versus-automatic navigation intent.
- `PopupTabs`: owns equal-width accessible tab triggers only.
- `DictionaryHeader`: owns dictionary actions and regional pronunciation requests; it no longer owns a close action.
- `pronunciation.ts`: owns recorded-audio candidates, proxy materialization, speech-synthesis fallback, cancellation, and duplicate protection.
- Translation normalization helper: owns locale-aware sentence presentation and is applied before translated entries enter popup state.
- `sse.ts`: owns SSE framing, provider-shape normalization, and answer/reasoning separation.
- `AISection`: renders request state, collapsed Thinking, Markdown answer, and retry feedback.
- `settings/App.tsx`: owns the responsive settings shell and editable settings draft; focused section components keep layout readable.

## Testing strategy

### Regression tests first

- Auto Ask AI starts once while Dictionary remains active; manual Ask AI switches to OpenRouter.
- Tab triggers are equal-width and the header has no close control.
- Vietnamese definitions and examples receive sentence capitalization/punctuation without changing Chinese or Markdown-like values incorrectly.
- UK and US pronunciation each fall back to the requested speech locale when every audio candidate fails or is absent.
- Pronunciation avoids duplicate calls and cancels the previous utterance.
- SSE parses a final unterminated frame, final `message.content`, final `choice.text`, and a stream closed without `[DONE]`.
- Reasoning-only output remains an empty-answer error; a partial answer followed by an error remains visible.
- Settings preserves every existing field and exposes the new shell/navigation/accessibility contract.

### Completion verification

- Run the complete scripted test suite and production build.
- Inspect generated `dist` for the current settings page, content script, manifest permissions, icon assets, Markdown packages, and absence of removed close-control behavior.
- Load the unpacked `dist` in Chrome or Edge when browser automation is available and verify selection opening, tab state, popup bounds, both pronunciation buttons, AI streaming, and Settings responsiveness.
- If a live browser or audible output cannot be exercised in the environment, report that limitation separately; source tests and build success must not be described as audible-device verification.

## Acceptance criteria

- Selecting text opens a viewport-bounded popup on Dictionary every time.
- Auto Ask AI never steals focus from Dictionary.
- Both tabs have equal visual width and no close button is displayed.
- Translated definitions and examples have polished sentence casing and punctuation.
- UK and US buttons request pronunciation even when dictionary recordings are absent, with speech synthesis as the final fallback.
- Valid OpenRouter answer content from supported stream shapes is always rendered as Markdown and never mistaken for Thinking.
- A valid partial answer is not replaced by “AI has not responded.”
- Settings uses the project icon, responsive navigation, a header, clear grouping, accessible controls, and persistent save feedback.
- Existing settings values and the agreed dictionary-provider order remain intact.
