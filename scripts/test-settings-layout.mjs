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
assert.match(appSource, /sticky/);
assert.match(sidebarSource, /aria-current/);

for (const id of ["overview", "popup", "openrouter", "about"]) {
  assert.match(navigationSource, new RegExp(id));
}

for (const section of ["OverviewSection", "PopupDictionarySection", "OpenRouterSection", "AboutSection"]) {
  assert.match(appSource, new RegExp(`<${section}`));
}

assert.match(appSource, /<header[^>]*sticky[\s\S]*?onClick=\{handleSave\}/);
assert.doesNotMatch(appSource, /hidden text-sm text-(?:destructive|emerald-600) sm:inline/);
assert.match(sidebarSource, /h-12[\s\S]*lg:hidden/);
assert.match(appSource, /<header[^>]*sticky top-12[\s\S]*lg:top-0/);
assert.doesNotMatch(appSource, /top-\[49px\]/);
assert.match(appSource, /className="min-h-screen w-full max-w-full overflow-x-hidden/);
assert.match(appSource, /className="mx-auto flex min-h-screen w-full min-w-0 max-w-full overflow-x-hidden[^"]*lg:max-w-7xl/);
assert.match(appSource, /<main className="w-full min-w-0 max-w-full flex-1">/);
assert.match(appSource, /className="mx-auto w-full min-w-0 max-w-full[^"]*lg:max-w-4xl/);
assert.match(sidebarSource, /className="sticky top-0[^"]*h-12 w-full min-w-0 max-w-full[^"]*overflow-x-auto[^"]*overflow-y-hidden[^"]*lg:hidden"/);
assert.match(sidebarSource, /overflow-x-auto[^"\n]*\[scrollbar-width:none\][^"\n]*\[&::\-webkit-scrollbar\]:hidden/);
assert.match(appSource, /<Button[\s\S]*?size="icon"[\s\S]*?aria-label=\{saveState === "saving" \? "Đang lưu cài đặt" : "Lưu cài đặt"\}[\s\S]*?<span className="sr-only sm:not-sr-only">/);
assert.doesNotMatch(appSource, /BookOpen/);
assert.match(overviewSource, /Tổng quan/);
assert.match(popupSource, /selectionTriggerMode/);
for (const mode of ["icon", "popup", "off"]) {
  assert.match(popupSource, /selection-trigger-\$\{mode\}/);
}
assert.match(openRouterSource, /ModelSelector/);
assert.match(aboutSource, /dictionaryapi\.dev/);

for (const sectionSource of [overviewSource, popupSource, openRouterSource, aboutSource]) {
  assert.match(sectionSource, /<section[^>]*className="w-full min-w-0 max-w-full/);
  assert.match(sectionSource, /<Card className="min-w-0 max-w-full">/);
}

assert.equal([...overviewSource.matchAll(/className="max-w-full whitespace-normal text-center"/g)].length, 3);
assert.match(popupSource, /<fieldset/);
assert.match(popupSource, /Khi bôi đen văn bản/);
assert.match(popupSource, /type="radio"/);
assert.match(openRouterSource, /className="flex min-w-0 flex-col gap-2 sm:flex-row"/);
assert.match(openRouterSource, /className="flex flex-wrap items-center justify-between gap-3"/);

console.log("PASS: settings shell exposes responsive navigation, sticky save access, and all section owners.");
