import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DictionaryMeaning, TargetLanguage } from "@/shared/types";
import { getPopupCopy } from "./copy";
import { localizePartOfSpeech } from "./partOfSpeech";

interface Props {
  meaning: DictionaryMeaning;
  word: string;
  targetLanguage: TargetLanguage;
  onLookupWord?: (word: string) => void;
}

function highlightWordInternal(text: string, word: string): React.ReactNode {
  if (!word) return text;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === word.toLowerCase() ? (
      <mark key={i} className="rounded bg-accent px-0.5 text-accent-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export const highlight = highlightWordInternal;

export function MeaningSection({ meaning, word, targetLanguage, onLookupWord }: Props) {
  const copy = getPopupCopy(targetLanguage);
  return (
    <div className="space-y-2 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {meaning.partOfSpeech && (
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            {localizePartOfSpeech(meaning.partOfSpeech, targetLanguage)}
          </span>
        )}
        {meaning.cefr && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {meaning.cefr}
          </Badge>
        )}
      </div>

      <p className="text-sm leading-relaxed text-foreground">{highlightWordInternal(meaning.definition, word)}</p>

      {meaning.translation && (
        <p className="text-sm">
          <span className="text-muted-foreground">{copy.meaning}</span>
          <span className="font-medium">{meaning.translation}</span>
        </p>
      )}

      {meaning.examples && meaning.examples.length > 0 && (
        <>
          <Separator className="my-2" />
          <ul className="space-y-1.5">
            {meaning.examples.map((ex, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <span className="text-primary">•</span>
                <span>{highlight(ex, word)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {meaning.phrases && meaning.phrases.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.relatedPhrases}</p>
          <div className="flex flex-wrap gap-1.5">
            {meaning.phrases.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onLookupWord?.(p.phrase)}
                aria-label={copy.lookupWord(p.phrase)}
                disabled={!onLookupWord}
                title={onLookupWord ? copy.lookupWord(p.phrase) : undefined}
                className="rounded-full transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
              >
                <Badge variant="outline" className="text-xs font-normal">{p.phrase}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {meaning.synonyms && meaning.synonyms.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.synonyms}</p>
          <div className="flex flex-wrap gap-1.5">
            {meaning.synonyms.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onLookupWord?.(s)}
                aria-label={copy.lookupWord(s)}
                disabled={!onLookupWord}
                title={onLookupWord ? copy.lookupWord(s) : undefined}
                className="rounded-full transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
              >
                <Badge variant="secondary" className="text-xs font-normal">{s}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
