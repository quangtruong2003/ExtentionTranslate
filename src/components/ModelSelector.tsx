import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/utils";
import type { OpenRouterModel } from "@/shared/openrouter-types";
import { MESSAGE_TYPES } from "@/shared/constants";

interface MessageResponse<T> {
  ok: boolean;
  payload: T;
}

function sendBgMessage<T>(type: string, payload?: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (response: MessageResponse<T>) => {
        resolve(response?.payload);
      });
    } catch {
      resolve(undefined);
    }
  });
}

const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 min
let modelCache: { models: OpenRouterModel[]; fetchedAt: number; apiKey: string } | null = null;

function formatContext(ctx?: number): string {
  if (!ctx) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
  return String(ctx);
}

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  apiKey: string;
}

export function ModelSelector({ value, onChange, apiKey }: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [models, setModels] = React.useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [customInput, setCustomInput] = React.useState("");
  const [knownModels, setKnownModels] = React.useState<OpenRouterModel[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function loadModels() {
    if (!apiKey) {
      setError("Nhập API key trước để tải danh sách model.");
      return;
    }
    const cached = modelCache;
    const isCacheValid =
      cached !== null &&
      cached.apiKey === apiKey &&
      Date.now() - cached.fetchedAt < MODEL_CACHE_TTL;

    if (isCacheValid) {
      setModels(cached.models);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await sendBgMessage<{ models: OpenRouterModel[] }>(MESSAGE_TYPES.GET_MODELS, {
        apiKey,
      });
      if (res?.models) {
        modelCache = { models: res.models, fetchedAt: Date.now(), apiKey };
        setModels(res.models);
      } else {
        setError("Không tải được danh sách model.");
      }
    } catch {
      setError("Không tải được danh sách model.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setCustomInput("");
      void loadModels();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleQueryChange(val: string) {
    setQuery(val);
  }

  function handleSelect(modelId: string) {
    onChange(modelId);
    setOpen(false);
  }

  function handleCustomSubmit() {
    const trimmed = customInput.trim();
    if (trimmed) {
      onChange(trimmed);
      setCustomInput("");
      setOpen(false);
    }
  }

  const displayedModels = React.useMemo(() => {
    const list = models;
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.provider?.name ?? "").toLowerCase().includes(q),
    );
  }, [models, query]);

  React.useEffect(() => {
    if (!apiKey) return;
    if (modelCache?.apiKey === apiKey) {
      setKnownModels(modelCache.models);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await sendBgMessage<{ models: OpenRouterModel[] }>(MESSAGE_TYPES.GET_MODELS, { apiKey });
      if (!cancelled && res?.models) {
        modelCache = { models: res.models, fetchedAt: Date.now(), apiKey };
        setKnownModels(res.models);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const selectedModel = React.useMemo(
    () => knownModels.find((m) => m.id === value),
    [knownModels, value],
  );

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("min-w-0 flex-1 text-left", !value && "text-muted-foreground")}>
            {value ? (
              selectedModel?.name && selectedModel.name !== value ? (
                <>
                  <span className="block truncate font-medium">{selectedModel.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{value}</span>
                </>
              ) : (
                <span className="block truncate">{value}</span>
              )
            ) : (
              "Chọn model…"
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="flex max-h-[min(560px,calc(100vh-32px))] flex-col rounded-xl border bg-popover p-0 shadow-xl outline-none animate-fade-in"
          align="start"
          sideOffset={4}
          style={{ width: "var(--radix-popover-trigger-width)", maxWidth: "90vw" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search row — fixed outside scroll */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Tìm kiếm model…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange("")}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Custom model row — fixed, outside scroll */}
          <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
            <Input
              placeholder="Model tuỳ chỉnh…"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCustomSubmit();
              }}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 text-xs"
              onClick={() => void handleCustomSubmit()}
              disabled={!customInput.trim()}
            >
              Dùng
            </Button>
          </div>

          {/* Model list — scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-1">
              {loading && (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Đang tải…
                </div>
              )}

              {!loading && error && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">{error}</div>
              )}

              {!loading && !error && displayedModels.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {query
                    ? `Không tìm thấy model cho "${query}".`
                    : "Danh sách trống."}
                </div>
              )}

              {!loading && !error && displayedModels.length > 0 && (
                <>
                  <div className="mb-1 px-2 py-1 text-xs text-muted-foreground">
                    {query
                      ? `${displayedModels.length} kết quả cho "${query}"`
                      : `${displayedModels.length} model`}
                  </div>
                  <div className="space-y-0.5 pb-1">
                    {displayedModels.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelect(model.id)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                          "hover:bg-accent hover:text-accent-foreground",
                          value === model.id && "bg-accent text-accent-foreground",
                        )}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {value === model.id && (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="block truncate font-medium">
                            {model.name || model.id}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {model.id}
                            {model.context_length
                              ? ` · ${formatContext(model.context_length)} ctx`
                              : ""}
                          </span>
                        </span>
                        {model.provider?.name && (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {model.provider.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
