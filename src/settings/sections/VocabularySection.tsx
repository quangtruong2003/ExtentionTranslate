import { useEffect, useMemo, useState } from "react";
import { Download, Search, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { toAnkiCsv, toVocabularyCsv } from "@/shared/exporters";
import type { TargetLanguage, VocabularyRecord } from "@/shared/types";
import { getSettingsCopy } from "../locales";

interface MessageResponse<T> {
  ok: boolean;
  payload?: T;
  error?: string;
}

function sendMessage<T>(type: string, payload?: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response?: MessageResponse<T>) => {
      resolve(response?.ok ? response.payload : undefined);
    });
  });
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface VocabularySectionProps {
  targetLanguage: TargetLanguage;
}

export function VocabularySection({ targetLanguage }: VocabularySectionProps) {
  const [records, setRecords] = useState<VocabularyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const copy = getSettingsCopy(targetLanguage);

  async function refresh() {
    const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_LIST");
    setRecords(list ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      if (favoritesOnly && !record.favorite) return false;
      if (!normalized) return true;
      return record.word.toLowerCase().includes(normalized)
        || (record.translation ?? "").toLowerCase().includes(normalized);
    });
  }, [records, query, favoritesOnly]);

  async function toggleFavorite(word: string) {
    const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_TOGGLE_FAVORITE", { word });
    if (list) setRecords(list);
  }

  async function remove(word: string) {
    const list = await sendMessage<VocabularyRecord[]>("VOCABULARY_REMOVE", { word });
    if (list) setRecords(list);
  }

  async function clearAll() {
    await sendMessage("VOCABULARY_CLEAR");
    setRecords([]);
    toast.success(copy.vocabularyClearedToast);
  }

  return (
    <section className="w-full min-w-0 max-w-full space-y-4">
      <Card className="min-w-0 max-w-full">
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.vocabularySearchPlaceholder}
                aria-label={copy.vocabularySearchPlaceholder}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant={favoritesOnly ? "default" : "outline"}
              onClick={() => setFavoritesOnly((value) => !value)}
              aria-pressed={favoritesOnly}
            >
              <Star className="h-4 w-4" aria-hidden="true" />
              {copy.vocabularyFavoritesFilter}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{`${visible.length} ${copy.vocabularyCountSuffix}`}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={records.length === 0}
                onClick={() => downloadFile("extention-translate-vocabulary.csv", toVocabularyCsv(records))}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {copy.vocabularyExportCsv}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={records.length === 0}
                onClick={() => downloadFile("extention-translate-anki.csv", toAnkiCsv(records))}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {copy.vocabularyExportAnki}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={records.length === 0} onClick={() => void clearAll()}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {copy.vocabularyClearAll}
              </Button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {records.length === 0
                ? copy.vocabularyEmptyAll
                : copy.vocabularyEmptyFiltered}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {visible.map((record) => (
                <li key={record.word} className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    aria-label={record.favorite ? copy.vocabularyFavoriteRemoveAria : copy.vocabularyFavoriteAddAria}
                    aria-pressed={record.favorite}
                    onClick={() => void toggleFavorite(record.word)}
                    className="rounded p-1 hover:bg-accent"
                  >
                    <Star className={`h-4 w-4 ${record.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{record.word}</p>
                    {record.translation && <p className="truncate text-xs text-muted-foreground">{record.translation}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(record.lookedUpAt).toLocaleDateString()}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    aria-label={`${copy.vocabularyRemoveAriaPrefix} ${record.word}`} onClick={() => void remove(record.word)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}
