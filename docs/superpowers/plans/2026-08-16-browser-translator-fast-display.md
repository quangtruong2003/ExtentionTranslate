# Chrome and Edge On-Device Dictionary Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every production change. Work directly in the current source tree; this workspace is not a Git repository, so do not create a worktree or attempt commits.

**Goal:** Render dictionaryapi.dev data immediately, then translate Dictionary-tab text on-device through the built-in Translator API in supported Chrome and Edge, with FreeDictionaryAPI.com and OpenRouter fallback layers.

**Architecture:** The background lookup becomes source-first. The content script owns a feature-detected browser-translator session, while a pure translation workflow checks persistent cache, then local translation, then a background chain of FreeDictionaryAPI.com and OpenRouter. Translation operates on typed leaf strings and never asks the browser API to generate JSON.

**Tech Stack:** TypeScript 5.6, React 18, Chrome Manifest V3 messaging and storage, Chrome/Edge Translator API, Node contract tests, Vite production builds.

## Global Constraints

- `dictionaryapi.dev` remains the canonical source for every Dictionary-tab entry and pronunciation URL.
- Support both Google Chrome and Microsoft Edge through capability detection; never sniff the browser name.
- Keep `minimum_chrome_version` at `114`; unsupported versions must use FreeDictionaryAPI.com then OpenRouter fallbacks.
- Map extension target `vi` to browser target `vi`, and `zh-CN` to browser target `zh`.
- Show the English source before awaiting cache, local translation, FreeDictionaryAPI.com, or OpenRouter translation.
- Preserve `word`, phonetics, audio URLs, word forms, source, array ordering, and object structure.
- Persistent translation cache TTL is exactly 30 days and its maximum size is exactly 200 entries.
- Add only `https://freedictionaryapi.com/*` as a host permission; no cloud translation credential is introduced.
- Lexicala is explicitly out of scope.
- Work on the current source only; do not create a Git worktree. The directory has no `.git`, so verification replaces commit steps.

---

### Task 1: Browser Translator Adapter

**Files:**
- Create: `src/services/dictionary/browserTranslator.ts`
- Create: `scripts/test-browser-translator.mjs`

**Interfaces:**
- Produces: `BrowserDictionaryTranslator` with `warm(targetLanguage)`, `translate(entry, targetLanguage, signal)`, and `destroy()`.
- Produces: `translateDictionaryEntryWithSession(entry, targetLanguage, session, signal)` for schema-safe leaf translation.
- Produces: `toBrowserTargetLanguage(targetLanguage)` returning `"vi" | "zh"`.
- Consumes: `DictionaryEntry` and non-English `TargetLanguage` from `src/shared/types.ts`.

- [ ] **Step 1: Write the failing browser-translator contract test**

Create `scripts/test-browser-translator.mjs` with a complete source fixture and fake factory/session. Assert these observable behaviors with hand-written expected values:

```js
assert.equal(toBrowserTargetLanguage("vi"), "vi");
assert.equal(toBrowserTargetLanguage("zh-CN"), "zh");

const translated = await translateDictionaryEntryWithSession(
  sourceEntry,
  "vi",
  fakeSession,
  new AbortController().signal,
);
assert.equal(translated.language, "vi");
assert.equal(translated.meanings[0].partOfSpeech, "VI:verb");
assert.equal(translated.meanings[0].definition, "VI:to move quickly on foot");
assert.deepEqual(translated.meanings[0].examples, ["VI:They run every morning."]);
assert.deepEqual(translated.meanings[0].synonyms, ["VI:jog"]);
assert.deepEqual(translated.phonetics, sourceEntry.phonetics);
assert.equal(translated.word, "run");
assert.deepEqual(translated.wordForms, sourceEntry.wordForms);
```

