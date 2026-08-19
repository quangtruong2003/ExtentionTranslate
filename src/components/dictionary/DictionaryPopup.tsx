import { useRef } from "react";
import { Loader2 } from "lucide-react";
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
import type { AIMessage, DictionaryEntry, TargetLanguage, TranslationStatus } from "@/shared/types";
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
  aiStopped: boolean;
  hasApiKey: boolean;
  autoAskAI: boolean;
  activeTab: PopupTab;
  targetLanguage: TargetLanguage;
  translationStatus?: TranslationStatus;
  aiMessages: AIMessage[];
  onAskAI: () => void;
  onTabChange: (tab: PopupTab) => void;
  onRetryLookup: () => void;
  onOpenSettings: () => void;
  onLookupWord?: (word: string) => void;
  onStop?: () => void;
  onSendMessage?: (text: string) => void;
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
    aiStopped,
    hasApiKey,
    autoAskAI,
    activeTab,
    targetLanguage,
    translationStatus,
    aiMessages,
    onAskAI,
    onTabChange,
    onRetryLookup,
    onOpenSettings,
    onLookupWord,
    onStop,
    onSendMessage,
  } = props;
  const labels = getPopupCopy(targetLanguage);
  const rootRef = useRef<HTMLDivElement>(null);
  const isTranslationPhase = phase.kind === "translation-loading" || phase.kind === "translation-ready" || phase.kind === "translation-error";

  function handleTabTrap(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const dialog = rootRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = dialog.ownerDocument.activeElement as HTMLElement | null;
    const activeInDialog = active && dialog.contains(active) ? active : null;
    if (event.shiftKey && (activeInDialog === first || !activeInDialog)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeInDialog === last || !activeInDialog)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <div
        ref={rootRef}
        tabIndex={-1}
        className="flex max-h-[min(680px,calc(100vh-24px))] w-fit min-w-[340px] max-w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border/40 bg-popover text-popover-foreground outline-none animate-fade-in"
        role="dialog"
        aria-modal="true"
        onKeyDown={handleTabTrap}
        aria-label={isTranslationPhase ? labels.translationDialogLabel(word) : labels.dialogLabel(word)}
      >
      {phase.kind === "ready" && (
        <>
          <DictionaryHeader
            entry={phase.entry}
            onAskAI={onAskAI}
            aiLoading={aiLoading}
            aiDone={Boolean(aiStreamText)}
            autoAskAI={autoAskAI}
            targetLanguage={targetLanguage}
          />
          <Separator />
        </>
      )}

      <PopupTabs
        activeTab={activeTab}
        aiLoading={aiLoading}
        dictionaryTranslating={translationStatus === "translating"}
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
                  <div className="text-xl font-semibold tracking-tight">{word}</div>
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <DictionarySkeleton />
            </>
          )}

          {phase.kind === "ready" && (
            <ScrollArea className="max-h-[min(600px,calc(100vh-180px))]">
              {translationStatus === "translating" && (
                <div role="status" aria-live="polite" className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
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
                  <MeaningSection key={i} meaning={m} word={phase.entry.word} targetLanguage={targetLanguage} onLookupWord={onLookupWord} />
                ))}
              </div>
            </ScrollArea>
          )}

          {phase.kind === "error" && (
            <>
              <div className="px-4 pt-4 pb-2">
                <div className="text-xl font-semibold tracking-tight">{word}</div>
              </div>
              <ErrorState code={phase.code} onRetry={onRetryLookup} targetLanguage={targetLanguage} />
            </>
          )}

          {phase.kind === "empty" && (
            <>
              <div className="px-4 pt-4 pb-2">
                <div className="text-xl font-semibold tracking-tight">{word}</div>
              </div>
              <EmptyState onAskAI={onAskAI} onOpenSettings={onOpenSettings} aiLoading={aiLoading} hasApiKey={hasApiKey} targetLanguage={targetLanguage} />
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
            stopped={aiStopped}
            error={aiError}
            messages={aiMessages}
            onRetry={onAskAI}
            onStop={onStop}
            onSendMessage={onSendMessage}
            targetLanguage={targetLanguage}
          />
        </div>
      )}
      </div>
    </TooltipProvider>
  );
}
