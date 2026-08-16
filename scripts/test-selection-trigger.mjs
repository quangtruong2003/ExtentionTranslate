import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, normalizeSettings, toPopupSettings } from "../src/shared/types.ts";

const [typesSource, appSource, overviewSource, popupSettingsSource, contentSource] = await Promise.all([
  readFile(new URL("../src/shared/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/sections/OverviewSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/settings/sections/PopupDictionarySection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8"),
]);

const modes = ["icon", "popup", "off"];

assert.equal(DEFAULT_SETTINGS.selectionTriggerMode, "icon", "new installs default to the icon trigger");
assert.equal(normalizeSettings({}).selectionTriggerMode, "icon", "missing legacy settings migrate to icon mode");
assert.equal(
  normalizeSettings({ showPopupOnSelection: false }).selectionTriggerMode,
  "off",
  "legacy false migrates to off mode",
);
assert.equal(
  normalizeSettings({ showPopupOnSelection: true }).selectionTriggerMode,
  "icon",
  "legacy true migrates to icon mode",
);

for (const mode of modes) {
  assert.equal(
    normalizeSettings({ selectionTriggerMode: mode, showPopupOnSelection: mode === "off" }).selectionTriggerMode,
    mode,
    `explicit ${mode} mode wins over the legacy boolean`,
  );

  const popupSettings = toPopupSettings({
    ...DEFAULT_SETTINGS,
    selectionTriggerMode: mode,
  });
  assert.equal(popupSettings.selectionTriggerMode, mode, `popup settings preserve explicit ${mode} mode`);
}

assert.match(typesSource, /selectionTriggerMode/);
assert.match(typesSource, /selectionTriggerMode\s*:\s*settings\.selectionTriggerMode/);

const settingsSource = [appSource, overviewSource, popupSettingsSource].join("\n");
assert.match(settingsSource, /selectionTriggerMode/);
assert.match(appSource, /selectionTriggerMode:\s*settings\.selectionTriggerMode/);
assert.match(popupSettingsSource, /selectionTriggerMode/);

const declaredModeValues = new Set([
  ...[...settingsSource.matchAll(/(?:value|mode)\s*[:=]\s*["'](icon|popup|off)["']/g)].map((match) => match[1]),
  ...[...settingsSource.matchAll(/\[\s*["'](icon|popup|off)["']\s*,\s*["'][^"']+["']/g)].map((match) => match[1]),
]);
assert.deepEqual([...declaredModeValues].sort(), [...modes].sort(), "Settings exposes all three trigger mode values");

const labelDeclarations = [
  ...settingsSource.matchAll(/(?:label|aria-label|title)\s*[:=]\s*["'][^"']+["']/g),
  ...settingsSource.matchAll(/\[\s*["'](?:icon|popup|off)["']\s*,\s*["']([^"']+)["']/g),
];
assert.ok(labelDeclarations.length >= 3, "Settings exposes three user-facing mode labels");

function findModeBranch(source, mode) {
  const starts = [
    source.indexOf(`selectionTriggerMode === "${mode}"`),
    source.indexOf(`selectionTriggerMode === '${mode}'`),
    source.indexOf(`case "${mode}"`),
    source.indexOf(`case '${mode}'`),
  ].filter((index) => index >= 0);
  assert.ok(starts.length > 0, `selection flow has a ${mode} branch`);

  const start = Math.min(...starts);
  const nextBranches = modes
    .filter((candidate) => candidate !== mode)
    .flatMap((candidate) => [
      source.indexOf(`selectionTriggerMode === "${candidate}"`, start + 1),
      source.indexOf(`selectionTriggerMode === '${candidate}'`, start + 1),
      source.indexOf(`case "${candidate}"`, start + 1),
      source.indexOf(`case '${candidate}'`, start + 1),
    ])
    .filter((index) => index > start);
  const nextElse = source.indexOf("else", start + 1);
  const boundaries = [...nextBranches, ...(nextElse > start ? [nextElse] : [])];
  const end = boundaries.length > 0 ? Math.min(...boundaries) : source.length;
  return source.slice(start, end);
}

const selectionFlowStart = contentSource.indexOf("function onSelectionEvent");
const selectionFlowEnd = contentSource.indexOf("async function refreshSettings", selectionFlowStart);
assert.ok(selectionFlowStart >= 0 && selectionFlowEnd > selectionFlowStart, "selection flow remains a bounded contract surface");
const selectionFlow = contentSource.slice(selectionFlowStart, selectionFlowEnd);

assert.match(selectionFlow, /selectionTriggerMode/);
assert.match(contentSource, /selectionTriggerMode\s*(?:===|==)\s*["']icon["']/);
assert.match(contentSource, /(?:SelectionTrigger|selectionTrigger|selection-trigger)/);
assert.match(contentSource, /<button\b[^>]*aria-label=|role=["']button["']/);
assert.match(contentSource, /onPointerDown=\{[\s\S]*?preventDefault\(\)/, "trigger pointer-down preserves the captured selection");
assert.match(contentSource, /chrome\.runtime\.getURL\(\s*["']icons\/icon48\.png["']\s*\)/, "trigger uses the project icon asset");
assert.match(contentSource, /<img\b[\s\S]*?iconUrl|<img\b[\s\S]*?src=\{[^}]*icon/i, "trigger renders the project icon as an image");
assert.match(contentSource, /className=["'][^"']*\bh-9\s+w-9\b[^"']*["']/, "trigger keeps the 36x36 hit area");
assert.doesNotMatch(contentSource, /import\s*\{\s*BookOpen\s*\}\s*from\s*["']lucide-react["']/, "trigger no longer uses the Lucide BookOpen icon");
assert.doesNotMatch(
  contentSource,
  /className=["'][^"']*\brounded-full\b[^"']*\bborder\b[^"']*\bbg-background\b[^"']*\bshadow-lg\b[^"']*["']/,
  "trigger has no circular border, background, or shadow chrome",
);

const iconBranch = findModeBranch(selectionFlow, "icon");
assert.match(iconBranch, /(?:render|mount|show|set)[A-Za-z]*(?:Trigger|trigger)/);
assert.doesNotMatch(
  iconBranch,
  /openPopup\s*\(|sendMessage\s*\(|DICTIONARY_LOOKUP|DICTIONARY_TRANSLATE_REMOTE|AI_EXPLAIN/,
  "showing the icon must stay local and request-free",
);

assert.match(
  selectionFlow,
  /(?:selectionTriggerMode\s*(?:===|==)\s*["']popup["'][\s\S]{0,240}openPopup\s*\(|else\s+(?:void\s+)?openPopup\s*\(sel)/,
  "popup mode opens the existing popup",
);

const offBranch = findModeBranch(selectionFlow, "off");
assert.match(offBranch, /(?:return|closePopup|clear[A-Za-z]*Trigger)/);
assert.doesNotMatch(offBranch, /openPopup\s*\(|sendMessage\s*\(/);

const clickEvidence = contentSource.match(/(?:onClick|addEventListener\(\s*["']click["'])[^\n]{0,240}/g)?.join("\n") ?? "";
assert.match(clickEvidence, /(?:activate|openPopup|trigger)/i, "the trigger has an activation handler");
assert.match(contentSource, /(?:onClick|addEventListener\(\s*["']click["'])/);
assert.match(contentSource, /openPopup\s*\((?:currentSelectionInfo|selectionInfo|triggerSelectionInfo|info)/);
assert.doesNotMatch(clickEvidence, /getCurrentSelection\s*\(/, "trigger activation uses the captured snapshot");

const cleanupStart = contentSource.indexOf("function closePopup");
const cleanupEnd = contentSource.indexOf("function stopAIStream", cleanupStart);
assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, "popup and trigger cleanup share a bounded lifecycle surface");
const cleanupSource = contentSource.slice(cleanupStart, cleanupEnd);
assert.match(cleanupSource, /currentSelectionInfo\s*=\s*null/);
assert.match(cleanupSource, /(?:trigger|selectionTrigger|render\(null\)|unmountShadowHost)/i);
assert.match(cleanupSource, /(?:stopAIStream|stopDictionaryTranslation|abort\(\))/);

const invalidSelectionSource = contentSource.slice(
  contentSource.indexOf("if (!sel)", selectionFlowStart),
  contentSource.indexOf("return;", contentSource.indexOf("if (!sel)", selectionFlowStart)) + "return;".length,
);
assert.match(invalidSelectionSource, /(?:clear[A-Za-z]*Trigger|closePopup)\s*\(/, "clearing selection removes the trigger or popup");

const escapeSource = contentSource.slice(
  contentSource.indexOf("if (ev.key === \"Escape\")"),
  contentSource.indexOf("if (ev.key === \"Escape\")") + 180,
);
assert.match(escapeSource, /(?:clear[A-Za-z]*Trigger|closePopup)\s*\(/, "Escape cleans up the trigger or popup");

console.log("PASS: selection trigger mode normalization, Settings wiring, icon activation, and cleanup contracts are covered.");
