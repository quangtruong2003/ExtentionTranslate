# Project Icon Selection Trigger Design

## Goal

Use the extension's own project icon for the selection trigger and remove the circular visual chrome around it.

## Current Context

The selection trigger is rendered in `src/content/index.tsx` with the Lucide `BookOpen` icon and a 36×36 circular button. The project icon is already generated at `public/icons/icon48.png` and copied to `dist/icons/icon48.png` during the build.

## Design

- Replace the Lucide `BookOpen` element with an `<img>` whose source is `chrome.runtime.getURL("icons/icon48.png")`.
- Keep the existing 36×36 trigger hit area and positioning contract so the icon remains easy to click and does not affect selection geometry.
- Remove the circular border, background, and shadow. The hit area remains transparent; only the project icon is visible.
- Preserve a visible keyboard-only focus outline using a small non-circular outline, while keeping pointer hover limited to a subtle scale/opacity response.
- Keep the existing localized `aria-label`, tooltip, pointer/click fallback handlers, and popup activation behavior unchanged.

## Acceptance Criteria

1. The trigger renders the project icon from the extension runtime URL, not a Lucide icon.
2. The trigger has no circular border, background, or shadow around the icon.
3. The transparent hit area remains 36×36 and still opens the popup on click.
4. Keyboard focus remains visible without adding a circular container.
5. The selection-trigger contract test and content-script smoke test pass after a production build.
