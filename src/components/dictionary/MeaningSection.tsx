import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DictionaryMeaning, TargetLanguage } from "@/shared/types";
import { getPopupCopy } from "./copy";

interface Props {
  meaning: DictionaryMeaning;
  word: string;
  targetLanguage: TargetLanguage;
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

export function MeaningSection({ meaning, word, targetLanguage }: Props) {
  const copy = getPopupCopy(targetLanguage);
  return (
    <div className="space-y-2 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {meaning.partOfSpeech && (
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{meaning.partOfSpeech}</span>
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
              <Badge key={i} variant="outline" className="text-xs font-normal">
                {p.phrase}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {meaning.synonyms && meaning.synonyms.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.synonyms}</p>
          <div className="flex flex-wrap gap-1.5">
            {meaning.synonyms.map((s, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-normal">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
