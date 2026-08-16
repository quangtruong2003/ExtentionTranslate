# Selection trigger icon implementation plan

## Scope

Implement the approved three-mode selection trigger in the current source tree. Do not create a worktree and do not change dictionary, audio, AI streaming, or Markdown behavior outside the trigger lifecycle.

## Tasks

### 1. Add the settings contract and migration

Files: `src/shared/types.ts`, `src/background/index.ts`, `src/settings/App.tsx`, `src/settings/sections/PopupDictionarySection.tsx`, `src/settings/sections/OverviewSection.tsx`.

- Add `SelectionTriggerMode = "icon" | "popup" | "off"`.
- Normalize stored settings with deterministic legacy migration.
- Pass the mode to content scripts while retaining only compatibility input for the old boolean.
- Replace the single selection switch with one accessible mutually exclusive control.
- Persist and summarize the selected mode.

Verify with a focused settings contract test and TypeScript compilation.

### 2. Add trigger rendering and bounded placement

Files: `src/content/index.tsx`, `src/content/positioning.ts`, `src/styles/popup.css` and a small content trigger component if required.

- Track trigger phase separately from the open-popup phase.
- Render a localized focusable icon button using the existing shadow root and Lucide icon.
- Position it beside the selection with viewport clamping and zoom-safe coordinates.
- Follow relevant resize/scroll/visualViewport changes and clean up on outside click, Escape, new selection, or setting changes.

Verify with unit tests for placement and source-level lifecycle assertions.

### 3. Connect activation to the existing popup

Files: `src/content/index.tsx`, `src/content/shadowRoot.ts` only if event forwarding needs a targeted adjustment.

- Prevent pointer-down from collapsing the host selection.
- On click/keyboard activation, close only the trigger phase and call the existing popup opening path with the captured `SelectionInfo`.
- Ensure dictionary lookup and Auto Ask AI begin only after activation.
- Preserve stale-request cancellation and outside/Escape behavior.

Verify with a content-script browser smoke test covering icon default, popup mode, activation, and off mode.

### 4. Review and verification

- Ask an independent TypeScript/UI reviewer to inspect the diff and lifecycle invariants.
- Run all existing tests, TypeScript check, production build, and fresh-dist Edge smoke.
- Re-check Settings at desktop and 390px viewport and inspect the final artifact.

Completion requires current source and current `dist` evidence; unit/source checks alone are insufficient.
