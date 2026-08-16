# Selection trigger icon — UX/UI specification

## Goal

When the user selects text on a webpage, the extension should not always open a network-backed popup immediately. The default interaction is a small, accessible action icon beside the selection; the dictionary popup opens only after the user activates that icon. Users can still choose immediate popup or disable selection actions in Settings.

## User-facing modes

`selectionTriggerMode` is an explicit enum:

- `icon` — default for new installs and migrated legacy-enabled settings. Show the action icon beside a valid selection.
- `popup` — open the existing dictionary popup immediately after the selection debounce.
- `off` — do not show either action icon or popup on selection.

The Settings screen presents these as one mutually exclusive radio/segmented choice. It does not expose conflicting independent switches. The Overview reflects the selected mode with truthful Vietnamese copy.

Legacy migration is deterministic: a stored valid `selectionTriggerMode` wins; otherwise `showPopupOnSelection: false` maps to `off`, and any other legacy value maps to `icon`. The old boolean remains accepted only as an input for migration and is not used as the runtime source of truth.

## Interaction flow

1. A valid selection is debounced and captured into a `SelectionInfo` snapshot, including its cloned Range and rectangle.
2. In `icon` mode, the extension mounts only a compact trigger control. It performs no dictionary lookup, translation, or AI request.
3. The trigger is positioned near the selection using viewport-aware clamping. It follows scroll/resize/zoom and never expands beyond the visual viewport.
4. Pointer-down on the trigger prevents the host page from clearing the selection before activation. Activation opens the existing popup using the captured snapshot; it does not re-read the selection.
5. Popup opening starts dictionary lookup. Auto Ask AI runs only after the popup has opened, preserving the existing `autoAskAIOnPopup` setting.
6. A new valid selection replaces the trigger. An invalid/cleared selection removes the trigger. Outside click and `Escape` remove the trigger or close the popup.

## Accessibility and visual behavior

- The trigger is a real focusable button with a localized accessible name and tooltip/title.
- It is at least 32px on desktop and 36px on touch-oriented pointer environments, with a visible focus ring and sufficient contrast.
- It uses an existing icon component rather than a page asset, so no new web-accessible resource or CSP dependency is required.
- Placement is clamped to `visualViewport` coordinates and accounts for browser zoom; it flips above/below or to the opposite side when needed.
- The trigger has its own compact rendering phase, avoiding a loading popup that appears before the user asks for it.
- Existing popup behavior, Markdown rendering, streaming AI, pronunciation controls, and outside/Escape dismissal remain unchanged after activation.

## State and lifecycle invariants

- `currentSelectionInfo` remains the single snapshot used by both trigger activation and popup requests.
- A trigger is not considered an open popup; it must not start the popup viewport watcher or any API request.
- Closing/unmounting always clears trigger and popup state, aborts in-flight work, removes listeners, and removes the shadow host.
- A stale selection or settings update cannot activate a request for a previous selection.
- Switching to `off` removes an existing trigger/popup; switching to `icon` or `popup` affects the next selection without causing an unsolicited lookup.

## Verification contract

Tests must prove:

- default and legacy normalization produce the intended mode;
- all three modes have distinct selection behavior;
- icon rendering is local-only and does not call `openPopup` until activation;
- activation uses the captured selection and preserves Auto Ask AI semantics;
- trigger placement is bounded and responsive;
- Settings persists the new field and displays the selected mode;
- old content-script smoke tests still pass in the fresh dist build.
