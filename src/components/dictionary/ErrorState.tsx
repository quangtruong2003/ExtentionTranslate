import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { TargetLanguage } from "@/shared/types";
import { getPopupCopy } from "./copy";

interface Props {
  code: string;
  onRetry?: () => void;
  targetLanguage: TargetLanguage;
}

export function ErrorState({ code, onRetry, targetLanguage }: Props) {
  const labels = getPopupCopy(targetLanguage);
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{labels.lookupFailed}</AlertTitle>
        <AlertDescription>{labels.errorMessage(code)}</AlertDescription>
      </Alert>
      {onRetry && (
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            {labels.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
