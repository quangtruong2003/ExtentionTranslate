import { Languages, MousePointer2, Palette, Sparkles } from "lucide-react";
import { DictionaryPopup } from "@/components/dictionary/DictionaryPopup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SUPPORTED_TARGET_LANGUAGES, type DictionaryEntry, type ExtensionSettings, type SelectionTriggerMode, type ThemePreference } from "@/shared/types";
import { getSettingsCopy } from "../locales";
import { SettingRow } from "../SettingRow";

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

interface RadioOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

interface RadioCardGroupProps<T extends string> {
  name: string;
  options: ReadonlyArray<RadioOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

function RadioCardGroup<T extends string>({ name, options, value, onChange }: RadioCardGroupProps<T>) {
  return (
    <div className="grid min-w-0 gap-2">
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const active = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
              active ? "border-foreground bg-accent" : "border-border bg-background hover:bg-muted/50"
            }`}
          >
            <input
              id={id}
              name={name}
              type="radio"
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-1 block break-words text-xs leading-relaxed text-muted-foreground">{option.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

interface PopupDictionarySectionProps {
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
}

export function PopupDictionarySection({ settings, onSettingsChange }: PopupDictionarySectionProps) {
  const copy = getSettingsCopy(settings.targetLanguage);

  const TRIGGER_OPTIONS: ReadonlyArray<RadioOption<SelectionTriggerMode>> = [
    { value: "icon", label: copy.triggerIconLabel, description: copy.triggerIconDescription },
    { value: "popup", label: copy.triggerPopupLabel, description: copy.triggerPopupDescription },
    { value: "off", label: copy.triggerOffLabel, description: copy.triggerOffDescription },
  ];

  const THEME_OPTIONS: ReadonlyArray<RadioOption<ThemePreference>> = [
    { value: "auto", label: copy.themeAutoLabel, description: copy.themeAutoDescription },
    { value: "light", label: copy.themeLightLabel, description: copy.themeLightDescription },
    { value: "dark", label: copy.themeDarkLabel, description: copy.themeDarkDescription },
  ];

  return (
    <section aria-labelledby="popup-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <h2 id="popup-section-title" className="sr-only">{copy.popupHeading}</h2>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MousePointer2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {copy.selectionCardTitle}
          </CardTitle>
          <CardDescription>{copy.selectionCardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <RadioCardGroup
            name="selection-trigger-mode"
            options={TRIGGER_OPTIONS}
            value={settings.selectionTriggerMode}
            onChange={(selectionTriggerMode) => onSettingsChange({ ...settings, selectionTriggerMode })}
          />
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {copy.themeCardTitle}
          </CardTitle>
          <CardDescription>{copy.themeCardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <RadioCardGroup
            name="theme-preference"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => onSettingsChange({ ...settings, theme })}
          />

          <div className="border-t pt-5">
            <SettingRow
              id="target-lang"
              icon={Languages}
              title={copy.languageTitle}
              description={copy.languageDescription}
            >
              <Select
                value={settings.targetLanguage}
                onValueChange={(targetLanguage) => onSettingsChange({ ...settings, targetLanguage: targetLanguage as typeof settings.targetLanguage })}
              >
                <SelectTrigger id="target-lang" className="w-48 sm:w-56">
                  <SelectValue placeholder={copy.languagePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_TARGET_LANGUAGES.map((language) => (
                    <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {copy.aiCardTitle}
          </CardTitle>
          <CardDescription>{copy.aiCardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 divide-y">
          <SettingRow
            id="auto-ask-ai"
            title={copy.autoAskTitle}
            description={copy.autoAskDescription}
          >
            <Switch
              id="auto-ask-ai"
              checked={settings.autoAskAIOnPopup}
              onCheckedChange={(autoAskAIOnPopup) => onSettingsChange({ ...settings, autoAskAIOnPopup })}
            />
          </SettingRow>
          <SettingRow
            id="ai-context"
            title={copy.contextTitle}
            description={copy.contextDescription}
          >
            <Switch
              id="ai-context"
              checked={settings.includeSelectionContext}
              onCheckedChange={(includeSelectionContext) => onSettingsChange({ ...settings, includeSelectionContext })}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="text-base">{copy.previewTitle}</CardTitle>
          <CardDescription>{copy.previewDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="w-fit min-w-[340px] max-w-full overflow-x-auto rounded-lg">
            <DictionaryPopup
              word={PREVIEW_ENTRY.word}
              phase={{ kind: "ready", entry: PREVIEW_ENTRY }}
              aiLoading={false}
              aiRequested={false}
              aiThinkingEnabled={false}
              aiStopped={false}
              hasApiKey={false}
              autoAskAI={false}
              activeTab="dictionary"
              targetLanguage={settings.targetLanguage}
              onAskAI={() => {}}
              onOpenSettings={() => {}}
              onTabChange={() => {}}
              onRetryLookup={() => {}}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
