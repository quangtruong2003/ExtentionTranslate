import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles, Square } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIMessage, TargetLanguage } from "@/shared/types";
import { MarkdownContent } from "./MarkdownContent";
import { getPopupCopy } from "./copy";
import { getThinkingProgressTitle, shouldAutoCollapseThinking, shouldShowThinking } from "./thinkingState";

interface Props {
  loading: boolean;
  requested: boolean;
  onRetry?: () => void;
  onStop?: () => void;
  onSendMessage?: (text: string) => void;
  streamText?: string;
  thinkingText?: string;
  thinkingEnabled: boolean;
  error?: string;
  messages: AIMessage[];
  targetLanguage: TargetLanguage;
}

export function AISection({
  loading,
  requested,
  onRetry,
  onStop,
  onSendMessage,
  streamText = "",
  thinkingText = "",
  thinkingEnabled,
  error,
  messages,
  targetLanguage,
}: Props) {
  const labels = getPopupCopy(targetLanguage);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const previousAnswer = useRef(streamText);
  const showThinking = shouldShowThinking(thinkingEnabled, thinkingText);
  const thinkingProgressTitle = loading && !streamText ? getThinkingProgressTitle(thinkingText) : null;
  const thinkingLabel = thinkingProgressTitle
    ? `${thinkingProgressTitle}…`
    : loading && !streamText
      ? labels.aiThinking
      : labels.thinking;

  useEffect(() => {
    if (shouldAutoCollapseThinking(previousAnswer.current, streamText, loading)) {
      setThinkingOpen(false);
    }
    previousAnswer.current = streamText;
  }, [loading, streamText]);

  return (
    <div className="min-w-0 max-w-full border-t bg-muted/30">
      <div className="max-h-[min(560px,calc(100vh-180px))] min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-4 py-3">
        {loading && onStop && !showThinking && (
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-primary">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="truncate">{labels.generatingResponse}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              onClick={onStop}
            >
              <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              {labels.stopGeneration}
            </Button>
          </div>
        )}

        {showThinking && (
          <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen} className="mb-3 min-w-0 rounded-lg border bg-background/70">
            <div className="flex min-w-0 items-center">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  aria-label={thinkingLabel}
                >
                  {loading && !streamText ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span className={`min-w-0 flex-1 truncate ${thinkingProgressTitle ? "ext-thinking-progress font-semibold" : ""}`}>
                    {thinkingLabel}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${thinkingOpen ? "rotate-180" : ""}`} />
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
            <CollapsibleContent className="min-w-0 border-t px-3 py-2">
              <MarkdownContent className="text-xs text-muted-foreground">{thinkingText}</MarkdownContent>
            </CollapsibleContent>
          </Collapsible>
        )}

        {loading && !streamText && !showThinking && (
          <div className="space-y-3">
            {!onStop && (
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{labels.generatingResponse}</span>
              </div>
            )}
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          // The final assistant turn is rendered from streamText below; skip
          // it here so the completed answer never renders twice.
          if (index === messages.length - 1 && message.role === "assistant") return null;
          if (message.role === "user") {
            return (
              <div key={index} className="mb-2 flex justify-end">
                <span className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary/10 px-3 py-1.5 text-xs">{message.content}</span>
              </div>
            );
          }
          return (
            <div key={index} className="mb-3 min-w-0 max-w-full">
              <MarkdownContent>{message.content}</MarkdownContent>
            </div>
          );
        })}

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

        {!loading && onSendMessage && (streamText || messages.some((message) => message.role === "assistant")) && (
          <form
            className="mt-3 flex items-center gap-2 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              onSendMessage(draft);
              setDraft("");
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={labels.chatPlaceholder}
              aria-label={labels.chatPlaceholder}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            <Button type="submit" size="sm" className="h-8 shrink-0 px-3" disabled={!draft.trim()}>
              {labels.chatSend}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
