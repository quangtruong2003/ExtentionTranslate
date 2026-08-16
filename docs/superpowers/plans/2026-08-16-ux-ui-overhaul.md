# UX/UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 20 UX/UI upgrades (P0–P2) from the review report so the popup is content-sized, closable, theme-aware, interactive, and Settings gives accurate state feedback.

**Architecture:** All changes stay inside the existing React + Shadow DOM + message-passing architecture. The content script popup (`src/content/index.tsx`) keeps its vanilla-state render loop; dictionary components gain new optional props threaded from it. Settings stays a standalone SPA. No new permissions, no new dependencies, no service-layer changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS + shadcn/ui tokens (HSL CSS vars), Chrome MV3 (storage + runtime messages), tests via `node --experimental-strip-types scripts/test-*.mjs` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-08-16-ux-ui-overhaul-design.md` — item numbers (1–20) below match the spec.

## Global Constraints

- Popup copy lives only in `src/components/dictionary/copy.ts` via `getPopupCopy(language)`; every new user-facing string must be added to all 3 languages (`en`, `vi`, `zh-CN`).
- Colors go through CSS tokens; the only sanctioned hard-coded colors are `bg-amber-500/10` (fallback banner) and `bg-slate-950 text-slate-50` (markdown code block).
- Commit message style: short imperative subject, no prefix (matches history: "Show all dictionary parts of speech").
- Run single tests with `node --experimental-strip-types scripts/<file>` from repo root.
- **Mimosa pre-commit hook:** it currently blocks commits with 8 false-positive "hardcoded credentials" findings on pre-existing lines (`copy.ts:53-78`, `errors.ts:23,30` are i18n strings and error-code constants, verified not secrets). Policy per user instruction: attempt `git commit` normally; if blocked by these same findings, retry once with `git commit --no-verify` and record it in the task report.
- `test-popup-layout.mjs` currently asserts the close button is absent (old design). Tasks 2–3 rewrite that file to assert the new design; do not treat those old assertions as regressions.
- After every task: run the task's test, then commit. After the final task: `npm run build` must pass.

---

### Task 1: Copy keys + AI tab rename (spec C, keys for B1/B2/B3/D1/D2/G)

**Files:**
- Modify: `src/components/dictionary/copy.ts`
- Test: `scripts/test-popup-copy.mjs`

**Interfaces:**
- Consumes: `PopupCopy`, `getPopupCopy` (existing).
- Produces: `PopupCopy` gains `openSettings: string`, `stopGeneration: string`, `wordFormsLabel: string`, `lookupWord: (word: string) => string`; `aiTab` becomes `"AI"` in all languages. Later tasks import these keys.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-popup-copy.mjs` (before the final `console.log`):

```js
assert.equal(english.aiTab, "AI");
assert.equal(vietnamese.aiTab, "AI");
assert.equal(chinese.aiTab, "AI");
assert.equal(english.openSettings, "Open Settings");
assert.equal(vietnamese.openSettings, "Mở Cài đặt");
assert.equal(chinese.openSettings, "打开设置");
assert.equal(english.stopGeneration, "Stop");
assert.equal(vietnamese.stopGeneration, "Dừng");
assert.equal(chinese.stopGeneration, "停止");
assert.equal(english.wordFormsLabel, "Word forms: ");
assert.equal(vietnamese.wordFormsLabel, "Các dạng từ: ");
assert.equal(chinese.wordFormsLabel, "词形：");
assert.equal(english.lookupWord("run"), "Look up run");
assert.equal(vietnamese.lookupWord("run"), "Tra từ run");
assert.equal(chinese.lookupWord("run"), "查询 run");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-copy.mjs`
Expected: FAIL — `openSettings` is `undefined`.

- [ ] **Step 3: Implement**

In `copy.ts` — add to the `PopupCopy` interface (after `askAITooltip: string;`):

```ts
  openSettings: string;
  stopGeneration: string;
  wordFormsLabel: string;
  lookupWord: (word: string) => string;
```

In each language object of `COPY`, change `aiTab` and add the 4 keys (place next to `aiTab`):

```ts
    aiTab: "AI",
    openSettings: "Open Settings",
    stopGeneration: "Stop",
    wordFormsLabel: "Word forms: ",
    lookupWord: (word) => `Look up ${word}`,
```

```ts
    aiTab: "AI",
    openSettings: "Mở Cài đặt",
    stopGeneration: "Dừng",
    wordFormsLabel: "Các dạng từ: ",
    lookupWord: (word) => `Tra từ ${word}`,
```

```ts
    aiTab: "AI",
    openSettings: "打开设置",
    stopGeneration: "停止",
    wordFormsLabel: "词形：",
    lookupWord: (word) => `查询 ${word}`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-copy.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/copy.ts scripts/test-popup-copy.mjs
git commit -m "Rename AI tab and add popup copy keys"
```

---

### Task 2: Adaptive popup width (spec A1 — item 1)

**Files:**
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (root dialog classes, line ~70)
- Modify: `src/content/index.tsx` (`placePopup`, lines ~291-325)
- Test: `scripts/test-popup-layout.mjs` (rewrite)

**Interfaces:**
- Produces: popup renders `w-fit min-w-[340px]`; `placePopup` no longer sets `popup.style.width`/`maxWidth` — width follows content; host keeps measured sizing. Later tasks (playground, close button) rely on the new width classes.

- [ ] **Step 1: Rewrite the failing test**

Replace the whole content of `scripts/test-popup-layout.mjs` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: FAIL on the first width assertion.

- [ ] **Step 3: Implement**

`DictionaryPopup.tsx` root div — replace

```tsx
        className="flex min-w-0 max-h-[min(680px,calc(100vh-24px))] w-full max-w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-fade-in"
```

with

```tsx
        className="relative flex max-h-[min(680px,calc(100vh-24px))] w-fit min-w-[340px] max-w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-fade-in"
```

(`relative` is added now for the Task 3 close button.)

`src/content/index.tsx` in `placePopup` — replace

```ts
  if (popup) {
    popup.style.width = `${maximumSize.width}px`;
    popup.style.maxWidth = `${maximumSize.width}px`;
    popup.style.maxHeight = `${maximumSize.height}px`;
  }
```

with

```ts
  if (popup) {
    popup.style.maxWidth = "min(560px, calc(100vw - 24px))";
    popup.style.maxHeight = `${maximumSize.height}px`;
  }
```

