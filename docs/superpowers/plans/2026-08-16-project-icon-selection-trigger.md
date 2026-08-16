# Project Icon Selection Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the selection trigger's Lucide icon with the extension project icon and remove the circular visual container without changing trigger behavior.

**Architecture:** The content script will load the already-built public asset with `chrome.runtime.getURL("icons/icon48.png")`. The existing 36×36 button remains the transparent interaction and positioning surface; only its visual classes and child icon change.

**Tech Stack:** React, TypeScript, Vite MV3 build, Lucide removal from this component, Node contract tests, Playwright content-script smoke test.

## Global Constraints

- Keep the existing selection trigger mode, pointer/mouse/click fallback handlers, localized labels, and popup activation unchanged.
- Keep the trigger hit area at 36×36 so `computeSelectionTriggerPosition` continues to receive the same geometry.
- Use the project asset at `public/icons/icon48.png`, served in the built extension as `icons/icon48.png`.
- Preserve keyboard-visible focus without a circular border or background around the icon.

---

### Task 1: Render the project icon with transparent trigger chrome

**Files:**
- Modify: `src/content/index.tsx:1-2, 148-224` — remove the Lucide import, add the runtime asset URL, and update the trigger button classes/markup.
- Test: `scripts/test-selection-trigger.mjs` — assert the project icon URL and transparent trigger styling contract.

**Interfaces:**
- Consumes: `chrome.runtime.getURL`, existing `SelectionTriggerContainer` props, and the current `data-ext-selection-trigger` contract.
- Produces: a 36×36 transparent button containing `icons/icon48.png`, with the existing localized accessible label and activation handlers.

- [ ] **Step 1: Extend the trigger contract test with the required visual/source assertions**

  Assert that `src/content/index.tsx` contains `chrome.runtime.getURL("icons/icon48.png")`, renders an image with the project asset, retains `h-9 w-9`, and no longer contains `BookOpen` or the circular `rounded-full border ... bg-background ... shadow-lg` trigger styling.

- [ ] **Step 2: Run the focused test and verify it fails against the current implementation**

  Run: `npm run test:selection-trigger`

  Expected: FAIL because the current trigger still imports/renders `BookOpen` and uses circular border/background/shadow classes.

- [ ] **Step 3: Implement the minimal trigger visual change**

  In `SelectionTriggerContainer`, define:

  ```tsx
  const projectIconUrl = chrome.runtime.getURL("icons/icon48.png");
  ```

  Replace `<BookOpen ... />` with:

  ```tsx
  <img src={projectIconUrl} alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
  ```

  Keep `h-9 w-9`, `inline-flex`, centering, event handlers, and focus behavior. Remove `rounded-full`, `border`, `bg-background`, and `shadow-lg`; use transparent visual styling with a small non-circular focus outline and pointer hover scale/opacity only.

- [ ] **Step 4: Run focused tests and verify the trigger contract passes**

  Run: `npm run test:selection-trigger`

  Expected: PASS, including project asset URL, transparent styling, 36×36 hit area, and existing activation/cleanup contracts.

### Task 2: Build and verify the packaged extension

**Files:**
- Modify: generated `dist/` output only; it remains ignored by Git and is not committed to source.

**Interfaces:**
- Consumes: the updated content script and existing Vite public asset copy behavior.
- Produces: a production bundle containing `dist/icons/icon48.png` and a content script referencing it at runtime.

- [ ] **Step 1: Build the MV3 extension**

  Run: `npm run build`

  Expected: TypeScript and both Vite builds pass; `dist/icons/icon48.png` exists. The existing content bundle size warning may remain non-blocking.

- [ ] **Step 2: Run behavior verification**

  Run: `npm run test:content-script`

  Expected: PASS confirming that selecting text shows the icon trigger and clicking it mounts the visible popup. A Chromium media-loader warning may skip only the live audio assertion in this environment.

- [ ] **Step 3: Confirm the working tree contains only intentional source/docs changes**

  Run: `git status --short`

  Expected: only `src/content/index.tsx`, `scripts/test-selection-trigger.mjs`, and the two design/plan documents are changed; generated `dist/` remains ignored.
