import { BookText, Info, LayoutDashboard, Sparkles, type LucideIcon } from "lucide-react";

export type SettingsSectionId = "overview" | "popup" | "openrouter" | "about";

export interface SettingsNavigationItem {
  id: SettingsSectionId;
  icon: LucideIcon;
  title: string;
  description: string;
}

export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
  {
    id: "overview",
    icon: LayoutDashboard,
    title: "Tổng quan",
    description: "Xem nhanh trạng thái tiện ích.",
  },
  {
    id: "popup",
    icon: BookText,
    title: "Popup & Từ điển",
    description: "Điều chỉnh tra từ khi bôi đen.",
  },
  {
    id: "openrouter",
    icon: Sparkles,
    title: "OpenRouter AI",
    description: "Quản lý AI, model và hướng dẫn trả lời.",
  },
  {
    id: "about",
    icon: Info,
    title: "Giới thiệu",
    description: "Nguồn dữ liệu, quyền riêng tư và hỗ trợ.",
  },
];