Everything else (measured `getBoundingClientRect()` → `constrainPopupSize` → `computePopupPosition` → host sizing) stays unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/DictionaryPopup.tsx src/content/index.tsx scripts/test-popup-layout.mjs
git commit -m "Size the popup to its content"
```

---

### Task 3: Close button + header actions row (spec B1 — item 2)

**Files:**
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (add `onClose` prop + X button)
- Modify: `src/components/dictionary/DictionaryHeader.tsx` (move Copy/Ask-AI below phonetics)
- Modify: `src/content/index.tsx` (pass `onClose={closePopup}`)
- Test: `scripts/test-popup-layout.mjs` (extend)

**Interfaces:**
- Produces: `DictionaryPopup` prop `onClose: () => void` (required — playground passes a no-op). Copy labels `labels.close` used for the X button.

- [ ] **Step 1: Extend the failing test**

Append to `scripts/test-popup-layout.mjs` (before `console.log`):

```js
// The visible close action is back by design (touch/discoverability) and lives at popup level.
assert.match(popupSource, /aria-label=\{labels\.close\}/);
assert.match(popupSource, /relative flex/);
assert.match(contentSource, /onClose=\{closePopup\}/);
// Header actions moved below the phonetics row; top-right corner belongs to the X only.
assert.match(headerSource, /justify-end gap-1/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: FAIL on `aria-label={labels.close}`.

- [ ] **Step 3: Implement**

`DictionaryPopup.tsx` — add `onClose: () => void;` to `Props`, destructure it, add imports:

```tsx
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
```

Immediately inside the root dialog div (before the `phase.kind === "ready"` block) render:

```tsx
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={labels.close}
          className="absolute right-1.5 top-1.5 z-10 h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
```

`DictionaryHeader.tsx` — restructure the outer container into a single column. Replace the outer opening/closing markup so the return becomes:

```tsx
    <div className="space-y-1 px-4 pt-4 pb-2">
      <div className="flex items-baseline gap-2 pr-8">
        {/* word + POS + AI badge — unchanged content */}
      </div>
      {/* phonetics row — unchanged content */}
      <div className="flex flex-wrap items-center justify-end gap-1">
        {/* Copy button and Ask AI button — moved here unchanged (tooltips intact) */}
      </div>
    </div>
```

Concrete changes: outer `flex items-start justify-between gap-2` → `space-y-1`; delete the old `<div className="flex shrink-0 items-center gap-1">` wrapper and move its two `Tooltip` blocks into the new right-aligned actions row; add `pr-8` to the word row so long words never run under the X button.

`src/content/index.tsx` — in `PopupContainer`, pass `onClose={closePopup}` to `DictionaryPopup`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/DictionaryPopup.tsx src/components/dictionary/DictionaryHeader.tsx src/content/index.tsx scripts/test-popup-layout.mjs
git commit -m "Add a visible close button to the popup"
```

---

### Task 4: Localize part-of-speech (spec B2 — item 5)

**Files:**
- Modify: `src/components/dictionary/partOfSpeech.ts`
- Modify: `src/components/dictionary/DictionaryHeader.tsx` (pass language)
- Modify: `src/components/dictionary/MeaningSection.tsx` (localize per-meaning label)
- Test: `scripts/test-part-of-speech.mjs` (extend)

**Interfaces:**
- Produces: `localizePartOfSpeech(label: string, targetLanguage: TargetLanguage): string` and `getPartOfSpeechLabels(entry: Pick<DictionaryEntry, "meanings">, targetLanguage?: TargetLanguage): string[]` (existing single-arg call sites keep working — defaults to `"en"`).

- [ ] **Step 1: Extend the failing test**

Append to `scripts/test-part-of-speech.mjs` (before `console.log`):

```js
import { localizePartOfSpeech } from "../src/components/dictionary/partOfSpeech.ts";

assert.deepEqual(
  getPartOfSpeechLabels(radioactive, "vi"),
  ["danh từ", "tính từ"],
  "Vietnamese display localizes every distinct part of speech",
);
assert.deepEqual(
  getPartOfSpeechLabels(radioactive, "zh-CN"),
  ["名词", "形容词"],
  "Simplified Chinese display localizes every distinct part of speech",
);
assert.equal(localizePartOfSpeech("noun", "vi"), "danh từ");
assert.equal(localizePartOfSpeech("determiner", "vi"), "hạn định từ");
assert.equal(localizePartOfSpeech("noun", "en"), "noun");
assert.equal(localizePartOfSpeech("somethingexotic", "vi"), "somethingexotic", "unknown labels fall back to the source");
const meaningSource = await readFile(new URL("../src/components/dictionary/MeaningSection.tsx", import.meta.url), "utf8");
assert.match(meaningSource, /localizePartOfSpeech\(meaning\.partOfSpeech, targetLanguage\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-part-of-speech.mjs`
Expected: FAIL — `localizePartOfSpeech` is not exported.

- [ ] **Step 3: Implement**

`partOfSpeech.ts` — add the label map and localization, and thread the optional language through `getPartOfSpeechLabels`:

```ts
import type { DictionaryEntry, TargetLanguage } from "@/shared/types";

const POS_LABELS: Partial<Record<Exclude<TargetLanguage, "en">, Record<string, string>>> = {
  vi: {
    noun: "danh từ",
    verb: "động từ",
    adjective: "tính từ",
    adverb: "trạng từ",
    pronoun: "đại từ",
    preposition: "giới từ",
    conjunction: "liên từ",
    interjection: "thán từ",
    exclamation: "cảm thán từ",
    determiner: "hạn định từ",
    numeral: "số từ",
    abbreviation: "viết tắt",
  },
  "zh-CN": {
    noun: "名词",
    verb: "动词",
    adjective: "形容词",
    adverb: "副词",
    pronoun: "代词",
    preposition: "介词",
    conjunction: "连词",
    interjection: "叹词",
    exclamation: "感叹语",
    determiner: "限定词",
    numeral: "数词",
    abbreviation: "缩写",
  },
};

export function localizePartOfSpeech(label: string, targetLanguage: TargetLanguage): string {
  if (targetLanguage === "en") return label;
  return POS_LABELS[targetLanguage]?.[label.trim().toLowerCase()] ?? label;
}
```

In `getPartOfSpeechLabels`, add the parameter and localize the pushed label:

```ts
export function getPartOfSpeechLabels(
  entry: Pick<DictionaryEntry, "meanings">,
  targetLanguage: TargetLanguage = "en",
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const meaning of entry.meanings) {
    const label = meaning.partOfSpeech?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(localizePartOfSpeech(label, targetLanguage));
  }

  return labels;
}
```

`DictionaryHeader.tsx` — `getPartOfSpeechLabels(entry)` → `getPartOfSpeechLabels(entry, targetLanguage)`.
`MeaningSection.tsx` — the POS span renders `{localizePartOfSpeech(meaning.partOfSpeech, targetLanguage)}`; add `localizePartOfSpeech` to the existing `./partOfSpeech` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-part-of-speech.mjs`
Expected: PASS (the pre-existing header assertion `getPartOfSpeechLabels\(entry\)` still matches the new call).

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/partOfSpeech.ts src/components/dictionary/DictionaryHeader.tsx src/components/dictionary/MeaningSection.tsx scripts/test-part-of-speech.mjs
git commit -m "Localize dictionary parts of speech"
```

---

### Task 5: Empty state opens Settings without a key (spec D1 — item 4)

**Files:**
- Modify: `src/components/dictionary/EmptyState.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (thread `onOpenSettings`)
- Modify: `src/content/index.tsx` (`openSettingsPage` + pass down)
- Test: `scripts/test-popup-copy.mjs` (extend — copy already exists from Task 1) and a source assert added to `scripts/test-popup-layout.mjs`

**Interfaces:**
- Produces: `EmptyState` prop `onOpenSettings: () => void`; `DictionaryPopup` prop `onOpenSettings: () => void` (required). Uses existing `MESSAGE_TYPES.OPEN_SETTINGS` handled by `background/index.ts:165`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-popup-layout.mjs` (before `console.log`):

```js
const emptySource = await readFile(new URL("../src/components/dictionary/EmptyState.tsx", import.meta.url), "utf8");
assert.match(emptySource, /onOpenSettings/);
assert.match(emptySource, /hasApiKey \? onAskAI : onOpenSettings/);
assert.match(contentSource, /MESSAGE_TYPES\.OPEN_SETTINGS/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: FAIL — `EmptyState.tsx` has no `onOpenSettings`.

- [ ] **Step 3: Implement**

`EmptyState.tsx` — full replacement:

```tsx
import { Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TargetLanguage } from "@/shared/types";
import { getPopupCopy } from "./copy";

interface Props {
  onAskAI: () => void;
  onOpenSettings: () => void;
  aiLoading: boolean;
  hasApiKey: boolean;
  targetLanguage: TargetLanguage;
}

export function EmptyState({ onAskAI, onOpenSettings, aiLoading, hasApiKey, targetLanguage }: Props) {
  const labels = getPopupCopy(targetLanguage);
  return (
    <div className="space-y-3 p-4 text-center">
      <p className="text-sm text-muted-foreground">{labels.noDictionaryResult}</p>
      {hasApiKey ? (
        <Button onClick={onAskAI} disabled={aiLoading} className="gap-2">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {labels.askAIForResult}
        </Button>
      ) : (
        <Button onClick={onOpenSettings} className="gap-2">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {labels.openSettings}
        </Button>
      )}
    </div>
  );
}
```

`DictionaryPopup.tsx` — add `onOpenSettings: () => void;` to `Props`, destructure, and pass to `EmptyState`:
`<EmptyState onAskAI={onAskAI} onOpenSettings={onOpenSettings} aiLoading={aiLoading} hasApiKey={hasApiKey} targetLanguage={targetLanguage} />`

`src/content/index.tsx` — add the handler near `handleRetry`:

```ts
function openSettingsPage() {
  closePopup();
  void sendMessage(MESSAGE_TYPES.OPEN_SETTINGS, undefined);
}
```

In `PopupContainer`, pass `onOpenSettings={openSettingsPage}` to `DictionaryPopup`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs && node --experimental-strip-types scripts/test-popup-copy.mjs`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/EmptyState.tsx src/components/dictionary/DictionaryPopup.tsx src/content/index.tsx scripts/test-popup-layout.mjs
git commit -m "Send keyless users to Settings from the empty state"
```

---

### Task 6: Title size consistency + badge cleanup (spec A2 item 17, B4)

**Files:**
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (3× `text-lg` → `text-xl`)
- Modify: `src/components/dictionary/DictionaryHeader.tsx` (drop Cache + FreeDictionaryAPI badges)
- Test: `scripts/test-popup-layout.mjs` (extend)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-popup-layout.mjs` (before `console.log`):

```js
assert.doesNotMatch(popupSource, /text-lg font-semibold/, "loading/error/empty titles match the ready header");
assert.doesNotMatch(headerSource, />Cache</, "the cache badge is an implementation detail");
assert.doesNotMatch(headerSource, /FreeDictionaryAPI/, "the fallback source badge moved out of the header");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: FAIL — `text-lg font-semibold` still present.

- [ ] **Step 3: Implement**

`DictionaryPopup.tsx` — in the three non-ready blocks (loading ~line 107, error ~142, empty ~150), change `<div className="text-lg font-semibold tracking-tight">` to `<div className="text-xl font-semibold tracking-tight">`.

`DictionaryHeader.tsx` — delete these two badge blocks, keep the `entry.source === "ai"` badge:

```tsx
          {entry.source === "cache" && (
            <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
              Cache
            </Badge>
          )}
          {entry.source === "free-dictionary-api" && (
            <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
              FreeDictionaryAPI
            </Badge>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/DictionaryPopup.tsx src/components/dictionary/DictionaryHeader.tsx scripts/test-popup-layout.mjs
git commit -m "Unify popup titles and hide source badges"
```

---

### Task 7: Dark mode + trigger pill (spec E1 item 6, E2 item 13)

**Files:**
- Modify: `src/styles/popup.css` (dark token block)
- Modify: `src/content/index.tsx` (`SelectionTriggerContainer` button classes)
- Test: create `scripts/test-popup-theme.mjs`; register in `package.json`

**Interfaces:** none new (pure styling).

- [ ] **Step 1: Write the failing test**

Create `scripts/test-popup-theme.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [popupCss, contentSource] = await Promise.all([
  readFile(new URL("../src/styles/popup.css", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(popupCss, /prefers-color-scheme: dark/, "popup tokens flip with the OS theme");
assert.match(popupCss, /--popover: 222\.2 47% 8%/, "dark popover background");
assert.match(contentSource, /bg-background\/95/, "the selection trigger sits on a themed pill");
assert.match(contentSource, /shadow-md/, "the selection trigger is visible on any page background");

console.log("PASS: popup and trigger adapt to dark mode with a visible pill.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-theme.mjs`
Expected: FAIL — no dark media block.

- [ ] **Step 3: Implement**

`popup.css` — after the existing `:host, :root` block inside `@layer base`, add:

```css
  @media (prefers-color-scheme: dark) {
    :host,
    :root {
      --background: 222.2 84% 4.9%;
      --foreground: 210 40% 98%;
      --card: 222.2 47% 8%;
      --card-foreground: 210 40% 98%;
      --popover: 222.2 47% 8%;
      --popover-foreground: 210 40% 98%;
      --primary: 238.7 83% 70%;
      --primary-foreground: 222.2 47% 11.2%;
      --secondary: 217.2 32.6% 17.5%;
      --secondary-foreground: 210 40% 98%;
      --muted: 217.2 32.6% 17.5%;
      --muted-foreground: 215.4 16.3% 65.1%;
      --accent: 238.7 50% 25%;
      --accent-foreground: 210 40% 98%;
      --destructive: 0 62.8% 50%;
      --destructive-foreground: 210 40% 98%;
      --border: 217.2 32.6% 22%;
      --input: 217.2 32.6% 22%;
      --ring: 238.7 83% 70%;
    }
  }
```

`src/content/index.tsx` `SelectionTriggerContainer` button — replace the `className` with:

```tsx
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/95 p-1 shadow-md backdrop-blur outline-none transition-[transform,box-shadow] hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-95"
```

(Also remove the now-unused `opacity-90 hover:opacity-100` behavior — the pill provides contrast.)

Register the test in `package.json` scripts:

```json
    "test:popup-theme": "node --experimental-strip-types scripts/test-popup-theme.mjs",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-theme.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/popup.css src/content/index.tsx scripts/test-popup-theme.mjs package.json
git commit -m "Add dark mode tokens and a themed trigger pill"
```

---

### Task 8: Toast placement + inline copy feedback (spec F1/F2 — item 7)

**Files:**
- Modify: `src/content/index.tsx` (`Toaster position`)
- Modify: `src/components/dictionary/DictionaryHeader.tsx` (inline copy state)
- Modify: `src/components/dictionary/TextTranslationPanel.tsx` (2 copy buttons)
- Test: create `scripts/test-copy-feedback.mjs`; register in `package.json`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-copy-feedback.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contentSource, headerSource, panelSource] = await Promise.all([
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryHeader.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/TextTranslationPanel.tsx", import.meta.url), "utf8"),
]);

assert.match(contentSource, /position="bottom-center"/, "errors surface near the popup, not mid-page");
assert.doesNotMatch(contentSource, /position="top-center"/);
assert.doesNotMatch(headerSource, /toast\.success\(labels\.copied\)/, "copy success is inline, not a toast");
assert.match(headerSource, /copied/);
assert.match(panelSource, /copiedTranslation/);
assert.match(panelSource, /copiedOriginal/);

console.log("PASS: copy feedback is inline and toasts move to the bottom.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-copy-feedback.mjs`
Expected: FAIL — Toaster is `top-center`.

- [ ] **Step 3: Implement**

`src/content/index.tsx` — `<Toaster position="top-center" richColors closeButton />` → `<Toaster position="bottom-center" richColors closeButton />`.

`DictionaryHeader.tsx`:
- Add imports: `useState` (from react — currently only `useEffect, useRef`), `Check` (lucide).
- Replace the `copy` helper + copy button:

```tsx
  const [copied, setCopied] = useState(false);

  async function copyWord() {
    try {
      await navigator.clipboard.writeText(entry.word);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(labels.copyFailed);
    }
  }
```

```tsx
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={labels.copyWord}
              onClick={() => void copyWord()}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            </Button>
```

(Delete the module-level `copy()` function and its `labels` parameter usage.)

`TextTranslationPanel.tsx` — same pattern twice:
- Add `useState` + `Check` imports.
- Add `const [copiedTranslation, setCopiedTranslation] = useState(false);` and `const [copiedOriginal, setCopiedOriginal] = useState(false);`
- Replace the module-level `copyText` with a local helper factory:

```tsx
  async function copyToClipboard(text: string, markCopied: (value: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      markCopied(true);
      window.setTimeout(() => markCopied(false), 1600);
    } catch {
      toast.error(labels.copyFailed);
    }
  }
```

- Translation copy button: `onClick={() => void copyToClipboard(phase.translatedText, setCopiedTranslation)}` and the icon becomes `{copiedTranslation ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}`.
- Original copy button: same with `phase.sourceText`, `setCopiedOriginal`, `copiedOriginal`.

Register the test in `package.json`:

```json
    "test:copy-feedback": "node --experimental-strip-types scripts/test-copy-feedback.mjs",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-copy-feedback.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/index.tsx src/components/dictionary/DictionaryHeader.tsx src/components/dictionary/TextTranslationPanel.tsx scripts/test-copy-feedback.mjs package.json
git commit -m "Give copy buttons inline feedback and move toasts down"
```

---

### Task 9: Click-through synonyms and phrases (spec G — item 8)

**Files:**
- Modify: `src/components/dictionary/MeaningSection.tsx` (interactive chips)
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (`onLookupWord` prop)
- Modify: `src/content/index.tsx` (extract `runWordLookup`, add `handleLookupWord`, AI request uses `state.word`)
- Test: create `scripts/test-lookup-word.mjs`; register in `package.json`

**Interfaces:**
- Produces: `MeaningSection` optional prop `onLookupWord?: (word: string) => void`; `DictionaryPopup` optional prop `onLookupWord?: (word: string) => void`. Content script exposes `runWordLookup(lookupText: string, pageLanguage: string | undefined, myId: number): Promise<void>` reusing the existing lookup pipeline.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-lookup-word.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [meaningSource, popupSource, contentSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/MeaningSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(meaningSource, /onLookupWord\?\.\(p\.phrase\)/, "phrases trigger a new lookup");
assert.match(meaningSource, /onLookupWord\?\.\(s\)/, "synonyms trigger a new lookup");
assert.match(meaningSource, /lookupWord\(/, "chips are labelled for screen readers");
assert.match(popupSource, /onLookupWord/);
assert.match(contentSource, /function handleLookupWord/, "content script owns the lookup handler");
assert.match(contentSource, /word: state\.word,/, "AI requests follow the currently displayed word");

console.log("PASS: synonyms and phrases look up in place.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-lookup-word.mjs`
Expected: FAIL — no `onLookupWord` anywhere.

- [ ] **Step 3: Implement**

`MeaningSection.tsx` — add `onLookupWord?: (word: string) => void;` to `Props`. Phrases block becomes:

```tsx
      {meaning.phrases && meaning.phrases.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.relatedPhrases}</p>
          <div className="flex flex-wrap gap-1.5">
            {meaning.phrases.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onLookupWord?.(p.phrase)}
                aria-label={copy.lookupWord(p.phrase)}
                disabled={!onLookupWord}
                className="rounded-full transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
              >
                <Badge variant="outline" className="text-xs font-normal">{p.phrase}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
```

Synonyms block becomes:

```tsx
      {meaning.synonyms && meaning.synonyms.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.synonyms}</p>
          <div className="flex flex-wrap gap-1.5">
            {meaning.synonyms.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onLookupWord?.(s)}
                aria-label={copy.lookupWord(s)}
                disabled={!onLookupWord}
                className="rounded-full transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
              >
                <Badge variant="secondary" className="text-xs font-normal">{s}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
```

`DictionaryPopup.tsx` — add `onLookupWord?: (word: string) => void;` to `Props`, destructure, pass to each `MeaningSection`: `onLookupWord={onLookupWord}`.

`src/content/index.tsx` — three changes:

(a) Extract the word-lookup pipeline from `openPopup` into a shared function (placed above `openPopup`):

```ts
async function runWordLookup(lookupText: string, pageLanguage: string | undefined, myId: number): Promise<void> {
  if (settings.targetLanguage !== "en") {
    void browserDictionaryTranslator.warm(settings.targetLanguage);
  }
  try {
    const res = await sendMessage<{ ok: boolean; payload: LookupResponse }>(MESSAGE_TYPES.DICTIONARY_LOOKUP, {
      word: lookupText,
      language: pageLanguage,
      targetLanguage: settings.targetLanguage,
    });
    if (myId !== currentRequestId) return; // stale
    if (!res?.ok) {
      setPhase({ kind: "error", code: "INTERNAL" });
      return;
    }
    if (res.payload.entry) {
      sourceDictionaryEntry = res.payload.sourceEntry ?? res.payload.entry;
      setState({
        word: lookupText,
        phase: { kind: "ready", entry: sourceDictionaryEntry },
        translationStatus: "source",
      });
      if (settings.targetLanguage !== "en") {
        void translateCurrentDictionaryEntry(sourceDictionaryEntry, myId, lookupText);
      }
      requestAnimationFrame(() => currentSelectionInfo && placePopup(getSelectionRect(currentSelectionInfo)));
    } else if (settings.targetLanguage !== "en" && settings.hasOpenRouterApiKey) {
      sourceDictionaryEntry = null;
      setState({ word: lookupText, phase: { kind: "loading" }, translationStatus: "translating" });
      void translateCurrentDictionaryEntry(null, myId, lookupText);
    } else if (res.payload.error === "NO_RESULT") {
      setPhase({ kind: "empty" });
    } else {
      setPhase({ kind: "error", code: res.payload.error || "INTERNAL" });
    }
  } catch {
    if (myId !== currentRequestId) return;
    setPhase({ kind: "error", code: "INTERNAL" });
  }
}
```

(b) `openPopup` word branch replaces its inlined pipeline with:

```ts
  if (selectionMode.kind === "text") {
    void translateSelectedText(info, selectionMode.sourceText, myId);
    return;
  }
  await runWordLookup(selectionMode.lookupText, info.pageLanguage, myId);
```

(Delete the now-duplicated lookup code from `openPopup` — the `try/catch`, `warm`, and response handling move into `runWordLookup`.)

(c) `translateCurrentDictionaryEntry` gains an explicit word parameter for the remote path — change signature to:

```ts
async function translateCurrentDictionaryEntry(entry: DictionaryEntry | null, requestId: number, lookupWord: string) {
```

and in the `!entry` remote call use `word: lookupWord` instead of `currentSelectionInfo?.text ?? ""`. Existing call sites inside `runWordLookup` pass `lookupText`.

(d) Add the handler and pass it down (near `handleRetry`):

```ts
function handleLookupWord(text: string) {
  if (!state) return;
  const mode = classifySelection(text);
  const lookupText = (mode.kind === "word" ? mode.lookupText : mode.sourceText).trim();
  if (!lookupText || lookupText.toLowerCase() === state.word.toLowerCase()) return;
  stopAIStream();
  stopDictionaryTranslation();
  const myId = ++currentRequestId;
  void runWordLookup(lookupText, currentSelectionInfo?.pageLanguage, myId);
}
```

In `PopupContainer`, pass `onLookupWord={handleLookupWord}` to `DictionaryPopup`.

(e) `handleAskAI` — change the request word so AI explains the word currently on screen:

```ts
  const req: AIRequest = {
    word: state.word,
    sentence: currentSelectionInfo?.sentence,
    ...
```

Register the test in `package.json`:

```json
    "test:lookup-word": "node --experimental-strip-types scripts/test-lookup-word.mjs",
```

- [ ] **Step 4: Run test + regression tests**

Run: `node --experimental-strip-types scripts/test-lookup-word.mjs && node --experimental-strip-types scripts/test-adaptive-selection-flow.mjs && node scripts/test-content-script.mjs`
Expected: PASS (if `test-content-script.mjs` asserts the old inlined `openPopup` shape, update its assertions to match the extracted `runWordLookup`).

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/MeaningSection.tsx src/components/dictionary/DictionaryPopup.tsx src/content/index.tsx scripts/test-lookup-word.mjs package.json
git commit -m "Look up synonyms and phrases in place"
```

---

### Task 10: Stop streaming button (spec D2 — item 9)

**Files:**
- Modify: `src/components/dictionary/AISection.tsx`
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (thread `onStop`)
- Modify: `src/content/index.tsx` (`handleStopAI` + pass down)
- Test: create `scripts/test-ai-stop.mjs`; register in `package.json`

**Interfaces:**
- Produces: `AISection` optional prop `onStop?: () => void`; `DictionaryPopup` optional prop `onStop?: () => void`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-ai-stop.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [aiSource, popupSource, contentSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/AISection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

assert.match(aiSource, /onStop/, "AISection accepts a stop handler");
assert.match(aiSource, /labels\.stopGeneration/, "the stop button uses localized copy");
assert.match(popupSource, /onStop=/);
assert.match(contentSource, /function handleStopAI/);

console.log("PASS: streaming can be stopped from the AI tab.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-ai-stop.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`AISection.tsx`:
- Imports: add `Square` to the lucide import; add `Button` from `@/components/ui/button`.
- Props: add `onStop?: () => void;`.
- Inside the scroll container, above the thinking block, render:

```tsx
        {loading && onStop && (
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-primary">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="truncate">{labels.generatingResponse}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              onClick={onStop}
            >
              <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              {labels.stopGeneration}
            </Button>
          </div>
        )}
```

- Remove the now-duplicated standalone skeleton header block (`loading && !streamText && !showThinking` keeps only its `Skeleton` rows — the `generatingResponse` line lives in the header above; simplify that block to render the skeletons only).

`DictionaryPopup.tsx` — add `onStop?: () => void;` to `Props`, pass `onStop={onStop}` to `AISection`.

`src/content/index.tsx` — add near `stopAIStream`:

```ts
function handleStopAI() {
  stopAIStream();
  if (state) setState({ aiLoading: false });
}
```

Pass `onStop={handleStopAI}` to `DictionaryPopup` in `PopupContainer`.

Register the test in `package.json`:

```json
    "test:ai-stop": "node --experimental-strip-types scripts/test-ai-stop.mjs",
```

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types scripts/test-ai-stop.mjs && node --experimental-strip-types scripts/test-thinking-ui.mjs`
Expected: PASS (update `test-thinking-ui.mjs` only if it asserts the removed skeleton header markup).

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/AISection.tsx src/components/dictionary/DictionaryPopup.tsx src/content/index.tsx scripts/test-ai-stop.mjs package.json
git commit -m "Let users stop AI streaming"
```

---

### Task 11: Render word forms (spec B3 — item 12)

**Files:**
- Modify: `src/components/dictionary/DictionaryHeader.tsx`
- Test: `scripts/test-popup-layout.mjs` (extend)

**Interfaces:** uses `entry.wordForms?: string[]` (already produced by the data pipeline).

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-popup-layout.mjs` (before `console.log`):

```js
assert.match(headerSource, /wordFormsLabel/, "word forms render with a localized label");
assert.match(headerSource, /entry\.wordForms\.join\(" · "\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`DictionaryHeader.tsx` — inside the left column, after the phonetics block (sibling of the `{entry.word && (…)}` conditional), add:

```tsx
        {entry.wordForms && entry.wordForms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{labels.wordFormsLabel}</span>
            <span className="font-mono">{entry.wordForms.join(" · ")}</span>
          </p>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-layout.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/DictionaryHeader.tsx scripts/test-popup-layout.mjs
git commit -m "Show dictionary word forms"
```

---

### Task 12: Settings dirty state + live version (spec H1 item 10, H2 item 11)

**Files:**
- Modify: `src/settings/App.tsx` (baseline, `isDirty`, `beforeunload`, save gating)
- Modify: `src/settings/sections/AboutSection.tsx` (manifest version)
- Test: extend `scripts/test-settings-persistence.mjs`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-settings-persistence.mjs` (before its final `console.log`; reuse its existing `readFile` import — verify the import exists when editing):

```js
const appSource = await readFile(new URL("../src/settings/App.tsx", import.meta.url), "utf8");
assert.match(appSource, /!isDirty/, "the save button disables when settings are clean");
assert.match(appSource, /beforeunload/, "dirty tabs warn before unload");
assert.match(appSource, /setBaseline\(next\)/, "saving resets the baseline");
const aboutSource = await readFile(new URL("../src/settings/sections/AboutSection.tsx", import.meta.url), "utf8");
assert.match(aboutSource, /getManifest\(\)/, "the about section reads the version from the manifest");
assert.doesNotMatch(aboutSource, /phiên bản 1\.0/, "no stale hard-coded version");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-settings-persistence.mjs`
Expected: FAIL — no `isDirty` in App.

- [ ] **Step 3: Implement**

`App.tsx`:
- Add state: `const [baseline, setBaseline] = useState<ExtensionSettings>(DEFAULT_SETTINGS);`
- After a successful load, also `setBaseline(next)`.
- Add the composed-next helper and dirty flag (place above `handleSave`):

```tsx
  function composeNext(): ExtensionSettings {
    return {
      selectionTriggerMode: settings.selectionTriggerMode,
      autoAskAIOnPopup: settings.autoAskAIOnPopup,
      targetLanguage: settings.targetLanguage,
      openRouterApiKey: apiKey.trim(),
      openRouterModel: model.trim() || DEFAULT_SETTINGS.openRouterModel,
      openRouterThinkingEnabled: settings.openRouterThinkingEnabled,
      systemPrompt,
    };
  }

  const isDirty = loaded && (() => {
    const next = composeNext();
    return (Object.keys(next) as Array<keyof ExtensionSettings>).some((key) => next[key] !== baseline[key]);
  })();
```

- `handleSave` builds `const next = composeNext();` (replacing the inline literal), and after `setSettings(next)` adds `setBaseline(next);`.
- Save button: `disabled={saveState === "saving" || !isDirty}` plus `disabled:opacity-50` in its className.
- Add the unload guard:

```tsx
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
```

`AboutSection.tsx` — replace the hard-coded description:

```tsx
function getExtensionVersion(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // Preview/test environments lack the extension runtime.
  }
  return "—";
}
```

and `<CardDescription>ExtentionTranslate phiên bản 1.0.</CardDescription>` → `<CardDescription>{`ExtentionTranslate phiên bản ${getExtensionVersion()}.`}</CardDescription>`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-settings-persistence.mjs && node --experimental-strip-types scripts/test-settings-layout.mjs`
Expected: PASS (update layout test only if it asserts the old always-enabled save button).

- [ ] **Step 5: Commit**

```bash
git add src/settings/App.tsx src/settings/sections/AboutSection.tsx scripts/test-settings-persistence.mjs
git commit -m "Track unsaved settings and read the live version"
```

---

### Task 13: OpenRouter section polish (spec H3 item 19, H4 item 20, H5 item 16)

**Files:**
- Modify: `src/settings/sections/OpenRouterSection.tsx` (prompt description, key check)
- Modify: `src/components/ModelSelector.tsx` (friendly name, debounce fix)
- Test: create `scripts/test-openrouter-section.mjs`; register in `package.json`

**Interfaces:** uses existing `MESSAGE_TYPES.GET_MODELS` background route `{ apiKey } → { models: OpenRouterModel[] }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-openrouter-section.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sectionSource, selectorSource] = await Promise.all([
  readFile(new URL("../src/settings/sections/OpenRouterSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ModelSelector.tsx", import.meta.url), "utf8"),
]);

assert.match(sectionSource, /handleCheckKey/, "API keys can be verified inline");
assert.match(sectionSource, /Kiểm tra key/);
assert.match(sectionSource, /Key hợp lệ/, "success reports the model count");
assert.match(sectionSource, /điều khiển ngôn ngữ và cách trả lời của tab AI/, "the prompt description explains both roles");
assert.doesNotMatch(selectorSource, /debounceRef/, "the redundant debounce timer is gone");
assert.match(selectorSource, /displayName/, "the trigger shows the friendly model name");

console.log("PASS: OpenRouter settings verify keys and show friendly model names.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-openrouter-section.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`OpenRouterSection.tsx`:
- Imports: add `useEffect, useState` from react (currently no react import), `MESSAGE_TYPES` from `@/shared/constants`.
- Inside the component add:

```tsx
  type KeyCheckState = "idle" | "checking" | "ok" | "error";
  const [keyCheck, setKeyCheck] = useState<{ state: KeyCheckState; message?: string }>({ state: "idle" });

  useEffect(() => {
    setKeyCheck({ state: "idle" });
  }, [apiKey]);

  async function handleCheckKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setKeyCheck({ state: "checking" });
    try {
      const response = await new Promise<{ ok: boolean; payload?: { models?: unknown[] } }>((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: MESSAGE_TYPES.GET_MODELS, payload: { apiKey: trimmed } },
            (reply) => resolve(reply as { ok: boolean; payload?: { models?: unknown[] } }),
          );
        } catch {
          resolve({ ok: false });
        }
      });
      const count = Array.isArray(response?.payload?.models) ? response.payload!.models!.length : 0;
      if (response?.ok && count > 0) {
        setKeyCheck({ state: "ok", message: `Key hợp lệ — ${count} model khả dụng.` });
      } else {
        setKeyCheck({ state: "error", message: "Key không hợp lệ hoặc không kết nối được OpenRouter." });
      }
    } catch {
      setKeyCheck({ state: "error", message: "Không kiểm tra được key. Vui lòng thử lại." });
    }
  }
```

(Type the state tuple outside the component if the inline `type` trips the compiler — declare `type KeyCheckState` above the component.)

- Next to the existing "Xóa key" button add:

```tsx
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void handleCheckKey()}
                  disabled={!apiKey.trim() || keyCheck.state === "checking"}
                >
                  {keyCheck.state === "checking" ? "Đang kiểm tra…" : "Kiểm tra key"}
                </Button>
```

- Under the API key helper text add the status line:

```tsx
            {keyCheck.state !== "idle" && keyCheck.state !== "checking" && (
              <p className={`text-xs ${keyCheck.state === "ok" ? "text-emerald-600" : "text-destructive"}`}>
                {keyCheck.message}
              </p>
            )}
```

- Replace the system prompt helper text with:

```tsx
            <p className="text-xs leading-relaxed text-muted-foreground">
              System Prompt điều khiển ngôn ngữ và cách trả lời của tab AI trong popup. Khi từ điển không có dữ liệu, prompt này cũng định dạng bản dịch JSON dùng cho tab Từ điển.
            </p>
```

`ModelSelector.tsx`:
- Replace `handleQueryChange` with:

```tsx
  function handleQueryChange(val: string) {
    setQuery(val);
  }
```

- Delete `debounceRef` and its cleanup usage.
- Add known-model state and name resolution (module cache reuse):

```tsx
  const [knownModels, setKnownModels] = React.useState<OpenRouterModel[]>([]);

  React.useEffect(() => {
    if (!apiKey) return;
    if (modelCache?.apiKey === apiKey) {
      setKnownModels(modelCache.models);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await sendBgMessage<{ models: OpenRouterModel[] }>(MESSAGE_TYPES.GET_MODELS, { apiKey });
      if (!cancelled && res?.models) {
        modelCache = { models: res.models, fetchedAt: Date.now(), apiKey };
        setKnownModels(res.models);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const selectedModel = React.useMemo(
    () => knownModels.find((m) => m.id === value),
    [knownModels, value],
  );
```

- Trigger content becomes:

```tsx
          <span className={cn("min-w-0 flex-1 text-left", !value && "text-muted-foreground")}>
            {value ? (
              selectedModel?.name && selectedModel.name !== value ? (
                <>
                  <span className="block truncate font-medium">{selectedModel.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{value}</span>
                </>
              ) : (
                <span className="block truncate">{value}</span>
              )
            ) : (
              "Chọn model…"
            )}
          </span>
```

Register the test in `package.json`:

```json
    "test:openrouter-section": "node --experimental-strip-types scripts/test-openrouter-section.mjs",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-openrouter-section.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/sections/OpenRouterSection.tsx src/components/ModelSelector.tsx scripts/test-openrouter-section.mjs package.json
git commit -m "Verify API keys inline and show friendly model names"
```

---

### Task 14: Focus trap + Settings playground (spec I1 item 14, I2 item 15)

**Files:**
- Modify: `src/components/dictionary/DictionaryPopup.tsx` (Tab trap, `aria-modal`)
- Modify: `src/settings/sections/PopupDictionarySection.tsx` (preview card)
- Test: create `scripts/test-popup-focus-playground.mjs`; register in `package.json`

**Interfaces:** consumes `DictionaryPopup` props finalized in Tasks 2–10 (`onClose` required; `onAskAI`, `onTabChange`, `onRetryLookup`, `onOpenSettings` required; `onLookupWord`, `onStop` optional).

- [ ] **Step 1: Write the failing test**

Create `scripts/test-popup-focus-playground.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [popupSource, sectionSource] = await Promise.all([
  readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/sections/PopupDictionarySection.tsx", import.meta.url), "utf8"),
]);

assert.match(popupSource, /aria-modal="true"/, "the dialog announces modality");
assert.match(popupSource, /handleTabTrap/, "Tab wraps inside the popup");
assert.match(sectionSource, /PREVIEW_ENTRY/, "settings embeds a preview entry");
assert.match(sectionSource, /<DictionaryPopup/, "the preview renders the real popup component");

console.log("PASS: popup traps focus and settings previews the popup.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/test-popup-focus-playground.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`DictionaryPopup.tsx` — add the trap handler inside the component and wire it plus `aria-modal`:

```tsx
  function handleTabTrap(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const dialog = rootRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = dialog.ownerDocument.activeElement as HTMLElement | null;
    const activeInDialog = active && dialog.contains(active) ? active : null;
    if (event.shiftKey && (activeInDialog === first || !activeInDialog)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeInDialog === last || !activeInDialog)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }
```

Root div: add `onKeyDown={handleTabTrap}` and `aria-modal="true"`.

`PopupDictionarySection.tsx` — add imports (`DictionaryPopup` from `@/components/dictionary/DictionaryPopup`, `DictionaryEntry` type from `@/shared/types`) and a preview entry above the component:

```tsx
const PREVIEW_ENTRY: DictionaryEntry = {
  word: "beautiful",
  phonetics: { uk: "/ˈbjuːtɪfl/", us: "/ˈbjuːtɪfl/" },
  wordForms: ["beautiful", "more beautiful", "most beautiful"],
  meanings: [
    {
      partOfSpeech: "adjective",
      cefr: "A2",
      definition: "Having qualities that delight the senses or please the mind.",
      translation: "đẹp, xinh đẹp",
      examples: ["The garden looks beautiful in spring.", "She has a beautiful voice."],
      phrases: [{ phrase: "beautiful day" }],
      synonyms: ["lovely", "pretty", "gorgeous"],
    },
  ],
  source: "free-api",
};
```

Render a second `Card` after the existing one, inside the section:

```tsx
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>Xem trước popup</CardTitle>
          <CardDescription>Bản xem trước hiển thị theo ngôn ngữ bạn chọn ở trên.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="w-fit min-w-[340px] max-w-full overflow-x-auto">
            <DictionaryPopup
              word={PREVIEW_ENTRY.word}
              phase={{ kind: "ready", entry: PREVIEW_ENTRY }}
              aiLoading={false}
              aiRequested={false}
              hasApiKey={false}
              activeTab="dictionary"
              targetLanguage={settings.targetLanguage}
              onAskAI={() => {}}
              onOpenSettings={() => {}}
              onTabChange={() => {}}
              onRetryLookup={() => {}}
              onClose={() => {}}
            />
          </div>
        </CardContent>
      </Card>
```

(The section wrapper `className` gains `space-y-6` so the two cards separate.)

Register the test in `package.json`:

```json
    "test:popup-focus-playground": "node --experimental-strip-types scripts/test-popup-focus-playground.mjs",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/test-popup-focus-playground.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dictionary/DictionaryPopup.tsx src/settings/sections/PopupDictionarySection.tsx scripts/test-popup-focus-playground.mjs package.json
git commit -m "Trap popup focus and preview it in settings"
```

---

### Task 15: Remove viewport polling (spec A3 — item 18)

**Files:**
- Modify: `src/content/index.tsx` (delete watcher)
- Test: `scripts/test-content-script.mjs` (update if it references the watcher)

**Interfaces:** removes `startViewportWatcher`/`stopViewportWatcher`/`viewportWatchTimer`/`lastViewportKey`. Re-anchoring continues via the existing `resize`/`scroll`/`visualViewport` listeners in `addOutsideListeners`.

- [ ] **Step 1: Write the failing test**

Update `scripts/test-content-script.mjs`: add (keeping its existing assertions, updating any that referenced the watcher):

```js
assert.doesNotMatch(contentSource, /startViewportWatcher|viewportWatchTimer/, "re-anchoring is event-driven, not polled");
assert.match(contentSource, /visualViewport/, "visual viewport changes still re-anchor the popup");
```

(If the file does not currently read `src/content/index.tsx` into `contentSource`, add the `readFile` for it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-content-script.mjs`
Expected: FAIL — watcher still present.

- [ ] **Step 3: Implement**

`src/content/index.tsx`:
- Delete `viewportWatchTimer` and `lastViewportKey` declarations, `startViewportWatcher`, `stopViewportWatcher`.
- Remove `stopViewportWatcher()` calls in `showSelectionTrigger` and `closePopup`, and the `startViewportWatcher()` call at the top of `addOutsideListeners`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-content-script.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/index.tsx scripts/test-content-script.mjs
git commit -m "Re-anchor the popup from viewport events"
```

---

### Task 16: Full verification sweep

**Files:**
- Modify: `README.md` (manual checklist additions)

**Interfaces:** none.

- [ ] **Step 1: Run every test script**

Run: `for f in scripts/test-*.mjs; do echo "== $f"; node --experimental-strip-types "$f" || echo "FAILED: $f"; done`
Expected: every script prints PASS; fix any failure before continuing.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `tsc --noEmit` + both Vite builds + icon generation succeed.

- [ ] **Step 3: Update the README manual checklist**

Append to `README.md` testing checklist:

```markdown
- [ ] Short words render a ~340px popup; wide AI markdown grows toward 560px without leaving the viewport.
- [ ] The X button closes the popup in every phase; Tab wraps inside the popup; Esc still closes it.
- [ ] Parts of speech display in Vietnamese or Chinese when those languages are selected.
- [ ] With no API key, the empty state's button opens Settings instead of failing a request.
- [ ] OS dark mode flips the popup and the selection trigger to dark tokens.
- [ ] Copy buttons flash a check inline; error toasts appear bottom-center near the popup.
- [ ] Clicking a synonym or phrase looks it up in place without moving the popup.
- [ ] The Stop button cancels a streaming AI answer and keeps the partial text.
- [ ] Word forms render under the phonetics when the source provides them.
- [ ] Settings disables Save when clean, warns on close when dirty, and About shows the manifest version.
- [ ] "Kiểm tra key" validates the API key inline; the model selector shows friendly names.
- [ ] The Settings preview card renders the popup in the selected display language.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the UX overhaul test checklist"
```

- [ ] **Step 5: Load `dist/` in Chrome/Edge and walk the manual checklist**

Report which items pass in the final task report; flag anything needing follow-up.
