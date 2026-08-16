# OpenRouter Reasoning and Budget Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-controlled reasoning effort, exact reasoning budget, and total output-token settings for the OpenRouter “Hỏi AI” flow while preserving legacy settings and dictionary-translation budgets.

**Architecture:** Extend the normalized extension settings with three validated fields and keep request construction in the OpenRouter message builder. Both streaming and non-streaming Hỏi AI calls consume one shared generation-options mapping; dictionary JSON calls continue using their existing fixed budgets. The Settings page owns editable values and blocks invalid token relationships before saving.

**Tech Stack:** React 18, TypeScript, Radix Select, Chrome extension storage, OpenRouter chat-completions/SSE, Node assertion scripts, Vite.

## Global Constraints

- Preserve unrelated existing worktree changes in `scripts/test-popup-theme.mjs`, `scripts/test-settings-layout.mjs`, `src/settings/sections/PopupDictionarySection.tsx`, `src/styles/global.css`, `src/styles/popup.css`, and `ExtentionTranslate-v1.2.3.zip`.
- Keep old stored settings loadable; missing or malformed new fields must fall back to safe defaults.
- `Max output tokens` accepts integers from `512` through `8192`; default is `1600`.
- `Reasoning budget` is blank or an integer from `1024` through `8192`; exact budget must be strictly less than max output tokens.
- When reasoning is enabled, send either `reasoning.effort` or `reasoning.max_tokens`, never both.
- Dictionary translation and dictionary lookup requests keep their existing explicit `max_tokens` values and do not receive Hỏi AI settings.
- Use test-first changes and commit each completed task with only task-owned files staged.

---

### Task 1: Add validated reasoning and output-token settings

**Files:**
- Modify: `src/shared/types.ts`
- Create: `scripts/test-openrouter-settings.mjs`

**Interfaces:**
- Produces `OpenRouterReasoningEffort = "low" | "medium" | "high"`.
- Produces `DEFAULT_SETTINGS.openRouterReasoningEffort = "low"`.
- Produces `DEFAULT_SETTINGS.openRouterReasoningMaxTokens = null`.
- Produces `DEFAULT_SETTINGS.openRouterMaxTokens = 1600`.
- Produces `getOpenRouterSettingsValidationError(settings)` returning a user-facing string or `null`.

- [ ] **Step 1: Write the failing settings-model tests**

Add assertions to `scripts/test-openrouter-settings.mjs`:

```js
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, getOpenRouterSettingsValidationError, normalizeSettings } from "../src/shared/types.ts";

assert.equal(DEFAULT_SETTINGS.openRouterReasoningEffort, "low");
assert.equal(DEFAULT_SETTINGS.openRouterReasoningMaxTokens, null);
assert.equal(DEFAULT_SETTINGS.openRouterMaxTokens, 1600);

const legacy = normalizeSettings({ openRouterApiKey: "old" });
assert.equal(legacy.openRouterReasoningEffort, "low");
assert.equal(legacy.openRouterReasoningMaxTokens, null);
assert.equal(legacy.openRouterMaxTokens, 1600);

assert.equal(normalizeSettings({ openRouterReasoningEffort: "high" }).openRouterReasoningEffort, "high");
assert.equal(normalizeSettings({ openRouterReasoningEffort: "invalid" }).openRouterReasoningEffort, "low");
assert.equal(normalizeSettings({ openRouterMaxTokens: 4096 }).openRouterMaxTokens, 4096);
assert.equal(normalizeSettings({ openRouterMaxTokens: 511 }).openRouterMaxTokens, 1600);
assert.equal(normalizeSettings({ openRouterReasoningMaxTokens: 2048, openRouterMaxTokens: 3200 }).openRouterReasoningMaxTokens, 2048);
assert.equal(normalizeSettings({ openRouterReasoningMaxTokens: 1024, openRouterMaxTokens: 1024 }).openRouterReasoningMaxTokens, null);

assert.equal(getOpenRouterSettingsValidationError({ ...DEFAULT_SETTINGS, openRouterMaxTokens: 511 }), "Max output tokens phải nằm trong khoảng 512–8192.");
assert.equal(getOpenRouterSettingsValidationError({ ...DEFAULT_SETTINGS, openRouterReasoningMaxTokens: 1024, openRouterMaxTokens: 1024 }), "Reasoning budget phải nhỏ hơn Max output tokens.");
assert.equal(getOpenRouterSettingsValidationError(DEFAULT_SETTINGS), null);

console.log("PASS: OpenRouter reasoning and token settings default, migrate, and validate safely.");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run `node --experimental-strip-types scripts/test-openrouter-settings.mjs`.

Expected: FAIL because the new settings fields and validation helper do not exist yet.

- [ ] **Step 3: Implement the settings model and normalization**

In `src/shared/types.ts`:

```ts
export type OpenRouterReasoningEffort = "low" | "medium" | "high";

