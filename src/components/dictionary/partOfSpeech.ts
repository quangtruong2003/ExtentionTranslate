import type { DictionaryEntry, TargetLanguage } from "@/shared/types";

const POS_LABELS: Partial<Record<Exclude<TargetLanguage, "en">, Record<string, string>>> = {
  vi: {
    noun: "danh từ",
    verb: "động từ",
    adjective: "tính từ",
    adverb: "trạng từ",
    pronoun: "đại từ",
    preposition: "giới từ",
    conjunction: "liên từ",
    interjection: "thán từ",
    exclamation: "cảm thán từ",
    determiner: "hạn định từ",
    numeral: "số từ",
    abbreviation: "viết tắt",
  },
  "zh-CN": {
    noun: "名词",
    verb: "动词",
    adjective: "形容词",
    adverb: "副词",
    pronoun: "代词",
    preposition: "介词",
    conjunction: "连词",
    interjection: "叹词",
    exclamation: "感叹语",
    determiner: "限定词",
    numeral: "数词",
    abbreviation: "缩写",
  },
};

export function localizePartOfSpeech(label: string, targetLanguage: TargetLanguage): string {
  if (targetLanguage === "en") return label;
  return POS_LABELS[targetLanguage]?.[label.trim().toLowerCase()] ?? label;
}

export function getPartOfSpeechLabels(
  entry: Pick<DictionaryEntry, "meanings">,
  targetLanguage: TargetLanguage = "en",
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const meaning of entry.meanings) {
    const label = meaning.partOfSpeech?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(localizePartOfSpeech(label, targetLanguage));
  }

  return labels;
}
