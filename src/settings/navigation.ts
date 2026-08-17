import { BookMarked, BookText, Info, LayoutDashboard, Sparkles, type LucideIcon } from "lucide-react";
import type { SettingsCopy } from "./locales";

export type SettingsSectionId = "overview" | "popup" | "openrouter" | "vocabulary" | "about";

export interface SettingsNavigationItem {
  id: SettingsSectionId;
  icon: LucideIcon;
  title: string;
  description: string;
}

export function getSettingsNavigation(copy: SettingsCopy): SettingsNavigationItem[] {
  return [
    { id: "overview", icon: LayoutDashboard, title: copy.navOverviewTitle, description: copy.navOverviewDescription },
    { id: "popup", icon: BookText, title: copy.navPopupTitle, description: copy.navPopupDescription },
    { id: "openrouter", icon: Sparkles, title: copy.navOpenRouterTitle, description: copy.navOpenRouterDescription },
    { id: "vocabulary", icon: BookMarked, title: copy.navVocabularyTitle, description: copy.navVocabularyDescription },
    { id: "about", icon: Info, title: copy.navAboutTitle, description: copy.navAboutDescription },
  ];
}
