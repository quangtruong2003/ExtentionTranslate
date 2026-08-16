import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [tabsSource, headerSource, popupSource, contentSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/PopupTabs.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(tabsSource, /grid-cols-2/);
// Content-sized popup: shrink-wrap with a floor and the 560px/viewport ceiling.
assert.match(popupSource, /w-fit min-w-\[340px\] max-w-\[min\(560px,calc\(100vw-24px\)\)\]/);
assert.doesNotMatch(popupSource, /min-w-0 max-h/);
// placePopup must measure, not force, the popup width.
assert.doesNotMatch(contentSource, /popup\.style\.width/);
assert.doesNotMatch(contentSource, /popup\.style\.maxWidth = `\$\{/);

console.log("PASS: popup width is content-sized between 340px and the viewport ceiling.");

// Task 3: the visible close action is back by design (touch/discoverability) at popup level.
assert.match(popupSource, /aria-label=\{labels\.close\}/);
assert.match(popupSource, /relative flex/);
assert.match(contentSource, /onClose=\{closePopup\}/);
// Header actions moved below the phonetics row; top-right corner belongs to the X only.
assert.match(headerSource, /justify-end gap-1/);

console.log("PASS: the popup has a visible close button.");

// Task 5: keyless empty state routes to Settings instead of a doomed request.
const emptySource = await readFile(new URL("../src/components/dictionary/EmptyState.tsx", import.meta.url), "utf8");
assert.match(emptySource, /onOpenSettings/);
assert.match(emptySource, /onClick=\{onOpenSettings\}/);
assert.match(emptySource, /labels\.openSettings/);
assert.match(emptySource, /onClick=\{onAskAI\}/);
assert.match(contentSource, /MESSAGE_TYPES\.OPEN_SETTINGS/);

console.log("PASS: the keyless empty state opens Settings.");

// Task 6: titles match the ready header; implementation badges stay out of the header.
assert.doesNotMatch(popupSource, /text-lg font-semibold/, "loading/error/empty titles match the ready header");
assert.doesNotMatch(headerSource, />Cache</, "the cache badge is an implementation detail");
assert.doesNotMatch(headerSource, /FreeDictionaryAPI/, "the fallback source badge moved out of the header");

console.log("PASS: popup titles are consistent and badges cleaned up.");

// Task 11: word forms render with a localized label under the phonetics.
assert.match(headerSource, /wordFormsLabel/, "word forms render with a localized label");
assert.match(headerSource, /entry\.wordForms\.join\(" · "\)/);

console.log("PASS: word forms render in the header.");

