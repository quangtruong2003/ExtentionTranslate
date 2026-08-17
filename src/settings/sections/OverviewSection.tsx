import { ChevronRight, KeyRound, Languages, MousePointer2, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SELECTION_TRIGGER_MODE_LABELS, SUPPORTED_TARGET_LANGUAGES, type ExtensionSettings } from "@/shared/types";
import { getSettingsCopy } from "../locales";
import { getSettingsNavigation, type SettingsSectionId } from "../navigation";

interface OverviewSectionProps {
  settings: ExtensionSettings;
  hasApiKey: boolean;
  onNavigate: (section: SettingsSectionId) => void;
}

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  badge?: { text: string; tone: "positive" | "neutral" };
}

function StatTile({ icon: Icon, label, value, badge }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </span>
        {badge && (
          <Badge variant={badge.tone === "positive" ? "secondary" : "outline"} className="font-normal">
            {badge.text}
          </Badge>
        )}
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function OverviewSection({ settings, hasApiKey, onNavigate }: OverviewSectionProps) {
  const copy = getSettingsCopy(settings.targetLanguage);
  const displayLanguage = SUPPORTED_TARGET_LANGUAGES.find((language) => language.value === settings.targetLanguage)?.label ?? settings.targetLanguage;
  const quickLinks = getSettingsNavigation(copy).filter((item) => item.id !== "overview");

  return (
    <section aria-labelledby="overview-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <div>
        <h2 id="overview-section-title" className="sr-only">{copy.overviewHeading}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.overviewIntro}</p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <StatTile
          icon={MousePointer2}
          label={copy.statTriggerMode}
          value={SELECTION_TRIGGER_MODE_LABELS[settings.selectionTriggerMode]}
        />
        <StatTile icon={Languages} label={copy.statDisplayLanguage} value={displayLanguage} />
        <StatTile
          icon={Sparkles}
          label={copy.statAutoAsk}
          value={settings.autoAskAIOnPopup ? copy.statAutoAskOnValue : copy.statAutoAskOffValue}
          badge={{ text: settings.autoAskAIOnPopup ? copy.statAutoAskOnBadge : copy.statAutoAskOffBadge, tone: settings.autoAskAIOnPopup ? "positive" : "neutral" }}
        />
        <StatTile
          icon={KeyRound}
          label={copy.statOpenRouterKey}
          value={hasApiKey ? copy.statOpenRouterKeyConfigured : copy.statOpenRouterKeyMissing}
          badge={{ text: hasApiKey ? copy.statOpenRouterKeyReadyBadge : copy.statOpenRouterKeySetupBadge, tone: hasApiKey ? "positive" : "neutral" }}
        />
      </div>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="text-base">{copy.quickLinksTitle}</CardTitle>
          <CardDescription>{copy.quickLinksDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 p-0">
          <nav aria-label={copy.quickLinksTitle} className="divide-y border-t">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="group flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        </CardContent>
      </Card>
    </section>
  );
}
