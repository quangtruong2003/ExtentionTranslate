import { useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DictionaryHeader } from "./DictionaryHeader";
import { MeaningSection } from "./MeaningSection";
import { DictionarySkeleton } from "./DictionarySkeleton";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";
import { AISection } from "./AISection";
import { PopupTabs, type PopupTab } from "./PopupTabs";
import { TextTranslationPanel } from "./TextTranslationPanel";
import type { DictionaryEntry, TargetLanguage, TranslationStatus } from "@/shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getPopupCopy } from "./copy";

export type PopupPhase =
  | { kind: "loading" }
  | { kind: "ready"; entry: DictionaryEntry }
  | { kind: "error"; code: string }
  | { kind: "empty" }
  | { kind: "translation-loading"; sourceText: string }
  | { kind: "translation-ready"; sourceText: string; translatedText: string; provider: "browser" | "source" }
  | { kind: "translation-error"; sourceText: string; code: "TRANSLATOR_UNAVAILABLE" | "TRANSLATION_FAILED" };

interface Props {
  word: string;
  phase: PopupPhase;
  aiLoading: boolean;
  aiRequested: boolean;
  aiError?: string;
  aiStreamText?: string;
  aiThinkingText?: string;
  aiThinkingEnabled: boolean;
  hasApiKey: boolean;
  activeTab: PopupTab;
  targetLanguage: TargetLanguage;
  translationStatus?: TranslationStatus;
  onAskAI: () => void;
  onTabChange: (tab: PopupTab) => void;
  onRetryLookup: () => void;
}

export function DictionaryPopup(props: Props) {
  const {
    word,
    phase,
    aiLoading,
    aiRequested,
    aiError,
    aiStreamText,
    aiThinkingText,
    aiThinkingEnabled,
    hasApiKey,
    activeTab,
    targetLanguage,
    translationStatus,
    onAskAI,
    onTabChange,
    onRetryLookup,
  } = props;
  const labels = getPopupCopy(targetLanguage);
  const rootRef = useRef<HTMLDivElement>(null);
  const isTranslationPhase = phase.kind === "translation-loading" || phase.kind === "translation-ready" || phase.kind === "translation-error";

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <div
        ref={rootRef}
        tabIndex={-1}
        className="flex min-w-0 max-h-[min(680px,calc(100vh-24px))] w-full max-w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-fade-in"
        role="dialog"
        aria-label={isTranslationPhase ? labels.translationDialogLabel(word) : labels.dialogLabel(word)}
      >
      {phase.kind === "ready" && (
        <>
          <DictionaryHeader
            entry={phase.entry}
            onAskAI={onAskAI}
            aiLoading={aiLoading}
            aiDone={Boolean(aiStreamText)}
            targetLanguage={targetLanguage}
          />
          <Separator />
        </>
      )}

      <PopupTabs
        activeTab={activeTab}
        aiLoading={aiLoading}
        targetLanguage={targetLanguage}
        primaryLabel={isTranslationPhase ? labels.translationTab : undefined}
        onChange={onTabChange}
      />

      {activeTab === "dictionary" && (
        <div
          id="popup-panel-dictionary"
          className="min-w-0 max-w-full overflow-hidden"
          role="tabpanel"
          aria-label={isTranslationPhase ? labels.translationTab : labels.dictionaryTab}
        >
          {phase.kind === "loading" && (
            <>
              <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
                <div className="space-y-1">
                  <div className="text-lg font-semibold tracking-tight">{word}</div>
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <DictionarySkeleton />
            </>
          )}

          {phase.kind === "ready" && (
            <ScrollArea className="max-h-[min(600px,calc(100vh-180px))]">
              {translationStatus === "translating" && (
                <div className="border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                  {labels.translating}
                </div>
              )}
              {translationStatus === "partial" && (
                <div className="border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                  {labels.partial}
                </div>
              )}
              {translationStatus === "fallback" && (
                <div className="border-b bg-amber-500/10 px-4 py-2 text-xs text-muted-foreground">
                  {labels.fallback}
                </div>
              )}
              <div>
                {phase.entry.meanings.map((m, i) => (
                  <MeaningSection key={i} meaning={m} word={phase.entry.word} targetLanguage={targetLanguage} />
                ))}
              </div>
            </ScrollArea>
          )}

          {phase.kind === "error" && (
            <>
              <div className="px-4 pt-4 pb-2">
                <div className="text-lg font-semibold tracking-tight">{word}</div>
              </div>
              <ErrorState code={phase.code} onRetry={onRetryLookup} targetLanguage={targetLanguage} />
            </>
          )}

          {phase.kind === "empty" && (
            <>
              <div className="px-4 pt-4 pb-2">
                <div className="text-lg font-semibold tracking-tight">{word}</div>
              </div>
              <EmptyState onAskAI={onAskAI} aiLoading={aiLoading} hasApiKey={hasApiKey} targetLanguage={targetLanguage} />
            </>
          )}

          {isTranslationPhase && (
            <ScrollArea className="max-h-[min(600px,calc(100vh-116px))]">
              <TextTranslationPanel
                phase={phase}
                targetLanguage={targetLanguage}
                hasApiKey={hasApiKey}
                onRetry={onRetryLookup}
                onAskAI={onAskAI}
              />
            </ScrollArea>
          )}
        </div>
      )}

      {activeTab === "ai" && (
        <div id="popup-panel-ai" className="min-w-0 max-w-full overflow-hidden" role="tabpanel" aria-label={labels.aiTab}>
          <AISection
            loading={aiLoading}
            requested={aiRequested}
            streamText={aiStreamText}
            thinkingText={aiThinkingText}
            thinkingEnabled={aiThinkingEnabled}
            error={aiError}
            onRetry={onAskAI}
            targetLanguage={targetLanguage}
          />
        </div>
      )}
      </div>
    </TooltipProvider>
  );
}
