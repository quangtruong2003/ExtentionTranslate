import { useState } from "react";
import { Check, Copy, RefreshCcw, Sparkles, Volume2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { speakPronunciation } from "@/services/dictionary/pronunciation";
import type { TargetLanguage } from "@/shared/types";
import type { PopupPhase } from "./DictionaryPopup";
import { getPopupCopy } from "./copy";

interface Props {
  phase: Extract<PopupPhase,
    | { kind: "translation-loading" }
    | { kind: "translation-ready" }
    | { kind: "translation-error" }
  >;
  targetLanguage: TargetLanguage;
  hasApiKey: boolean;
  onRetry: () => void;
  onAskAI: () => void;
}

export function TextTranslationPanel({ phase, targetLanguage, hasApiKey, onRetry, onAskAI }: Props) {
  const labels = getPopupCopy(targetLanguage);
  const [copiedTranslation, setCopiedTranslation] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const errorText = phase.kind === "translation-error" && phase.code === "TRANSLATOR_UNAVAILABLE"
    ? labels.translatorUnavailable
    : labels.translationFailed;

  async function copyToClipboard(text: string, markCopied: (value: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      markCopied(true);
      window.setTimeout(() => markCopied(false), 1600);
    } catch {
      toast.error(labels.copyFailed);
    }
  }

  const targetSpeechLang = targetLanguage === "vi" ? "vi-VN" : targetLanguage === "zh-CN" ? "zh-CN" : "en-US";

  function speak(text: string, lang: string) {
    void speakPronunciation({ text, lang }).catch(() => toast.error(labels.audioFailed));
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden p-4">
      {phase.kind === "translation-ready" && (
        <section className="min-w-0 rounded-lg border bg-primary/5 p-3">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{labels.translatedText}</h3>
              {phase.provider === "browser" && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {labels.browserTranslationBadge}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={labels.speakTranslation}
                onClick={() => speak(phase.translatedText, targetSpeechLang)}
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={labels.copyTranslation}
                onClick={() => void copyToClipboard(phase.translatedText, setCopiedTranslation)}
              >
                {copiedTranslation ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            </div>
          </div>
          <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6">{phase.translatedText}</p>
        </section>
      )}

      {phase.kind === "translation-loading" && (
        <section className="min-w-0 rounded-lg border bg-primary/5 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            {labels.translationPreparing}
          </div>
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-8/12" />
            <Skeleton className="h-4 w-9/12" />
          </div>
        </section>
      )}

      {phase.kind === "translation-error" && (
        <Alert variant="destructive" className="min-w-0">
          <AlertTitle>{labels.translationTab}</AlertTitle>
          <AlertDescription>{errorText}</AlertDescription>
        </Alert>
      )}

      <section className="min-w-0 rounded-lg border bg-background p-3">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{labels.originalText}</h3>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={labels.speakOriginal}
              onClick={() => speak(phase.sourceText, "en-US")}
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={labels.copyOriginal}
              onClick={() => void copyToClipboard(phase.sourceText, setCopiedOriginal)}
            >
              {copiedOriginal ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
          </div>
        </div>
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
          {phase.sourceText}
        </p>
      </section>

      {phase.kind === "translation-error" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            {labels.retry}
          </Button>
          {hasApiKey && (
            <Button type="button" size="sm" onClick={onAskAI} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {labels.askAI}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
