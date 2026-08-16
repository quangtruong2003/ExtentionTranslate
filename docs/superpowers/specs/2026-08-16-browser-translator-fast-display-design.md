# Chrome and Edge On-Device Dictionary Translation Design

## Summary

Speed up the Dictionary tab's selected display language by using the browser's
built-in `Translator` API in both Google Chrome and Microsoft Edge. The popup
must continue to treat `dictionaryapi.dev` as the canonical dictionary source,
must render that English source as soon as it is available, and must never wait
for translation before showing a usable result.

The on-device path is an optimization, not a compatibility requirement. The
extension keeps its current Chrome 114 minimum, detects `Translator` support at
runtime, falls back to FreeDictionaryAPI.com when the browser API or requested
language model is unavailable, and uses the existing OpenRouter dictionary
translator as the final fallback. Lexicala is not part of this design.

## Goals

1. Display the source dictionary entry immediately after `dictionaryapi.dev`
   returns, even when Vietnamese or Simplified Chinese is selected.
2. Use the built-in Translator API in supported Chrome and Edge versions for
   English-to-Vietnamese and English-to-Simplified-Chinese dictionary text.
3. Cache completed translations persistently so repeated lookups do not call a
   translator again.
4. Preserve dictionary structure, pronunciation metadata, audio URLs, the
   selected word, and word forms exactly as returned by the source parser.
5. Use FreeDictionaryAPI.com as the first remote dictionary fallback and
   OpenRouter as the final translation fallback.
6. Keep English as the final safe fallback when all providers fail.
7. Prevent an older translation from replacing a newer selection or a newly
   selected display language.

## Non-goals

- Making FreeDictionaryAPI.com the primary source.
- Adding Google Cloud Translation, Azure Translator, DeepL, or Lexicala.
- Changing the separate OpenRouter explanation tab or its system prompt.
- Translating page content outside the dictionary popup.
- Requiring Chrome/Edge 138+ or removing support for older Chromium versions.

## Browser Compatibility

The content script checks for the global `Translator` API and then calls
`Translator.availability({ sourceLanguage: "en", targetLanguage })`.

- Extension language `vi` maps to browser language tag `vi`.
- Extension language `zh-CN` maps to browser language tag `zh`.
- `available`, `downloadable`, and `downloading` are eligible on-device states.
- `unavailable`, a missing API, permission denial, model download failure, or a
  translation exception triggers the remote fallback.

The API must run in the content-script document context because it is not
available in Manifest V3 service workers. No browser-name sniffing is used:
Chrome and Edge take the same feature-detected path.

## User Experience

### First lookup

1. A selection immediately opens the popup skeleton.
2. The selection gesture starts warming the relevant browser translator session
   when Vietnamese or Simplified Chinese is selected. This allows a first-use
   model download to begin from a user gesture.
3. The background fetches the English entry from `dictionaryapi.dev` and returns
   it without waiting for translation.
4. The popup renders the English entry and shows a compact localized
   "Translating on this device..." status.
5. When translation succeeds, the visible entry is replaced in place without
   moving the popup away from the selected text.
6. If local translation cannot run, FreeDictionaryAPI.com is tried first. If it
   cannot provide a usable target-language result, OpenRouter is tried. If that
   also cannot run or fails, the English entry remains visible with the existing
   localized fallback notice.

### Repeated lookup

After the source entry is available, a valid persistent translation-cache hit
replaces it without creating a browser translator session or an OpenRouter
request. The cache read must happen before either translation provider is used.

### Language changes

Changing "Ngôn ngữ hiển thị" while a popup is open starts a new request. Results
from the previous word or language are ignored through the existing monotonically
increasing request ID.

## Architecture and Data Flow

```text
selection gesture
  |-- warm Translator session in content script (vi/zh only)
  `-- open popup
        `-- background DICTIONARY_LOOKUP
              `-- dictionaryapi.dev / source memory cache
                    `-- return English DictionaryEntry immediately
                          |-- render source entry
  `-- content translation pipeline
                                |-- persistent translation cache hit -> render
                                |-- Chrome/Edge Translator succeeds -> cache + render
                                |-- FreeDictionaryAPI.com succeeds -> cache + render
                                |-- OpenRouter succeeds -> cache + render
                                `-- all unavailable/fail -> keep English fallback
```

### Background responsibilities

- `DICTIONARY_LOOKUP` fetches and returns only the canonical English entry.
- A new `DICTIONARY_TRANSLATE_REMOTE` message owns the remote fallback chain.
  The background calls FreeDictionaryAPI.com first and then the existing
  structured OpenRouter translator. The OpenRouter API key remains
  background-only.
- The background does not call the browser Translator API.

### Content-script responsibilities

- Warm and reuse one browser translator session per target language on the
  current page.
- Render source data before starting or awaiting translation.
- Read and write the persistent translated-entry cache.
- Invoke local translation first and request the background remote chain only
  after a local-path failure or unavailability.
- Apply a result only if its request ID and target language are still current.

## Schema-safe Translation

The browser translator is never asked to generate JSON. A deterministic mapper
walks the normalized `DictionaryEntry` and translates only user-visible text:

- `meaning.partOfSpeech`
- `meaning.translation` when present
- `meaning.definition`
- every `meaning.examples` item
- every phrase's `phrase`, `translation`, and `meaning` when present
- every `meaning.synonyms` item

The mapper preserves array order and reconstructs the typed entry. It never
translates `word`, `phonetics`, pronunciation audio URLs, `wordForms`, `source`,
or object keys. Empty optional fields remain absent. Any local translation error
fails the local attempt as a whole so the popup never displays an accidental
mixture of partially translated and source fields.