export const OPENROUTER_MAX_OUTPUT_TOKENS = { min: 512, max: 8192, default: 1600 } as const;
export const OPENROUTER_REASONING_MAX_TOKENS = { min: 1024, max: 8192 } as const;
```

Add the three fields to `ExtensionSettings`, add the defaults, and normalize them after spreading `canonicalSettings`. Accept an effort only when it is one of `low`, `medium`, or `high`; accept output tokens only when they are finite integers in the configured range; accept reasoning tokens as `null` or a finite integer in its configured range. If a stored exact reasoning budget is greater than or equal to the normalized output limit, normalize it to `null`.

Add:

```ts
export function getOpenRouterSettingsValidationError(
  settings: Pick<ExtensionSettings, "openRouterMaxTokens" | "openRouterReasoningMaxTokens">,
): string | null {
  if (!Number.isInteger(settings.openRouterMaxTokens)
      || settings.openRouterMaxTokens < OPENROUTER_MAX_OUTPUT_TOKENS.min
      || settings.openRouterMaxTokens > OPENROUTER_MAX_OUTPUT_TOKENS.max) {
    return "Max output tokens phải nằm trong khoảng 512–8192.";
  }
  if (settings.openRouterReasoningMaxTokens !== null
      && (!Number.isInteger(settings.openRouterReasoningMaxTokens)
        || settings.openRouterReasoningMaxTokens < OPENROUTER_REASONING_MAX_TOKENS.min
        || settings.openRouterReasoningMaxTokens > OPENROUTER_REASONING_MAX_TOKENS.max)) {
    return "Reasoning budget phải nằm trong khoảng 1024–8192 hoặc để trống.";
  }
  if (settings.openRouterReasoningMaxTokens !== null
      && settings.openRouterReasoningMaxTokens >= settings.openRouterMaxTokens) {
    return "Reasoning budget phải nhỏ hơn Max output tokens.";
  }
  return null;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run `node --experimental-strip-types scripts/test-openrouter-settings.mjs`.

Expected: PASS.

- [ ] **Step 5: Commit the settings model**

```powershell
git add -- src/shared/types.ts scripts/test-openrouter-settings.mjs
git commit -m "feat: add OpenRouter reasoning budget settings"
```

### Task 2: Map settings into OpenRouter Hỏi AI requests

**Files:**
- Modify: `src/services/openrouter/messages.ts`
- Modify: `src/services/openrouter/client.ts`
- Modify: `src/background/index.ts`
- Modify: `scripts/test-openrouter-stream.mjs`
- Modify: `scripts/test-background-stream-contract.mjs`
- Modify: `scripts/test-openrouter-settings.mjs`

**Interfaces:**
- `OpenRouterConfig` consumes optional `reasoningEffort`, `reasoningMaxTokens`, and `maxTokens` values.
- `buildOpenRouterGenerationParameters(options?)` returns `{ max_tokens, reasoning }` with safe defaults.
- `buildOpenRouterStreamBody(model, messages, thinkingEnabled, options?)` remains backward compatible for existing three-argument callers.
- Streaming and non-streaming Hỏi AI calls use the same `OpenRouterConfig` mapping.

- [ ] **Step 1: Write failing request-mapping assertions**

Add these assertions to `scripts/test-openrouter-settings.mjs` after importing `buildOpenRouterGenerationParameters` from `src/services/openrouter/messages.ts`:

```js
assert.deepEqual(
  buildOpenRouterGenerationParameters({ thinkingEnabled: false, maxTokens: 2400 }),
  { max_tokens: 2400, reasoning: { effort: "none" } },
);
assert.deepEqual(
  buildOpenRouterGenerationParameters({ thinkingEnabled: true, reasoningEffort: "high", maxTokens: 3200 }),
  { max_tokens: 3200, reasoning: { effort: "high" } },
);
assert.deepEqual(
  buildOpenRouterGenerationParameters({ thinkingEnabled: true, reasoningEffort: "high", reasoningMaxTokens: 1200, maxTokens: 2400 }),
  { max_tokens: 2400, reasoning: { max_tokens: 1200 } },
);
```

Update `scripts/test-openrouter-stream.mjs` to assert `buildOpenRouterStreamBody("openrouter/auto", promptMessages, true, { reasoningEffort: "medium", maxTokens: 2400 })` sends `max_tokens: 2400` and `{ effort: "medium" }`, and that passing `reasoningMaxTokens: 1200` sends only `{ max_tokens: 1200 }` under `reasoning`.

- [ ] **Step 2: Run the focused request tests and verify they fail**

Run:

```powershell
node --experimental-strip-types scripts/test-openrouter-settings.mjs
node --experimental-strip-types scripts/test-openrouter-stream.mjs
```

Expected: FAIL because the shared request-parameter helper and optional body arguments do not exist yet.

- [ ] **Step 3: Implement shared request mapping**

In `src/services/openrouter/messages.ts`, import `OpenRouterReasoningEffort`, add:

```ts
export interface OpenRouterGenerationOptions {
  thinkingEnabled?: boolean;
  reasoningEffort?: OpenRouterReasoningEffort;
  reasoningMaxTokens?: number | null;
  maxTokens?: number;
}

export function buildOpenRouterGenerationParameters(options: OpenRouterGenerationOptions = {}) {
  const thinkingEnabled = options.thinkingEnabled ?? true;
  const reasoningMaxTokens = options.reasoningMaxTokens ?? null;
  const reasoning = !thinkingEnabled
    ? { effort: "none" as const }
    : reasoningMaxTokens !== null
      ? { max_tokens: reasoningMaxTokens }
      : { effort: options.reasoningEffort ?? "low" as const };
  return {
    max_tokens: options.maxTokens ?? 1600,
    reasoning,
  };
}
```

Make `buildOpenRouterStreamBody` spread this helper while retaining `model`, `messages`, `temperature: 0.2`, and `stream: true`. Keep the existing default three-argument behavior unchanged.

- [ ] **Step 4: Pass normalized settings through background and both clients**

Extend `OpenRouterConfig` in `src/services/openrouter/client.ts` with the three optional fields, use `buildOpenRouterGenerationParameters` in the non-streaming Hỏi AI body, and pass the same options to `buildOpenRouterStreamBody` in the streaming body. Leave the dictionary functions’ explicit `max_tokens: 1200` and `max_tokens: 900` untouched.

In `src/background/index.ts`, pass `settings.openRouterReasoningEffort`, `settings.openRouterReasoningMaxTokens`, and `settings.openRouterMaxTokens` in both the `handleAI` config and the streaming config.

- [ ] **Step 5: Add background contract checks and run tests**

Update `scripts/test-background-stream-contract.mjs` to require all three settings fields in the stream config. Add a source assertion in `scripts/test-openrouter-settings.mjs` that the non-streaming client uses `buildOpenRouterGenerationParameters`, so the fallback path cannot silently retain `700`.

Run:

```powershell
node --experimental-strip-types scripts/test-openrouter-settings.mjs
node --experimental-strip-types scripts/test-openrouter-stream.mjs
node --experimental-strip-types scripts/test-background-stream-contract.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit request mapping**

```powershell
git add -- src/services/openrouter/messages.ts src/services/openrouter/client.ts src/background/index.ts scripts/test-openrouter-settings.mjs scripts/test-openrouter-stream.mjs scripts/test-background-stream-contract.mjs
git commit -m "feat: apply OpenRouter reasoning budgets to AI requests"
```

### Task 3: Add Settings UI and persistence wiring

**Files:**
- Modify: `src/settings/App.tsx`
- Modify: `src/settings/sections/OpenRouterSection.tsx`
- Modify: `scripts/test-settings-persistence.mjs`
- Modify: `scripts/test-settings-layout.mjs`
- Modify: `scripts/test-settings-thinking.mjs`

**Interfaces:**
- Settings page edits `ExtensionSettings` only; no new storage key is introduced.
- `composeNext` persists `openRouterReasoningEffort`, `openRouterReasoningMaxTokens`, and `openRouterMaxTokens`.
- `OpenRouterSection` displays inline token-range and budget-order errors and uses the shared validation helper.

- [ ] **Step 1: Write failing Settings source assertions**

Extend `scripts/test-settings-persistence.mjs`’s required payload fields with:

```js
"openRouterReasoningEffort",
"openRouterReasoningMaxTokens",
"openRouterMaxTokens",
```

Extend `scripts/test-settings-thinking.mjs` with assertions for the new control ids and labels:

```js
assert.match(openRouterSource, /id="openrouter-reasoning-effort"/);
assert.match(openRouterSource, /id="openrouter-reasoning-budget"/);
assert.match(openRouterSource, /id="openrouter-max-output-tokens"/);
assert.match(openRouterSource, /Mức reasoning/);
assert.match(openRouterSource, /Reasoning budget/);
assert.match(openRouterSource, /Max output tokens/);
```

Extend `scripts/test-settings-layout.mjs` to require the OpenRouter source imports `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `OPENROUTER_MAX_OUTPUT_TOKENS`, and `OPENROUTER_REASONING_MAX_TOKENS`.

- [ ] **Step 2: Run Settings tests and verify they fail**

Run:

```powershell
npm run test:settings-persistence
npm run test:settings-thinking
npm run test:settings-layout
```

Expected: FAIL because the App payload and controls do not exist yet.

- [ ] **Step 3: Wire persistence and save validation in `App.tsx`**

Import `getOpenRouterSettingsValidationError`. Add the three fields to `composeNext` and restore them through the existing `settings` object in discard. Compute `settingsValidationError` from the current settings and disable the save button when it is non-null. In `handleSave`, reject invalid settings with `toast.error(settingsValidationError)` before sending `SAVE_SETTINGS`; retain the current successful acknowledgement flow.

- [ ] **Step 4: Implement the controls in `OpenRouterSection.tsx`**

Import the shared token constants, validation helper, and Radix Select primitives. Keep the existing reasoning Switch. Add:

```tsx
<Select
  value={settings.openRouterReasoningEffort}
  onValueChange={(openRouterReasoningEffort) => onSettingsChange({
    ...settings,
    openRouterReasoningEffort: openRouterReasoningEffort as ExtensionSettings["openRouterReasoningEffort"],
  })}
>
  <SelectTrigger id="openrouter-reasoning-effort"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="low">Low</SelectItem>
    <SelectItem value="medium">Medium</SelectItem>
    <SelectItem value="high">High</SelectItem>
  </SelectContent>
</Select>
```

Use controlled numeric inputs for exact reasoning budget and max output tokens. Keep draft strings locally so blank and incomplete input can be shown without storing `NaN`; update parent settings only for parsed numeric values or `null` for an intentionally blank reasoning budget. Show helper text with the exact allowed ranges, and show the shared validation error when the exact reasoning budget is not lower than output tokens. Keep the global save bar behavior unchanged.

- [ ] **Step 5: Run Settings tests and verify they pass**

Run:

```powershell
npm run test:settings-persistence
npm run test:settings-thinking
npm run test:settings-layout
```

Expected: PASS.

- [ ] **Step 6: Commit Settings UI and persistence**

```powershell
git add -- src/settings/App.tsx src/settings/sections/OpenRouterSection.tsx scripts/test-settings-persistence.mjs scripts/test-settings-layout.mjs scripts/test-settings-thinking.mjs
git commit -m "feat: expose OpenRouter reasoning controls in settings"
```

### Task 4: Regression verification and build

**Files:**
- Modify only if a test exposes an implementation defect: task-owned source/test files from Tasks 1–3.
- Do not stage unrelated existing changes or the untracked release ZIP.

**Interfaces:**
- The built extension must contain the new Settings labels, normalized defaults, request mapping, and existing stream truncation handling.

- [ ] **Step 1: Run the complete focused regression suite**

Run:

```powershell
npm run test:openrouter-stream
npm run test:background-stream
node --experimental-strip-types scripts/test-openrouter-settings.mjs
npm run test:settings-persistence
npm run test:settings-thinking
npm run test:settings-layout
npm run test:auto-ask
npm run test:content-script
```

Expected: every command exits with code 0. The content-script test may retain its existing external dictionary-audio warning while still passing its documented assertion.

- [ ] **Step 2: Run typecheck and production build**

Run `npm run build`.

Expected: TypeScript and both Vite builds pass. Existing Vite chunk-size warnings may remain non-fatal.

- [ ] **Step 3: Inspect the built artifact**

Run:

```powershell
rg -n "Mức reasoning|Reasoning budget|Max output tokens|openRouterReasoningMaxTokens|reasoning|max_tokens" dist
git status --short
```

Expected: built Settings and background bundles contain the new controls and request fields; unrelated pre-existing modifications remain unstaged.

- [ ] **Step 4: Commit any final task-owned verification fix**

If a source/test fix was required, stage only those exact files and run the affected test again before committing:

```powershell
git add -- src/shared/types.ts src/services/openrouter/messages.ts src/services/openrouter/client.ts src/background/index.ts src/settings/App.tsx src/settings/sections/OpenRouterSection.tsx scripts/test-openrouter-settings.mjs scripts/test-openrouter-stream.mjs scripts/test-background-stream-contract.mjs scripts/test-settings-persistence.mjs scripts/test-settings-layout.mjs scripts/test-settings-thinking.mjs
git commit -m "fix: verify OpenRouter reasoning settings integration"
```

If no fix is required, make no empty commit.

- [ ] **Step 5: Report completion honestly**

Summarize commits, tests, build result, exact behavior of the four controls, and the fact that unrelated worktree changes were preserved. Do not claim a live Chrome Settings interaction unless it was actually run.
