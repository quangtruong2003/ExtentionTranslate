import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readSettingsSource(path) {
  try {
    return await readFile(new URL(path, import.meta.url), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return `MISSING: ${path}`;
    }
    throw error;
  }
}

const [appSource, sidebarSource, navigationSource, overviewSource, popupSource, openRouterSource, aboutSource] = await Promise.all([
  readSettingsSource("../src/settings/App.tsx"),
  readSettingsSource("../src/settings/SettingsSidebar.tsx"),
  readSettingsSource("../src/settings/navigation.ts"),
  readSettingsSource("../src/settings/sections/OverviewSection.tsx"),
  readSettingsSource("../src/settings/sections/PopupDictionarySection.tsx"),
  readSettingsSource("../src/settings/sections/OpenRouterSection.tsx"),
  readSettingsSource("../src/settings/sections/AboutSection.tsx"),
]);

assert.match(appSource, /SettingsSidebar/);
assert.match(appSource, /icons\/icon48\.png/);
assert.match(sidebarSource, /aria-current/);

for (const id of ["overview", "popup", "openrouter", "about"]) {
  assert.match(navigationSource, new RegExp(id));
}

for (const section of ["OverviewSection", "PopupDictionarySection", "OpenRouterSection", "AboutSection"]) {
  assert.match(appSource, new RegExp(`<${section}`));
}

// Sticky save bar pinned to the bottom, shown only while dirty.
assert.match(appSource, /isDirty && \(\s*<div className="fixed inset-x-0 bottom-0/);
assert.match(appSource, /onClick=\{handleSave\}/);
assert.match(appSource, /onClick=\{handleDiscard\}/);
assert.doesNotMatch(appSource, /hidden text-sm text-(?:destructive|emerald-600) sm:inline/);
assert.match(sidebarSource, /h-12[\s\S]*lg:hidden/);
assert.doesNotMatch(appSource, /top-\[49px\]/);
assert.match(appSource, /className="min-h-screen w-full max-w-full overflow-x-clip/);
assert.match(appSource, /className="mx-auto flex min-h-screen w-full min-w-0 max-w-full overflow-x-clip[^"]*lg:max-w-7xl/);
assert.doesNotMatch(appSource, /overflow-x-hidden/);
assert.match(appSource, /<main className="w-full min-w-0 max-w-full flex-1">/);
assert.match(appSource, /className="mx-auto w-full min-w-0 max-w-full[^"]*lg:max-w-4xl/);
assert.match(sidebarSource, /className="sticky top-0 z-30 flex h-12 w-full min-w-0 max-w-full[^"]*overflow-x-auto[^"]*overflow-y-hidden[^"]*lg:hidden"/);
assert.match(sidebarSource, /overflow-x-auto[^"\n]*\[scrollbar-width:none\][^"\n]*\[&::\-webkit-scrollbar\]:hidden/);
assert.match(sidebarSource, /sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r bg-background lg:flex/);
assert.match(sidebarSource, /Phiên bản/);
assert.doesNotMatch(appSource, /BookOpen/);
assert.match(overviewSource, /Tổng quan/);
assert.match(popupSource, /selectionTriggerMode/);
assert.match(popupSource, /name="selection-trigger-mode"/);
for (const mode of ["icon", "popup", "off"]) {
  assert.match(popupSource, new RegExp(`value: "${mode}"`));
}
assert.match(openRouterSource, /ModelSelector/);
assert.match(aboutSource, /dictionaryapi\.dev/);

for (const sectionSource of [overviewSource, popupSource, openRouterSource, aboutSource]) {
  assert.match(sectionSource, /<section[^>]*className="w-full min-w-0 max-w-full/);
  assert.match(sectionSource, /<Card className="min-w-0 max-w-full">/);
}

// Overview quick links render every non-overview section as a row button.
assert.match(overviewSource, /SETTINGS_NAVIGATION\.filter\(\(item\) => item\.id !== "overview"\)/);
assert.match(overviewSource, /onNavigate\(item\.id\)/);
assert.match(popupSource, /RadioCardGroup/);
assert.match(popupSource, /Khi bôi đen văn bản/);
assert.match(popupSource, /type="radio"/);
assert.match(popupSource, /includeSelectionContext/);
assert.match(popupSource, /id="ai-context"/);
assert.match(popupSource, /Gửi ngữ cảnh xung quanh cho AI/);
assert.match(popupSource, /popup-preview-theme/);
assert.match(openRouterSource, /className="flex min-w-0 flex-col gap-2 sm:flex-row"/);
assert.match(openRouterSource, /className="flex flex-wrap items-center justify-between gap-3"/);
for (const importName of [
  "Select",
  "SelectContent",
  "SelectItem",
  "SelectTrigger",
  "SelectValue",
  "OPENROUTER_MAX_OUTPUT_TOKENS",
  "OPENROUTER_REASONING_MAX_TOKENS",
]) {
  assert.match(openRouterSource, new RegExp(`\\b${importName}\\b`));
}

console.log("PASS: settings shell exposes responsive navigation, sticky save bar, and all section owners.");