Also assert that two concurrent `warm("vi")` calls create one session, `unavailable` returns `null`, a failed creation can be retried, an empty translated string rejects the whole attempt, and `destroy()` destroys each created session once.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types scripts/test-browser-translator.mjs
```

Expected: failure because `src/services/dictionary/browserTranslator.ts` does not exist.

- [ ] **Step 3: Implement the minimal adapter**

In `browserTranslator.ts`, define only the browser API surface the extension uses:

```ts
export type BrowserTranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export interface BrowserTranslatorSession {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

export interface BrowserTranslatorFactory {
  availability(options: { sourceLanguage: "en"; targetLanguage: "vi" | "zh" }): Promise<BrowserTranslatorAvailability>;
  create(options: {
    sourceLanguage: "en";
    targetLanguage: "vi" | "zh";
    monitor?: (monitor: EventTarget) => void;
  }): Promise<BrowserTranslatorSession>;
}
```

`BrowserDictionaryTranslator` receives an optional factory getter in its constructor for tests; the default reads `globalThis.Translator` through a narrow type cast. Keep one in-flight promise per target pair. Delete failed or unavailable promises from the map. `warm()` starts `getSession()` and consumes errors. `translate()` returns `null` when no session is available and otherwise calls the pure mapper.

Translate non-empty leaves sequentially in this exact order for each meaning: `partOfSpeech`, `translation`, `definition`, examples, each phrase's `phrase`/`translation`/`meaning`, then synonyms. Trim output and throw when a translated required value is empty. Copy preserved metadata from the source fixture rather than from translation output.

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run the command from Step 2. Expected: one PASS line and exit code 0.

- [ ] **Step 5: Type-check the adapter**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

---

### Task 2: Persistent Translation Cache

**Files:**
- Create: `src/services/storage/dictionaryTranslationCache.ts`
- Create: `scripts/test-dictionary-translation-cache.mjs`

**Interfaces:**
- Produces: `getCachedDictionaryTranslation(storage, sourceEntry, targetLanguage, now?)`.
- Produces: `setCachedDictionaryTranslation(storage, sourceEntry, translatedEntry, targetLanguage, now?)`.
- Produces: `fingerprintDictionaryEntry(entry)`.
- Storage dependency: `{ get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> }` so tests use a real in-memory storage double without mocking cache behavior.

- [ ] **Step 1: Write the failing cache behavior test**

Create a fake storage area that really persists values in a JavaScript object. Assert:

```js
await setCachedDictionaryTranslation(storage, sourceEntry, vietnameseEntry, "vi", 1_000);
assert.equal(
  (await getCachedDictionaryTranslation(storage, sourceEntry, "vi", 1_001))?.meanings[0].definition,
  "di chuyển nhanh bằng chân",
);
assert.equal(await getCachedDictionaryTranslation(storage, changedSourceEntry, "vi", 1_001), null);
assert.equal(await getCachedDictionaryTranslation(storage, sourceEntry, "vi", 1_000 + 30 * 24 * 60 * 60 * 1000 + 1), null);
```

Insert 201 distinct entries and assert the oldest is evicted while the newest 200 remain. Corrupt stored values must return `null`, not throw. Confirm that a cache hit takes current source phonetics/audio metadata rather than stale cached metadata.

- [ ] **Step 2: Run the cache test and verify RED**

Run:

```powershell
node --experimental-strip-types scripts/test-dictionary-translation-cache.mjs
```

Expected: failure because the cache module does not exist.

- [ ] **Step 3: Implement the bounded cache**

Use these exact constants:

```ts
export const DICTIONARY_TRANSLATION_CACHE_KEY = "extention-translate:dictionary-translations:v1";
export const DICTIONARY_TRANSLATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DICTIONARY_TRANSLATION_CACHE_MAX_ENTRIES = 200;
```

Store records under `${targetLanguage}::${entry.word.toLowerCase().trim()}` with `fingerprint`, `savedAt`, `expiresAt`, and `entry`. Compute a deterministic FNV-1a fingerprint from `JSON.stringify(sourceEntry)`. On reads, validate expiry/fingerprint and pass the cached object through `normalizeTranslatedEntry(cached.entry, sourceEntry, targetLanguage)` so source metadata is refreshed and malformed cache content is rejected. On writes, remove expired records, sort remaining records by `savedAt`, and retain the newest 200.

- [ ] **Step 4: Run the cache test and verify GREEN**

Run the command from Step 2. Expected: one PASS line and exit code 0.

- [ ] **Step 5: Type-check cache code**

Run `npx tsc --noEmit`. Expected: exit code 0.

---

### Task 3: Cache-Local-Remote Translation Workflow

**Files:**
- Create: `src/services/dictionary/translationWorkflow.ts`
- Create: `scripts/test-dictionary-translation-workflow.mjs`

**Interfaces:**
- Consumes Task 1 local translator and Task 2 cache through dependency functions.
- Produces: `translateDictionaryEntryInBrowser(sourceEntry, targetLanguage, dependencies, signal)`.
- Produces result: `{ entry, status: "translated" | "partial" | "fallback", provider: "cache" | "browser" | "free-dictionary-api" | "openrouter" | "fallback" }`.

- [ ] **Step 1: Write failing provider-order tests**

Use dependency functions that append literal names to an `events` array and return complete typed fixtures. Cover four cases:

```js
assert.deepEqual(cacheHit.events, ["cache"]);
assert.equal(cacheHit.result.provider, "cache");

assert.deepEqual(browserHit.events, ["cache", "browser", "save"]);
assert.equal(browserHit.result.provider, "browser");

assert.deepEqual(freeDictionaryHit.events, ["cache", "browser", "free-dictionary-api", "save"]);
assert.equal(freeDictionaryHit.result.provider, "free-dictionary-api");
assert.equal(freeDictionaryHit.result.status, "partial");

assert.deepEqual(remoteHit.events, ["cache", "browser", "free-dictionary-api", "openrouter", "save"]);
assert.equal(remoteHit.result.provider, "openrouter");

assert.deepEqual(totalFallback.events, ["cache", "browser", "openrouter"]);
assert.equal(totalFallback.result.status, "fallback");
assert.equal(totalFallback.result.entry, sourceEntry);
```

Also assert cache read errors do not skip local translation, cache write errors do not discard a successful result, and `AbortError` stops before remote fallback.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
node --experimental-strip-types scripts/test-dictionary-translation-workflow.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the minimal workflow**

Define dependencies with exact signatures:

```ts
export interface DictionaryTranslationDependencies {
  getCached(source: DictionaryEntry, target: NonEnglishTargetLanguage): Promise<DictionaryEntry | null>;
  translateOnDevice(source: DictionaryEntry, target: NonEnglishTargetLanguage, signal: AbortSignal): Promise<DictionaryEntry | null>;
  translateRemote(source: DictionaryEntry, target: NonEnglishTargetLanguage): Promise<DictionaryTranslationResult>;
  saveCached(source: DictionaryEntry, translated: DictionaryEntry, target: NonEnglishTargetLanguage): Promise<void>;
}
```

Use cache first, then browser, then the background FreeDictionaryAPI.com result,
then OpenRouter. A FreeDictionaryAPI.com result is accepted only when it has at
least one target-language sense translation and is returned with `partial`
status. Cache read/write failures are optional optimization failures. Re-throw
any error whose `name` is `AbortError`; only capability/provider failures
advance to the next provider. Save `translated` and `partial` results, never a
plain `fallback` result.

- [ ] **Step 4: Run workflow tests and verify GREEN**

Run the command from Step 2. Expected: one PASS line and exit code 0.

- [ ] **Step 5: Run all three new unit contracts**

Run Task 1, Task 2, and Task 3 test commands. Expected: three PASS lines and exit code 0 for every command.

---

### Task 4: Source-first Background Contracts

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/types.ts`
- Modify: `public/manifest.json`
- Create: `src/services/dictionary/freeDictionaryApi.ts`
- Create: `src/background/dictionaryHandlers.ts`
- Modify: `src/background/index.ts`

**Interfaces:**
- Adds `MESSAGE_TYPES.DICTIONARY_TRANSLATE_REMOTE`.
- Adds `MESSAGE_TYPES.DICTIONARY_TRANSLATE_CANCEL` so stale remote work is aborted when the popup closes or selection changes.
- Adds `NonEnglishTargetLanguage`, `DictionaryTranslationRequest`, and `DictionaryTranslationResponse`.
- Produces `fetchFreeDictionaryApiFallback(word, sourceEntry, targetLanguage, signal)` and a recursive parser for `senses`/`subsenses` translations.
- Produces `lookupDictionarySource(payload, signal)` and `translateDictionaryRemotely(payload, signal)` handlers used by the background router.

- [x] **Step 1: Write source-first parser and remote fallback tests**

Add a complete FreeDictionaryAPI.com fixture with translations nested under `subsenses`; assert Vietnamese/Chinese words are extracted by target code, duplicate words are removed, and no target word returns `null`. The remote fallback test asserts the chain calls FreeDictionaryAPI.com before OpenRouter and that a provider failure returns the source with `fallback`.

- [x] **Step 2: Run the parser and remote fallback tests**

Run:

```powershell
node --experimental-strip-types scripts/test-free-dictionary-api.mjs
node --experimental-strip-types scripts/test-dictionary-remote-fallback.mjs
```

Expected: both commands pass after the fallback modules are implemented.

- [ ] **Step 3: Add shared message contracts and handlers**

Use these shapes:

```ts
export type NonEnglishTargetLanguage = Exclude<TargetLanguage, "en">;

export interface DictionaryTranslationRequest {
  sourceEntry: DictionaryEntry;
  targetLanguage: NonEnglishTargetLanguage;
}

export interface DictionaryTranslationResponse {
  entry: DictionaryEntry;
  translationStatus: "translated" | "partial" | "fallback";
}
```

`lookupDictionarySource` must cache and fetch with language `en`, regardless of page language, because dictionaryapi.dev's endpoint is English. `handleLookup` delegates to it and returns immediately after the source lookup. Move the existing OpenRouter dictionary translation call behind `DICTIONARY_TRANSLATE_REMOTE`; the API key continues to be read only in the background.

`DICTIONARY_TRANSLATE_REMOTE` first calls FreeDictionaryAPI.com. If its parser
returns a target-language equivalent, return the source-derived entry with
`translationStatus: "partial"`. Otherwise call OpenRouter and return its full
schema-normalized translation. Add `https://freedictionaryapi.com/*` to
`public/manifest.json` and include the provider attribution in Settings.

- [ ] **Step 4: Run background and existing dictionary tests**

Run:

```powershell
node --experimental-strip-types scripts/test-free-dictionary-api.mjs
node --experimental-strip-types scripts/test-dictionary-remote-fallback.mjs
npm run test:dictionary-translation
npm run test:openrouter-stream
```

Expected: all commands exit 0.

- [ ] **Step 5: Type-check background contracts**

Run `npx tsc --noEmit`. Expected: exit code 0.

---

### Task 5: Content Pipeline, Status UX, Documentation, and Full Verification

**Files:**
- Modify: `src/content/index.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx`
- Modify: `src/components/dictionary/copy.ts`
- Modify: `src/settings/App.tsx`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `scripts/test-content-script.mjs`

**Interfaces:**
- Consumes `BrowserDictionaryTranslator`, cache helpers, `translateDictionaryEntryInBrowser`, and `DICTIONARY_TRANSLATE_REMOTE`.
- Extends `TranslationStatus` with `translating` and `partial`, and adds localized `PopupCopy.translating` and `PopupCopy.partial`.

- [ ] **Step 1: Add failing UX and orchestration assertions**

Update popup-copy tests to expect literal translating copy in all three languages. Extend the content smoke test so a non-English setting accepts a ready source entry while translation is pending and keeps the Dictionary tab interactive. Add the three new contract test commands to `package.json`.

Run the changed tests before implementation. Expected: failures for missing `translating` copy/status or missing scripts.

- [ ] **Step 2: Render source first and resolve translation asynchronously**

In `src/content/index.tsx`:

1. Create one module-level `BrowserDictionaryTranslator`.
2. During a valid `mouseup`/`keyup` selection gesture, call `warm(settings.targetLanguage)` for non-English targets.
3. After `DICTIONARY_LOOKUP`, immediately set `phase` to the source entry with status `translating` for non-English or `source` for English.
4. Start `translateDictionaryEntryInBrowser` without awaiting it in the source-render path.
5. Wire cache functions to `chrome.storage.local`, local translation to the browser adapter, and remote translation to `DICTIONARY_TRANSLATE_REMOTE` (which itself calls FreeDictionaryAPI.com then OpenRouter).
6. After every asynchronous boundary, verify request ID, selected target language, popup state, and abort signal before applying a result.
7. Abort local work and invalidate request ID on a new popup or close.
8. Destroy browser translator sessions on `pagehide`.

- [ ] **Step 3: Add compact translating-state UI**

Extend `TranslationStatus` with `translating`. Add `PopupCopy.translating` values:

```text
en: Translating on this device…
vi: Đang dịch trên thiết bị…
zh-CN: 正在设备上翻译…
```

In `DictionaryPopup`, show this in a neutral compact status bar above meanings only while `translationStatus === "translating"`. Keep the existing amber fallback notice unchanged. Do not disable pronunciation, copy, tabs, Ask AI, or close controls.

For `partial`, show a compact neutral/amber notice explaining that
FreeDictionaryAPI.com supplied word-level equivalents while definitions and
examples remain in the source language. Include a visible attribution link to
FreeDictionaryAPI.com.

- [ ] **Step 4: Update Settings and README**

Settings copy must explain that Dictionary data starts at dictionaryapi.dev,
supported Chrome/Edge translate on-device, FreeDictionaryAPI.com is the first
remote fallback, and OpenRouter is the final fallback. Include a
FreeDictionaryAPI.com attribution link. README architecture and permissions
sections must state that the built-in browser API needs no host permission,
FreeDictionaryAPI.com is permitted explicitly, and cached translations live in
`chrome.storage.local`. Do not mention or integrate Lexicala.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test:browser-translator
npm run test:dictionary-translation-cache
npm run test:dictionary-translation-workflow
npm run test:dictionary-background
npm run test:dictionary-translation
npm run test:popup-copy
npm run test:settings-language
```

Expected: all commands exit 0.

- [ ] **Step 6: Run the complete regression suite**

Run every `test:*` script declared in `package.json`, including the Chromium content-script smoke test. Expected: all test commands exit 0 with no uncaught popup or provider errors.

- [ ] **Step 7: Build and inspect the artifact**

Run:

```powershell
npm run build
```

Expected: TypeScript and both Vite builds exit 0. Verify `dist/manifest.json` still has `minimum_chrome_version: "114"` and dictionaryapi.dev, FreeDictionaryAPI.com, and OpenRouter host permissions.

- [ ] **Step 8: Live Chrome and Edge capability smoke check**

Load the rebuilt `dist` unpacked in installed Chrome and Edge when available. With Vietnamese selected, verify source-first display; if the browser reports the model as downloadable, allow the download and verify a subsequent lookup uses the local result. Record browser version and whether the model was available. A browser whose headless mode does not expose the API is reported as partial manual QA and does not invalidate unit/build verification.
