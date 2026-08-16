import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TargetLanguage } from "@/shared/types";
import { getPopupCopy } from "./copy";

interface Props {
  onAskAI: () => void;
  aiLoading: boolean;
  hasApiKey: boolean;
  targetLanguage: TargetLanguage;
}

export function EmptyState({ onAskAI, aiLoading, hasApiKey, targetLanguage }: Props) {
  const labels = getPopupCopy(targetLanguage);
  return (
    <div className="space-y-3 p-4 text-center">
      <p className="text-sm text-muted-foreground">{labels.noDictionaryResult}</p>
      <Button onClick={onAskAI} disabled={aiLoading} className="gap-2">
        <Sparkles className="h-4 w-4" />
        {hasApiKey ? labels.askAIForResult : labels.configureAI}
      </Button>
    </div>
  );
}
