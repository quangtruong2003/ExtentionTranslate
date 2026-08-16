### Task 3 Report: Adaptive Translation Panel UX

Status: implemented and verified.

Scope:
- Added `TextTranslationPanel` for translation loading, ready, and error phases.
- Extended `PopupPhase` with the three adaptive translation phases from the brief.
- Added localized popup copy for English, Vietnamese, and Simplified Chinese.
- Added optional `primaryLabel` to `PopupTabs`; omitted usage still renders the existing dictionary label.
- Routed translation phases in `DictionaryPopup` without changing `src/content/index.tsx`.
- Added and registered `test:text-translation-ui`.

TDD:
- RED: `npm run test:text-translation-ui` failed on the missing `TextTranslationPanel.tsx` contract.
- GREEN: Implemented the minimal popup presentation changes, then the new test passed.
- Refactor: Switched copy buttons through the toast-backed copy helper and wrapped long translation content in the popup scroll area; tests stayed green.

Verification:
- `npm run test:text-translation-ui` PASS
- `npm run test:popup-layout` PASS
- `npm run test:popup-copy` PASS
- `npm run build` PASS

Self-review:
- Confirmed the file set stays within the Task 3 brief plus this report.
- Confirmed `src/content/index.tsx` was not modified.
- Confirmed dictionary-ready UI still gates `DictionaryHeader` and `MeaningSection` to `phase.kind === "ready"`.
- Confirmed translation text uses `whitespace-pre-wrap`, `break-words`, and `min-w-0`.
- Confirmed OpenRouter tab labeling remains unchanged.

Concerns:
- `npm run build` still emits the existing Vite warning that `dist/content.js` is larger than 500 kB after minification.
