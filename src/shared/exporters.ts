import type { VocabularyRecord } from "@/shared/types";

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toVocabularyCsv(records: VocabularyRecord[]): string {
  const header = "word,translation,favorite,lookedUpAt";
  const rows = records.map((record) => [
    csvField(record.word),
    csvField(record.translation ?? ""),
    record.favorite ? "true" : "false",
    String(record.lookedUpAt),
  ].join(","));
  return [header, ...rows].join("\n");
}

// Anki imports commas as field separators even inside quoted fields unless
// escaped, so commas inside values are backslash-escaped instead of quoted.
function ankiField(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/\n/g, "<br>");
  if (/"/.test(escaped)) return `"${escaped.replace(/"/g, '""')}"`;
  return escaped;
}

export function toAnkiCsv(records: VocabularyRecord[]): string {
  const header = ["#separator:Comma", "#html:false"];
  const rows = records.map((record) => [
    ankiField(record.word),
    ankiField(record.translation ?? record.word),
  ].join(","));
  return [...header, ...rows].join("\n");
}
