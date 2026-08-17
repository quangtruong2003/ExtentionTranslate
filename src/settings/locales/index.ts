import type { TargetLanguage } from "@/shared/types";
import type { SettingsCopy } from "./types.ts";
import { en } from "./en.ts";
import { vi } from "./vi.ts";
import { zhCN } from "./zh-CN.ts";

export type { SettingsCopy } from "./types.ts";

export const SETTINGS_LOCALES: Record<TargetLanguage, SettingsCopy> = {
  en,
  vi,
  "zh-CN": zhCN,
};

export function getSettingsCopy(language: TargetLanguage): SettingsCopy {
  return SETTINGS_LOCALES[language] ?? SETTINGS_LOCALES.en;
}
