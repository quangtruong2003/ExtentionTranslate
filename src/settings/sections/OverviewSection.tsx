import { CheckCircle2, KeyRound, Languages, MousePointer2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SELECTION_TRIGGER_MODE_LABELS, SUPPORTED_TARGET_LANGUAGES, type ExtensionSettings } from "@/shared/types";
import type { SettingsSectionId } from "../navigation";

interface OverviewSectionProps {
  settings: ExtensionSettings;
  hasApiKey: boolean;
  onNavigate: (section: SettingsSectionId) => void;
}

export function OverviewSection({ settings, hasApiKey, onNavigate }: OverviewSectionProps) {
  const displayLanguage = SUPPORTED_TARGET_LANGUAGES.find((language) => language.value === settings.targetLanguage)?.label ?? settings.targetLanguage;

  return (
    <section aria-labelledby="overview-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle id="overview-section-title">Tổng quan</CardTitle>
          <CardDescription className="break-words">ExtentionTranslate giúp bạn tra nghĩa tiếng Anh và nhận giải thích từ AI ngay khi đọc web.</CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MousePointer2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Cách kích hoạt khi bôi đen
            </div>
            <p className="mt-2 break-words text-sm text-muted-foreground">{SELECTION_TRIGGER_MODE_LABELS[settings.selectionTriggerMode]}</p>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Languages className="h-4 w-4 text-primary" aria-hidden="true" />
              Ngôn ngữ hiển thị
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{displayLanguage}</p>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              Tự động hỏi AI
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{settings.autoAskAIOnPopup ? "Đang bật khi mở popup" : "Đang tắt"}</p>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              OpenRouter API key
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{hasApiKey ? "Đã cấu hình" : "Chưa cấu hình"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Đi đến phần cài đặt
          </CardTitle>
          <CardDescription>Chọn khu vực bạn muốn điều chỉnh.</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-wrap gap-2">
          <Button type="button" variant="outline" className="max-w-full whitespace-normal text-center" onClick={() => onNavigate("popup")}>Popup & Từ điển</Button>
          <Button type="button" variant="outline" className="max-w-full whitespace-normal text-center" onClick={() => onNavigate("openrouter")}>OpenRouter AI</Button>
          <Button type="button" variant="outline" className="max-w-full whitespace-normal text-center" onClick={() => onNavigate("about")}>Giới thiệu</Button>
        </CardContent>
      </Card>
    </section>
  );
}