## FreeDictionaryAPI.com Fallback

When the content-side browser translator is unavailable or fails, the
background calls:

`https://freedictionaryapi.com/api/v1/entries/en/{word}?translations=true`

The response is sourced from Wiktionary and may contain definitions, examples,
IPA, and sense-level translation equivalents. It does not guarantee a target
language translation for every sense and does not provide the canonical
dictionaryapi.dev audio URLs. The adapter recursively collects target-language
translation words from `senses` and `subsenses`, groups them by source
part-of-speech, and attaches them to the matching normalized meaning's
`translation` field. Definitions/examples remain from the canonical source
entry when one exists. This is intentionally a partial fallback, and its UI
status says so; it must not be presented as a full definition translation.

If dictionaryapi.dev itself cannot provide an entry, the same endpoint can
produce a usable English fallback entry from its definitions/examples and
pronunciation text. If it has no target-language equivalents, the background
then uses OpenRouter to translate that fallback entry when a key is configured.

The extension adds only `https://freedictionaryapi.com/*` to host permissions.
The FreeDictionaryAPI.com license is CC BY-SA 4.0, so the settings/about copy
must include an attribution link before shipping this fallback.

## Translator Session Lifecycle

- Session creation is lazy and begins from `mouseup`/`keyup` for a valid
  non-English target.
- In-flight session promises are deduplicated per browser language pair.
- A successful session is reused for selections on the current page.
- Translation accepts an `AbortSignal`; closing the popup or selecting new text
  stops applying work from the previous request.
- Sessions are destroyed on page unload. A failed session is removed from the
  session map so a later user gesture can retry.

Because browser implementations process translation calls sequentially, fields
are translated in deterministic order. The source entry remains interactive
throughout this work.

## Persistent Translation Cache

Use `chrome.storage.local` through a focused storage service.

- Storage key: `extention-translate:dictionary-translations:v1`
- Entry key: normalized target language plus normalized word.
- Validation: a deterministic fingerprint of the current canonical source
  entry must match the cached record.
- TTL: 30 days.
- Maximum entries: 200.
- Eviction: discard expired records first, then oldest records by save time.
- Both local-browser and OpenRouter translations are cacheable.

A cached translation is only used after the current source entry is obtained and
its fingerprint matches. When the primary source is available, this guarantees
that every visible translated result still originates from the current
`dictionaryapi.dev` source shape; a FreeDictionaryAPI.com source fallback is
marked separately and remains eligible for the same translation workflow.

## State and Copy

Extend `TranslationStatus` with `translating`.

- `source`: English was requested.
- `translating`: source is visible while cache/local/remote work is pending.
- `translated`: a valid translated entry is visible.
- `fallback`: translation could not be produced and English remains visible.
- `partial`: FreeDictionaryAPI.com supplied target-language word equivalents,
  while definitions/examples remain in the source language.

Add localized compact copy for the translating state in English, Vietnamese,
and Simplified Chinese. The status is informational and must not block audio,
copy, tabs, closing, or Ask AI.

## Error Handling

1. Dictionary lookup errors keep the current dictionary error UI.
2. Browser API absence or `unavailable` is normal capability fallback, not a
   user-facing error toast.
3. Model download or local translation failure silently tries
   FreeDictionaryAPI.com first.
4. FreeDictionaryAPI.com with no target equivalents advances to OpenRouter.
5. Missing OpenRouter key keeps the English source and changes status to
   `fallback`; it does not affect the separate Ask AI tab.
6. Malformed remote translation keeps the English source through the existing
   schema normalization.
7. Stale, aborted, or superseded results do not update state or show a toast.

## Testing Strategy

All production behavior is implemented test-first.

1. Pure browser-translator contract tests use an injected fake Translator
   session; no live model or network is required.
2. Tests prove target-language mapping, capability fallback, session
   deduplication, schema/metadata preservation, deterministic field order, and
   whole-attempt failure.
3. Storage tests use a fake `chrome.storage.local` area and prove cache hit,
   source fingerprint invalidation, expiry, and bounded eviction.
4. FreeDictionaryAPI.com contract tests prove recursive sense translation
   extraction, partial-result handling, and normalized fallback entry creation.
5. Background contract tests prove source lookup no longer waits for remote
   translation and the remote chain is FreeDictionaryAPI.com then OpenRouter.
5. Content tests prove source-first rendering, cache-before-provider ordering,
   local-to-remote fallback, and stale-result protection.
6. Existing dictionary, settings, OpenRouter, popup, audio, positioning, and
   content-script tests must remain green.
7. Run a production build and inspect `dist/manifest.json`; the only new host
   permission is `https://freedictionaryapi.com/*`.
8. Perform a live capability smoke check in installed Chrome and Edge when each
   browser is available. A missing local model is reported as partial runtime QA,
   not represented as a failed build.

## Acceptance Criteria

1. Selecting text with English display behaves as before and never initializes
   a translator.
2. With Vietnamese or Simplified Chinese selected, the English source appears as
   soon as dictionary lookup completes; local or remote translation cannot delay
   that render.
3. Supported Chrome and Edge use their built-in Translator API after feature and
   language-pair checks.
4. A second lookup of the same unchanged source and target uses persistent cache
   without a translation-provider call.
5. Unsupported browsers and older Chrome/Edge versions use the
   FreeDictionaryAPI.com then OpenRouter fallback chain and retain a usable
   English result.
6. Pronunciation metadata and playback URLs remain byte-for-byte unchanged by
   translation.
7. No stale result replaces a newer selected word or language.
8. Type checking, all contract tests, the content-script smoke test, and the
   production build pass.
