import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Sparkles, Trash2 } from "lucide-react";
import { ModelSelector } from "@/components/ModelSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_TYPES } from "@/shared/constants";
import type { ExtensionSettings } from "@/shared/types";
import { SettingRow } from "../SettingRow";

interface OpenRouterSectionProps {
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  showKey: boolean;
  onShowKeyChange: (value: boolean) => void;
  model: string;
  onModelChange: (value: string) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onResetSystemPrompt: () => void;
}

type KeyCheckState = "idle" | "checking" | "ok" | "error";

export function OpenRouterSection({
  settings,
  onSettingsChange,
  apiKey,
  onApiKeyChange,
  showKey,
  onShowKeyChange,
  model,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  onResetSystemPrompt,
}: OpenRouterSectionProps) {
  const [keyCheck, setKeyCheck] = useState<{ state: KeyCheckState; message?: string }>({ state: "idle" });

  useEffect(() => {
    setKeyCheck({ state: "idle" });
  }, [apiKey]);

  async function handleCheckKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setKeyCheck({ state: "checking" });
    try {
      const response = await new Promise<{ ok?: boolean; payload?: { models?: unknown[] } }>((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: MESSAGE_TYPES.GET_MODELS, payload: { apiKey: trimmed } },
            (reply) => resolve(reply as { ok?: boolean; payload?: { models?: unknown[] } }),
          );
        } catch {
          resolve({});
        }
      });
      const count = Array.isArray(response?.payload?.models) ? response.payload!.models!.length : 0;
      if (response?.ok && count > 0) {
        setKeyCheck({ state: "ok", message: `Key hợp lệ — ${count} model khả dụng.` });
      } else {
        setKeyCheck({ state: "error", message: "Key không hợp lệ hoặc không kết nối được OpenRouter." });
      }
    } catch {
      setKeyCheck({ state: "error", message: "Không kiểm tra được key. Vui lòng thử lại." });
    }
  }

  return (
    <section aria-labelledby="openrouter-section-title" className="w-full min-w-0 max-w-full space-y-6">
      <h2 id="openrouter-section-title" className="sr-only">OpenRouter AI</h2>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Kết nối OpenRouter
          </CardTitle>
          <CardDescription>
            Cấu hình để sử dụng tính năng "Hỏi AI". Lấy API key tại{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="font-medium underline hover:text-foreground">openrouter.ai/keys</a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-sm font-medium">OpenRouter API Key</Label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="relative w-full min-w-0 flex-1">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  placeholder="sk-or-v1-..."
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => onShowKeyChange(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showKey ? "Ẩn API key" : "Hiện API key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onApiKeyChange("")} disabled={!apiKey}>Xóa key</Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void handleCheckKey()}
                disabled={!apiKey.trim() || keyCheck.state === "checking"}
              >
                {keyCheck.state === "checking" ? "Đang kiểm tra…" : "Kiểm tra key"}
              </Button>
            </div>
            {keyCheck.state !== "idle" && keyCheck.state !== "checking" && (
              <p className={`text-xs ${keyCheck.state === "ok" ? "text-emerald-600" : "text-destructive"}`}>
                {keyCheck.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">API key được lưu cục bộ trong trình duyệt và chỉ được dùng để gọi OpenRouter.</p>
          </div>

          <div className="min-w-0 space-y-2 border-t pt-5" role="group" aria-labelledby="model-label">
            <Label id="model-label" className="text-sm font-medium">Model</Label>
            <ModelSelector value={model} onChange={onModelChange} apiKey={apiKey} />
            <p className="text-xs text-muted-foreground">Tìm kiếm và chọn từ hơn 500+ model của OpenRouter. Có thể nhập model tuỳ chỉnh.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Hành vi AI
          </CardTitle>
          <CardDescription>Điều chỉnh cách AI suy luận và trả lời trong popup.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <div className="divide-y">
            <SettingRow
              id="openrouter-thinking"
              title="Bật chế độ suy luận AI"
              description="Cho phép model hỗ trợ reasoning suy luận trước khi trả lời. Phần suy luận được thu gọn mặc định trong popup."
            >
              <Switch
                id="openrouter-thinking"
                checked={settings.openRouterThinkingEnabled}
                onCheckedChange={(openRouterThinkingEnabled) => onSettingsChange({ ...settings, openRouterThinkingEnabled })}
              />
            </SettingRow>
          </div>

          <div className="space-y-2 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="system-prompt" className="text-sm font-medium">System Prompt</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onResetSystemPrompt}>
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Khôi phục mặc định
              </Button>
            </div>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(event) => onSystemPromptChange(event.target.value)}
              rows={10}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              System Prompt điều khiển ngôn ngữ và cách trả lời của tab AI trong popup. Khi từ điển không có dữ liệu, prompt này cũng định dạng bản dịch JSON dùng cho tab Từ điển.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
