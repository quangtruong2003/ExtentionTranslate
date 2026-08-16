# Adaptive Selection Translation Design

## Goal

Make the popup respond to the selected content instead of forcing every selection through a single-word dictionary lookup:

- A single lexical word keeps the existing dictionary experience.
- A phrase, sentence, or paragraph is translated in full to the language selected in Settings.
- Raw text translation runs in the Chrome/Edge content-script document through the browser `Translator` API for low latency and local processing.

## Problem

`openPopup()` currently sends every `SelectionInfo.text` value to `DICTIONARY_LOOKUP`. Both dictionary providers are word-oriented, so a selected sentence can enter a dictionary-shaped loading state and later render a result for one token instead of the selected sentence. The existing browser translator only translates fields of a `DictionaryEntry`, so it cannot translate raw selected text before dictionary lookup.

## Selection Classification

Add a focused, deterministic classifier:

- Trim outer whitespace and normalize repeated horizontal whitespace while preserving paragraph line breaks.
- Strip surrounding punctuation only for a potential dictionary lookup key; keep the original normalized selection for display and AI context.
- Classify as `word` only when the lookup key is one Unicode lexical token. Internal apostrophes and hyphens are allowed, such as `don't` and `state-of-the-art`.
- Classify everything else as `text`, including two or more words, URLs, email addresses, numbers with symbols, sentences, and multiline paragraphs.
- A phrase such as `run away` is intentionally translated as text because the product rule is “one word uses Dictionary; more than one word uses Translation.”

Increase `MAX_SELECTION_LENGTH` from 200 to 2,000 characters so a practical paragraph can be translated while keeping popup rendering and AI context bounded.

## Translation Data Flow

### Single word

Keep the current flow unchanged:

1. Open the popup on the Dictionary tab.
2. Request `dictionaryapi.dev` through `DICTIONARY_LOOKUP`.
3. Continue through the existing browser translation, FreeDictionaryAPI, and OpenRouter dictionary fallback chain.
4. Preserve pronunciation, IPA, word class, examples, synonyms, and OpenRouter behavior.

### Phrase, sentence, or paragraph

Use a separate raw-text path:

1. Open the popup immediately with a compact translation loading view and the complete source text.
2. Do not send `DICTIONARY_LOOKUP`.
3. Determine the source language from the page's BCP 47 `lang` value when it maps to English, Vietnamese, or Chinese; otherwise default to English because this is an English-learning extension.
4. If source and target are the same, return the source text immediately as the completed result.
5. Otherwise call the browser `Translator` API through the content-script document. Sessions are cached per `sourceLanguage -> targetLanguage` pair and stale requests are cancelled with the existing `AbortController` lifecycle.
6. If the API or language pair is unavailable, keep the source text visible and show retry plus an explicit OpenRouter action. Do not silently send the selected text to a remote service and never fall back to a one-word dictionary result.

The browser API can report `downloadable` or `downloading`; the UI uses neutral “Preparing browser translation…” copy during session creation. A later enhancement may expose exact model download progress, but progress UI is not required for this focused fix.

## Popup UX

The popup keeps two tabs and adapts the first tab label:

- `word`: Dictionary / Từ điển / 词典.
- `text`: Translation / Bản dịch / 翻译.

The text translation panel contains:

- A compact “Original” section with preserved line breaks and a copy button.
- A visually primary “Translation” section in the selected display language with a separate copy button.
- A subtle browser/local badge so users understand why the result is fast and private.
- Loading copy specific to browser translation instead of the dictionary skeleton.
- Retry and OpenRouter actions when local translation is unavailable.

The dictionary header is not rendered for text selections. Text translation therefore never shows IPA, UK/US pronunciation, word class, synonyms, or the misleading single-word result. The OpenRouter tab, Auto Ask behavior, responsive popup placement, icon trigger, Escape/outside-click cleanup, and Markdown renderer remain unchanged.

## Error and Cancellation Behavior

- New selection: abort the current dictionary or raw-text translation and ignore stale completion by request ID.
- Settings language change while the popup is open: rerun the same mode using the new target language.
- Browser translator unavailable: source remains visible; show localized actionable error, Retry, and Ask AI when configured.
- Empty translation: treat as translation failure, never as success.
- Target language equal to source language: complete immediately without showing an error or performing a network request.

## File Boundaries

- `src/content/selectionMode.ts`: normalize and classify the selection, independent of React and browser APIs.
- `src/services/dictionary/browserTranslator.ts`: generalize cached sessions by source/target pair and add raw-text translation while preserving dictionary translation behavior.
- `src/components/dictionary/TextTranslationPanel.tsx`: render only the raw-text loading, ready, and error UX.
- `src/components/dictionary/DictionaryPopup.tsx`: route adaptive phases and provide the dynamic first-tab label.
- `src/components/dictionary/PopupTabs.tsx`: accept a primary-tab label without changing tab semantics.
- `src/components/dictionary/copy.ts`: localize translation labels and errors.
- `src/content/index.tsx`: branch before dictionary lookup, own cancellation/staleness, and keep Auto Ask behavior.

## Test Strategy

1. Classifier unit tests cover simple words, apostrophes, hyphens, punctuation, phrases, sentences, multiline paragraphs, URLs, numbers, and whitespace normalization.
2. Browser translator tests cover raw text, source/target session keys, same-language no-op behavior at the content orchestration layer, unavailable sessions, empty results, aborts, and session cleanup.
3. Popup contract tests verify dynamic Dictionary/Translation labels, no dictionary header for text phases, source/translation copy actions, and localized loading/error copy.
4. Content flow tests verify multi-word selections bypass `DICTIONARY_LOOKUP`, single words keep the existing request, Auto Ask is preserved, and changing Settings reruns the active mode.
5. Production build and browser smoke tests verify the unpacked extension still mounts, displays the trigger, opens the adaptive popup, and contains no runtime exceptions.

## Acceptance Criteria

1. Selecting `Uranium` shows the existing dictionary entry.
2. Selecting `Uranium is a radioactive material.` displays the complete sentence and its translation; it never renders the `Uranium` dictionary card.
3. Selecting multiple lines preserves the complete source content and translates it as one bounded request.
4. Vietnamese and Simplified Chinese output follows the Settings display language; English target completes safely for English source text.
5. Chrome/Edge Translator is attempted before any remote AI behavior.
6. Translation failure is actionable and never degrades into an unrelated single-word dictionary result.
