import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Sparkles, Trash2 } from "lucide-react";
import { ModelSelector } from "@/components/ModelSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_TYPES } from "@/shared/constants";
import {
  getOpenRouterSettingsValidationError,
  OPENROUTER_MAX_OUTPUT_TOKENS,
  OPENROUTER_REASONING_MAX_TOKENS,
  type ExtensionSettings,
} from "@/shared/types";
import { SettingRow } from "../SettingRow";
import { getSettingsCopy } from "../locales";

interface OpenRouterSectionProps {
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  showKey: boolean;
  onShowKeyChange: (value: boolean) => void;
  model: string;
  onModelChange: (value: string) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onResetSystemPrompt: () => void;
}

type KeyCheckState = "idle" | "checking" | "ok" | "error";

export function OpenRouterSection({
  settings,
  onSettingsChange,
  apiKey,
  onApiKeyChange,
  showKey,
  onShowKeyChange,
  model,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  onResetSystemPrompt,
}: OpenRouterSectionProps) {
  const [keyCheck, setKeyCheck] = useState<{ state: KeyCheckState; message?: string }>({ state: "idle" });
  const copy = getSettingsCopy(settings.targetLanguage);
  const [reasoningBudgetInput, setReasoningBudgetInput] = useState(
    settings.openRouterReasoningMaxTokens === null ? "" : String(settings.openRouterReasoningMaxTokens),
  );
  const [maxOutputTokensInput, setMaxOutputTokensInput] = useState(String(settings.openRouterMaxTokens));

  useEffect(() => {
    setKeyCheck({ state: "idle" });
  }, [apiKey]);

  useEffect(() => {
    setReasoningBudgetInput(settings.openRouterReasoningMaxTokens === null ? "" : String(settings.openRouterReasoningMaxTokens));
    setMaxOutputTokensInput(String(settings.openRouterMaxTokens));
  }, [settings.openRouterReasoningMaxTokens, settings.openRouterMaxTokens]);

  const parsedReasoningBudget = reasoningBudgetInput.trim() === "" ? null : Number(reasoningBudgetInput);
  const parsedMaxOutputTokens = Number(maxOutputTokensInput);
  const tokenValidationError = getOpenRouterSettingsValidationError({
    openRouterReasoningMaxTokens: parsedReasoningBudget,
    openRouterMaxTokens: parsedMaxOutputTokens,
  });

  function updateReasoningBudget(value: string) {
    setReasoningBudgetInput(value);
    if (value.trim() === "") {
      onSettingsChange({ ...settings, openRouterReasoningMaxTokens: null });
      return;
    }
    const parsed = Number(value);
    if (Number.isInteger(parsed)) onSettingsChange({ ...settings, openRouterReasoningMaxTokens: parsed });
  }

  function updateMaxOutputTokens(value: string) {
    setMaxOutputTokensInput(value);
    if (value.trim() === "") return;
    const parsed = Number(value);
    if (Number.isInteger(parsed)) onSettingsChange({ ...settings, openRouterMaxTokens: parsed });
  }

  async function handleCheckKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setKeyCheck({ state: "checking" });
    try {
      const response = await new Promise<{ ok?: boolean; payload?: { models?: unknown[] } }>((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: MESSAGE_TYPES.GET_MODELS, payload: { apiKey: trimmed } },
            (reply) => resolve(reply as { ok?: boolean; payload?: { models?: unknown[] } }),
          );
        } catch {
          resolve({});
        }
      });
      const count = Array.isArray(response?.payload?.models) ? response.payload!.models!.length : 0;
      if (response?.ok && count > 0) {
        setKeyCheck({ state: "ok", message: copy.keyCheckOk.replace("{count}", String(count)) });
      } else {
        setKeyCheck({ state: "error", message: copy.keyCheckFailed });
      }
    } catch {
      setKeyCheck({ state: "error", message: copy.keyCheckError });
    }
  }

  return (
    <section aria-labelledby="openrouter-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <h2 id="openrouter-section-title" className="sr-only">{copy.openrouterHeading}</h2>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {copy.connectionCardTitle}
          </CardTitle>
          <CardDescription>
            {copy.connectionCardDescriptionLead}{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="font-medium underline hover:text-foreground">openrouter.ai/keys</a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-sm font-medium">{copy.openRouterKeyLabel}</Label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="relative w-full min-w-0 flex-1">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  placeholder={copy.openRouterKeyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => onShowKeyChange(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showKey ? copy.hideKeyAria : copy.showKeyAria}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onApiKeyChange("")} disabled={!apiKey}>{copy.clearKey}</Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void handleCheckKey()}
                disabled={!apiKey.trim() || keyCheck.state === "checking"}
              >
                {keyCheck.state === "checking" ? copy.checkingKey : copy.checkKey}
              </Button>
            </div>
            {keyCheck.state !== "idle" && keyCheck.state !== "checking" && (
              <p className={`text-xs ${keyCheck.state === "ok" ? "text-emerald-600" : "text-destructive"}`}>
                {keyCheck.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{copy.openRouterKeyNote}</p>
          </div>

          <div className="min-w-0 space-y-2 border-t pt-5" role="group" aria-labelledby="model-label">
            <Label id="model-label" className="text-sm font-medium">{copy.modelLabel}</Label>
            <ModelSelector value={model} onChange={onModelChange} apiKey={apiKey} />
            <p className="text-xs text-muted-foreground">{copy.modelHint}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {copy.behaviorCardTitle}
          </CardTitle>
          <CardDescription>{copy.behaviorCardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <div className="divide-y">
            <SettingRow
              id="openrouter-thinking"
              title={copy.thinkingTitle}
              description={copy.thinkingDescription}
            >
              <Switch
                id="openrouter-thinking"
                checked={settings.openRouterThinkingEnabled}
                onCheckedChange={(openRouterThinkingEnabled) => onSettingsChange({ ...settings, openRouterThinkingEnabled })}
              />
            </SettingRow>
          </div>

          <div className="space-y-4 border-t pt-5">
            <SettingRow
              id="openrouter-reasoning-effort"
              title={copy.reasoningEffortTitle}
              description={copy.reasoningEffortDescription}
            >
              <Select
                value={settings.openRouterReasoningEffort}
                onValueChange={(openRouterReasoningEffort) => onSettingsChange({
                  ...settings,
                  openRouterReasoningEffort: openRouterReasoningEffort as ExtensionSettings["openRouterReasoningEffort"],
                })}
              >
                <SelectTrigger id="openrouter-reasoning-effort" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="openrouter-reasoning-budget" className="text-sm font-medium">{copy.reasoningBudgetLabel}</Label>
                <Input
                  id="openrouter-reasoning-budget"
                  type="number"
                  min={OPENROUTER_REASONING_MAX_TOKENS.min}
                  max={OPENROUTER_REASONING_MAX_TOKENS.max}
                  step={1}
                  inputMode="numeric"
                  value={reasoningBudgetInput}
                  onChange={(event) => updateReasoningBudget(event.target.value)}
                  placeholder={copy.reasoningBudgetPlaceholder}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">{copy.reasoningBudgetHint}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openrouter-max-output-tokens" className="text-sm font-medium">{copy.maxTokensLabel}</Label>
                <Input
                  id="openrouter-max-output-tokens"
                  type="number"
                  min={OPENROUTER_MAX_OUTPUT_TOKENS.min}
                  max={OPENROUTER_MAX_OUTPUT_TOKENS.max}
                  step={1}
                  inputMode="numeric"
                  value={maxOutputTokensInput}
                  onChange={(event) => updateMaxOutputTokens(event.target.value)}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">{copy.maxTokensHint}</p>
              </div>
            </div>

            {tokenValidationError && (
              <p role="alert" className="text-xs text-destructive">{tokenValidationError}</p>
            )}
          </div>

          <div className="space-y-2 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="system-prompt" className="text-sm font-medium">{copy.systemPromptLabel}</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onResetSystemPrompt}>
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                {copy.resetSystemPrompt}
              </Button>
            </div>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(event) => onSystemPromptChange(event.target.value)}
              rows={10}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{copy.systemPromptHint}</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
