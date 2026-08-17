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

// Task 3 (revised by user): no visible close button; header actions sit top-right again.
assert.doesNotMatch(popupSource, /aria-label=\{labels\.close\}/);
assert.doesNotMatch(contentSource, /onClose=\{closePopup\}/);
assert.match(headerSource, /flex shrink-0 items-center gap-1/, "copy and ask-AI return to the header's top-right");
assert.doesNotMatch(headerSource, /\bX\b/);
// Thin, subtle outer border (user preference: mờ và mỏng, no heavy shadow).
assert.match(popupSource, /rounded-xl border border-border\/40/, "the popup renders with a thin, subtle border");
assert.doesNotMatch(popupSource, /shadow-2xl/, "the popup keeps no heavy drop shadow");
// The dialog is focused programmatically on open; the browser's default
// focus ring (outline: auto) would render as a thick dark border.
assert.match(popupSource, /border-border\/40 bg-popover text-popover-foreground outline-none/, "the focused dialog suppresses the browser focus ring");

console.log("PASS: the popup has no close button, a thin subtle border, and header actions at the top-right.");

// Auto-ask mode makes the header's Ask AI button redundant — hide it.
assert.match(headerSource, /\{!autoAskAI && \(/, "the ask-AI button hides when auto-ask is on");
assert.match(contentSource, /autoAskAI=\{settings\.autoAskAIOnPopup\}/, "the popup reads the live setting");

console.log("PASS: the ask-AI button hides when auto-ask is enabled.");

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

