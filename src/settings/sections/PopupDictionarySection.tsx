import { Languages, MousePointer2, Sparkles } from "lucide-react";
import { DictionaryPopup } from "@/components/dictionary/DictionaryPopup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SUPPORTED_TARGET_LANGUAGES, type DictionaryEntry, type ExtensionSettings, type SelectionTriggerMode } from "@/shared/types";

const PREVIEW_ENTRY: DictionaryEntry = {
  word: "beautiful",
  phonetics: { uk: "/ˈbjuːtɪfl/", us: "/ˈbjuːtɪfl/" },
  wordForms: ["beautiful", "more beautiful", "most beautiful"],
  meanings: [
    {
      partOfSpeech: "adjective",
      cefr: "A2",
      definition: "Having qualities that delight the senses or please the mind.",
      translation: "đẹp, xinh đẹp",
      examples: ["The garden looks beautiful in spring.", "She has a beautiful voice."],
      phrases: [{ phrase: "beautiful day" }],
      synonyms: ["lovely", "pretty", "gorgeous"],
    },
  ],
  source: "free-api",
};

interface PopupDictionarySectionProps {
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
}

export function PopupDictionarySection({ settings, onSettingsChange }: PopupDictionarySectionProps) {
  return (
    <section aria-labelledby="popup-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle id="popup-section-title">Popup & Từ điển</CardTitle>
          <CardDescription className="break-words">Tùy chỉnh cách tiện ích tra từ khi bạn bôi đen nội dung trên website.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <fieldset className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-4">
            <legend className="flex items-center gap-2 px-1 text-sm font-medium">
              <MousePointer2 className="h-4 w-4" aria-hidden="true" />
              Khi bôi đen văn bản
            </legend>
            <p className="text-xs leading-relaxed text-muted-foreground">Chọn cách tiện ích phản hồi sau khi bạn bôi đen một từ hoặc cụm từ.</p>
            <div className="grid min-w-0 gap-2">
              {([
                ["icon", "Hiện icon cạnh vùng chọn", "Bấm icon để mở popup khi bạn cần xem nghĩa."] as const,
                ["popup", "Mở popup ngay khi bôi đen", "Tra từ ngay lập tức sau khi vùng chọn được xác nhận."] as const,
                ["off", "Tắt thao tác khi bôi đen", "Không hiện icon hoặc popup trên website."] as const,
              ] satisfies ReadonlyArray<[SelectionTriggerMode, string, string]>).map(([mode, label, description]) => (
                <label
                  key={mode}
                  htmlFor={`selection-trigger-${mode}`}
                  className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-muted-foreground/50 p-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
                    settings.selectionTriggerMode === mode ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50"
                  }`}
                >
                  <input
                    id={`selection-trigger-${mode}`}
                    name="selection-trigger-mode"
                    type="radio"
                    value={mode}
                    checked={settings.selectionTriggerMode === mode}
                    onChange={() => onSettingsChange({ ...settings, selectionTriggerMode: mode })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="mt-1 block break-words text-xs leading-relaxed text-muted-foreground">{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="target-lang" className="flex items-center gap-2 text-sm font-medium">
              <Languages className="h-4 w-4" aria-hidden="true" />
              Ngôn ngữ hiển thị
            </Label>
            <Select
              value={settings.targetLanguage}
              onValueChange={(targetLanguage) => onSettingsChange({ ...settings, targetLanguage: targetLanguage as typeof settings.targetLanguage })}
            >
              <SelectTrigger id="target-lang" className="w-full sm:w-64">
                <SelectValue placeholder="Chọn ngôn ngữ" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_TARGET_LANGUAGES.map((language) => (
                  <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="break-words text-xs leading-relaxed text-muted-foreground">
              Kết quả trong tab Từ điển lấy dữ liệu gốc từ dictionaryapi.dev, ưu tiên dịch ngay trên Chrome/Edge; nếu không khả dụng sẽ thử{" "}
              <a href="https://freedictionaryapi.com/api/v1" target="_blank" rel="noreferrer" className="underline hover:text-foreground">FreeDictionaryAPI.com</a>{" "}
              rồi mới đến OpenRouter.
            </p>
          </div>

          <div className="flex min-w-0 items-start justify-between gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="auto-ask-ai" className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Tự động hỏi AI khi mở popup
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">Mỗi popup mới sẽ hỏi AI một lần nếu đã có OpenRouter API key. Tắt mặc định để tránh phát sinh chi phí ngoài ý muốn.</p>
            </div>
            <Switch
              id="auto-ask-ai"
              checked={settings.autoAskAIOnPopup}
              onCheckedChange={(autoAskAIOnPopup) => onSettingsChange({ ...settings, autoAskAIOnPopup })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>Xem trước popup</CardTitle>
          <CardDescription>Bản xem trước hiển thị theo ngôn ngữ bạn chọn ở trên.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="w-fit min-w-[340px] max-w-full overflow-x-auto">
            <DictionaryPopup
              word={PREVIEW_ENTRY.word}
              phase={{ kind: "ready", entry: PREVIEW_ENTRY }}
              aiLoading={false}
              aiRequested={false}
              aiThinkingEnabled={false}
              hasApiKey={false}
              activeTab="dictionary"
              targetLanguage={settings.targetLanguage}
              onAskAI={() => {}}
              onOpenSettings={() => {}}
              onTabChange={() => {}}
              onRetryLookup={() => {}}
              onClose={() => {}}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
