import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TOEIC_QUIZ_INTERVAL, TOEIC_QUIZ_QUESTIONS, type ExtensionSettings } from "@/shared/types";
import { getSettingsCopy } from "../locales";
import { SettingRow } from "../SettingRow";

interface ToeicQuizSectionProps {
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
}

export function ToeicQuizSection({ settings, onSettingsChange }: ToeicQuizSectionProps) {
  const copy = getSettingsCopy(settings.targetLanguage);

  return (
    <section className="min-w-0 max-w-full space-y-6">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {copy.toeicHeading}
          </CardTitle>
          <CardDescription>{copy.toeicEnableDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 divide-y">
          <SettingRow
            id="toeic-quiz-enabled"
            title={copy.toeicEnableTitle}
            description={copy.toeicEnableDescription}
          >
            <Switch
              id="toeic-quiz-enabled"
              checked={settings.toeicQuizEnabled}
              onCheckedChange={(toeicQuizEnabled) => onSettingsChange({ ...settings, toeicQuizEnabled })}
            />
          </SettingRow>

          <SettingRow
            id="toeic-quiz-interval"
            title={copy.toeicIntervalTitle}
            description={copy.toeicIntervalDescription}
          >
            <div className="flex items-center gap-2">
              <input
                id="toeic-quiz-interval"
                type="number"
                min={TOEIC_QUIZ_INTERVAL.min}
                max={TOEIC_QUIZ_INTERVAL.max}
                value={settings.toeicQuizIntervalMinutes}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10);
                  if (!Number.isNaN(value)) {
                    onSettingsChange({
                      ...settings,
                      toeicQuizIntervalMinutes: Math.max(TOEIC_QUIZ_INTERVAL.min, Math.min(TOEIC_QUIZ_INTERVAL.max, value)),
                    });
                  }
                }}
                className="h-8 w-20 rounded-md border bg-background px-2 text-center text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-sm text-muted-foreground">{copy.toeicIntervalSuffix}</span>
            </div>
          </SettingRow>

          <SettingRow
            id="toeic-quiz-count"
            title={copy.toeicCountTitle}
            description={copy.toeicCountDescription}
          >
            <div className="flex items-center gap-2">
              <input
                id="toeic-quiz-count"
                type="number"
                min={TOEIC_QUIZ_QUESTIONS.min}
                max={TOEIC_QUIZ_QUESTIONS.max}
                value={settings.toeicQuizQuestionCount}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10);
                  if (!Number.isNaN(value)) {
                    onSettingsChange({
                      ...settings,
                      toeicQuizQuestionCount: Math.max(TOEIC_QUIZ_QUESTIONS.min, Math.min(TOEIC_QUIZ_QUESTIONS.max, value)),
                    });
                  }
                }}
                className="h-8 w-20 rounded-md border bg-background px-2 text-center text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-sm text-muted-foreground">{copy.toeicCountSuffix}</span>
            </div>
          </SettingRow>

          <p className="pt-4 text-xs text-muted-foreground">{copy.toeicTimeNote}</p>
        </CardContent>
      </Card>
    </section>
  );
}
