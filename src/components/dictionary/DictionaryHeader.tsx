import { useEffect, useRef, useState } from "react";
import { Volume2, Copy, Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DictionaryEntry, TargetLanguage } from "@/shared/types";
import { toast } from "@/components/ui/sonner";
import {
  isDuplicatePronunciationTrigger,
  playPronunciationCandidates,
  preloadPronunciation,
  type PronunciationSpeechFallback,
} from "@/services/dictionary/pronunciation";
import { registerShadowButtonAction } from "@/content/shadowRoot";
import { getPopupCopy } from "./copy";
import { getPartOfSpeechLabels } from "./partOfSpeech";

interface Props {
  entry: DictionaryEntry;
  onAskAI: () => void;
  aiLoading?: boolean;
  aiDone?: boolean;
  autoAskAI: boolean;
  targetLanguage: TargetLanguage;
}

export function DictionaryHeader({ entry, onAskAI, aiLoading, aiDone, autoAskAI, targetLanguage }: Props) {
  const partOfSpeech = getPartOfSpeechLabels(entry, targetLanguage).join(" · ");
  const labels = getPopupCopy(targetLanguage);
  const [copied, setCopied] = useState(false);

  async function copyWord() {
    try {
      await navigator.clipboard.writeText(entry.word);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(labels.copyFailed);
    }
  }
  const pointerPlaybackAt = useRef(0);
  const lastPointerPlayback = useRef<{ key: string; at: number } | null>(null);
  const audioUkButtonRef = useRef<HTMLButtonElement>(null);
  const audioUsButtonRef = useRef<HTMLButtonElement>(null);
  const askAiButtonRef = useRef<HTMLButtonElement>(null);
  const audioUk = entry.phonetics?.audioUk;
  const audioUs = entry.phonetics?.audioUs;

  function playAudio(url: string | undefined, fallbackUrl: string | undefined, speechFallback: PronunciationSpeechFallback) {
    void playPronunciationCandidates([url, fallbackUrl], document, () => toast.error(labels.audioFailed), speechFallback);
  }

  function handleAudioPointerDown(
    triggerKey: string,
    url: string | undefined,
    fallbackUrl: string | undefined,
    speechFallback: PronunciationSpeechFallback,
  ) {
    const now = Date.now();
    if (isDuplicatePronunciationTrigger(lastPointerPlayback.current, triggerKey, now)) return;
    lastPointerPlayback.current = { key: triggerKey, at: now };
    pointerPlaybackAt.current = Date.now();
    playAudio(url, fallbackUrl, speechFallback);
  }

  function handleAudioClick(
    url: string | undefined,
    fallbackUrl: string | undefined,
    speechFallback: PronunciationSpeechFallback,
  ) {
    if (Date.now() - pointerPlaybackAt.current < 800) {
      pointerPlaybackAt.current = 0;
      return;
    }
    playAudio(url, fallbackUrl, speechFallback);
  }

  useEffect(() => {
    void preloadPronunciation(audioUk);
    void preloadPronunciation(audioUs);
  }, [audioUk, audioUs]);

  useEffect(() => {
    const bindings = [
      [audioUkButtonRef.current, audioUk, audioUs, { text: entry.word, lang: "en-GB" }],
      [audioUsButtonRef.current, audioUs, audioUk, { text: entry.word, lang: "en-US" }],
    ] as const;
    const cleanups = bindings.flatMap(([button, url, fallbackUrl, speechFallback]) => {
      if (!button) return [];
      const triggerKey = `${speechFallback.lang}:${speechFallback.text}`;
      const onPointerDown = () => handleAudioPointerDown(triggerKey, url, fallbackUrl, speechFallback);
      const onClick = () => handleAudioClick(url, fallbackUrl, speechFallback);
      const unregisterAction = registerShadowButtonAction(button, () => handleAudioPointerDown(triggerKey, url, fallbackUrl, speechFallback));
      button.addEventListener("pointerdown", onPointerDown);
      button.addEventListener("click", onClick);
      return [() => {
        unregisterAction();
        button.removeEventListener("pointerdown", onPointerDown);
        button.removeEventListener("click", onClick);
      }];
    });
    if (askAiButtonRef.current) {
      cleanups.push(registerShadowButtonAction(askAiButtonRef.current, onAskAI));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [audioUk, audioUs, entry.word]);

  return (
    <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="truncate text-xl font-semibold tracking-tight">{entry.word}</h2>
          {partOfSpeech && (
            <span className="text-xs italic text-muted-foreground">{partOfSpeech}</span>
          )}
          {entry.source === "ai" && (
            <Badge variant="accent" className="ml-1 px-1.5 py-0 text-[10px]">
              AI
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {entry.word && (
            <>
            <span className="flex items-center gap-1">
              <span className="font-medium">UK</span>
              {entry.phonetics?.uk && <span className="font-mono">{entry.phonetics.uk}</span>}
              <button
                type="button"
                aria-label={labels.audioUk}
                ref={audioUkButtonRef}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-medium">US</span>
              {entry.phonetics?.us && <span className="font-mono">{entry.phonetics.us}</span>}
              <button
                type="button"
                aria-label={labels.audioUs}
                ref={audioUsButtonRef}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
            </span>
            </>
          )}
        </div>

        {entry.wordForms && entry.wordForms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{labels.wordFormsLabel}</span>
            <span className="font-mono">{entry.wordForms.join(" · ")}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={labels.copyWord}
              onClick={() => void copyWord()}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{labels.copyWord}</TooltipContent>
        </Tooltip>

        {!autoAskAI && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={aiDone ? "outline" : "default"}
                ref={askAiButtonRef}
                onClick={onAskAI}
                disabled={aiLoading}
                className="h-8 gap-1.5 px-3"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{aiLoading ? labels.askAILoading : labels.askAI}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{labels.askAITooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
