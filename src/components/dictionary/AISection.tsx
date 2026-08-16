import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import type { TargetLanguage } from "@/shared/types";
import { MarkdownContent } from "./MarkdownContent";
import { getPopupCopy } from "./copy";
import { shouldAutoCollapseThinking, shouldShowThinking } from "./thinkingState";

interface Props {
  loading: boolean;
  requested: boolean;
  onRetry?: () => void;
  streamText?: string;
  thinkingText?: string;
  thinkingEnabled: boolean;
  error?: string;
  targetLanguage: TargetLanguage;
}

export function AISection({
  loading,
  requested,
  onRetry,
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

  useEffect(() => {
    if (shouldAutoCollapseThinking(previousAnswer.current, streamText, loading)) {
      setThinkingOpen(false);
    }
    previousAnswer.current = streamText;
  }, [loading, streamText]);

  return (
    <div className="min-w-0 max-w-full border-t bg-muted/30">
      <div className="max-h-[min(560px,calc(100vh-180px))] min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-4 py-3">
        {showThinking && (
          <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen} className="mb-3 min-w-0 rounded-lg border bg-background/70">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-9 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                aria-label={loading && !streamText ? labels.aiThinking : labels.thinking}
              >
                {loading && !streamText ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {loading && !streamText ? labels.aiThinking : labels.thinking}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${thinkingOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="min-w-0 border-t px-3 py-2">
              <MarkdownContent className="text-xs text-muted-foreground">{thinkingText}</MarkdownContent>
            </CollapsibleContent>
          </Collapsible>
        )}

        {loading && !streamText && !showThinking && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{labels.generatingResponse}</span>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          </div>
        )}

        {streamText && (
          <div className="min-w-0 max-w-full">
            <MarkdownContent>{streamText}</MarkdownContent>
            {loading && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-[-2px]" />}
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
