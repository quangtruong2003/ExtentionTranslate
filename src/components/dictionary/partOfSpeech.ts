import type { DictionaryEntry } from "@/shared/types";

export function getPartOfSpeechLabels(entry: Pick<DictionaryEntry, "meanings">): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const meaning of entry.meanings) {
    const label = meaning.partOfSpeech?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  return labels;
}
