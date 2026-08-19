import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles, Square } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TargetLanguage } from "@/shared/types";
import { MarkdownContent } from "./MarkdownContent";
import { getPopupCopy } from "./copy";
import { getThinkingProgressTitle, shouldAutoCollapseThinking, shouldShowThinking } from "./thinkingState";

interface Props {
  loading: boolean;
  requested: boolean;
  stopped: boolean;
  onRetry?: () => void;
  onStop?: () => void;
  streamText?: string;
  thinkingText?: string;
  thinkingEnabled: boolean;
  error?: string;
  targetLanguage: TargetLanguage;
}

export function AISection({
  loading,
  requested,
  stopped,
  onRetry,
  onStop,
  streamText = "",
  thinkingText = "",
  thinkingEnabled,
  error,
  targetLanguage,
}: Props) {
  const labels = getPopupCopy(targetLanguage);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const previousAnswer = useRef(streamText);
  const showThinking = shouldShowThinking(thinkingEnabled, thinkingText);
  const thinkingProgressTitle = loading && !streamText ? getThinkingProgressTitle(thinkingText) : null;
  const headerLabel = !loading
    ? labels.thinking
    : thinkingProgressTitle
      ? `${thinkingProgressTitle}…`
      : streamText
        ? labels.generatingResponse
        : labels.aiThinking;
  // The thinking frame doubles as the single loading status bar, so keep it
  // mounted for the whole loading phase even before any thinking text arrives.
  const showThinkingBlock = loading || showThinking;

  useEffect(() => {
    if (shouldAutoCollapseThinking(previousAnswer.current, streamText, loading)) {
      setThinkingOpen(false);
    }
    previousAnswer.current = streamText;
  }, [loading, streamText]);

  return (
    <div className="min-w-0 max-w-full border-t bg-muted/30">
      <div className="max-h-[min(560px,calc(100vh-180px))] min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-4 py-3">
        {showThinkingBlock && (
          <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen} className="mb-3 min-w-0 rounded-lg border bg-background/70">
            <div className="flex min-w-0 items-center">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  aria-label={headerLabel}
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span className={`min-w-0 flex-1 truncate ${thinkingProgressTitle ? "ext-thinking-progress font-semibold" : ""}`}>
                    {headerLabel}
                  </span>
                  {showThinking && (
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${thinkingOpen ? "rotate-180" : ""}`} />
                  )}
                </button>
              </CollapsibleTrigger>
              {loading && onStop && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mr-2 h-7 shrink-0 gap-1.5 px-2 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    onStop();
                  }}
                >
                  <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  {labels.stopGeneration}
                </Button>
              )}
            </div>
            {showThinking && (
              <CollapsibleContent className="min-w-0 border-t px-3 py-2">
                <MarkdownContent className="text-xs text-muted-foreground">{thinkingText}</MarkdownContent>
              </CollapsibleContent>
            )}
          </Collapsible>
        )}

        {loading && !streamText && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        )}

        {streamText && (
          <div className="min-w-0 max-w-full">
            <MarkdownContent>{streamText}</MarkdownContent>
            {loading && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-[-2px]" aria-hidden="true" />}
          </div>
        )}

        {stopped && !loading && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
            {labels.stoppedBadge}
          </div>
        )}

        {error && (
          <div className={`${streamText ? "mt-3 border-t pt-3" : ""} text-xs text-muted-foreground`}>
            {labels.errorMessage(error)}
            {onRetry && (
              <button type="button" className="ml-2 underline hover:text-foreground" onClick={onRetry}>
                {labels.retry}
              </button>
            )}
          </div>
        )}

        {!requested && !loading && !error && !streamText && (
          <div className="text-xs text-muted-foreground">
            {labels.aiNoResponse}
            {onRetry && (
              <button type="button" className="ml-2 underline hover:text-foreground" onClick={onRetry}>
                {labels.retry}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
