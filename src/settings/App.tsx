import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "@/components/ui/sonner";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "@/shared/types";
import { SettingsSidebar } from "./SettingsSidebar";
import { SETTINGS_NAVIGATION, type SettingsSectionId } from "./navigation";
import { AboutSection } from "./sections/AboutSection";
import { OpenRouterSection } from "./sections/OpenRouterSection";
import { OverviewSection } from "./sections/OverviewSection";
import { PopupDictionarySection } from "./sections/PopupDictionarySection";

interface MessageResponse<T> {
  ok: boolean;
  payload?: T;
  error?: string;
}

function sendMessage<T>(type: string, payload?: unknown): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (response?: MessageResponse<T>) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || "Không thể liên hệ tiện ích."));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Tiện ích không xác nhận yêu cầu."));
          return;
        }
        resolve(response?.payload);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Không thể gửi yêu cầu đến tiện ích."));
    }
  });
}

function getProjectIconUrl() {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("icons/icon48.png");
    }
  } catch {
    // Preview and test environments do not provide the extension runtime.
  }

  return "/icons/icon48.png";
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(DEFAULT_SETTINGS.openRouterModel);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SETTINGS.systemPrompt);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("overview");

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await sendMessage<ExtensionSettings>("GET_SETTINGS");
        const next = loaded ?? DEFAULT_SETTINGS;
        setSettings(next);
        setApiKey(next.openRouterApiKey);
        setModel(next.openRouterModel);
        setSystemPrompt(next.systemPrompt);
      } catch {
        setSettings(DEFAULT_SETTINGS);
        setApiKey(DEFAULT_SETTINGS.openRouterApiKey);
        setModel(DEFAULT_SETTINGS.openRouterModel);
        setSystemPrompt(DEFAULT_SETTINGS.systemPrompt);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function handleSave() {
    setSaveState("saving");
    try {
      const next: ExtensionSettings = {
        selectionTriggerMode: settings.selectionTriggerMode,
        autoAskAIOnPopup: settings.autoAskAIOnPopup,
        targetLanguage: settings.targetLanguage,
        openRouterApiKey: apiKey.trim(),
        openRouterModel: model.trim() || DEFAULT_SETTINGS.openRouterModel,
        openRouterThinkingEnabled: settings.openRouterThinkingEnabled,
        systemPrompt: systemPrompt,
      };
      await sendMessage("SAVE_SETTINGS", next);
      setSettings(next);
      setSaveState("saved");
      toast.success("Đã lưu cài đặt");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
      toast.error("Không thể lưu cài đặt");
    }
  }

  function handleResetSystemPrompt() {
    setSystemPrompt(DEFAULT_SETTINGS.systemPrompt);
  }

  if (!loaded) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Đang tải…</div>;
  }

  const activeNavigation = SETTINGS_NAVIGATION.find((item) => item.id === activeSection) ?? SETTINGS_NAVIGATION[0]!;
  const projectIconUrl = getProjectIconUrl();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-muted/20 text-foreground">
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-full overflow-x-hidden flex-col lg:max-w-7xl lg:flex-row">
        <SettingsSidebar activeSection={activeSection} onSelect={setActiveSection} />

        <main className="w-full min-w-0 max-w-full flex-1">
          <div className="mx-auto w-full min-w-0 max-w-full p-4 sm:p-6 lg:max-w-4xl lg:p-8">
            <header className="sticky top-12 z-20 -mx-4 mb-6 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <img src={projectIconUrl} alt="ExtentionTranslate" className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">ExtentionTranslate</p>
                  <h1 className="truncate text-lg font-semibold tracking-tight">{activeNavigation.title}</h1>
                  <p className="hidden text-sm text-muted-foreground sm:block">{activeNavigation.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {saveState !== "idle" && (
                  <span role="status" aria-live="polite" className={saveState === "error" ? "min-w-0 text-right text-xs text-destructive sm:text-sm" : "min-w-0 text-right text-xs text-emerald-600 sm:text-sm"}>
                    {saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu" : "Lỗi khi lưu"}
                  </span>
                )}
                <Button
                  onClick={handleSave}
                  disabled={saveState === "saving"}
                  size="icon"
                  aria-label={saveState === "saving" ? "Đang lưu cài đặt" : "Lưu cài đặt"}
                  className="shrink-0 sm:w-auto sm:px-4"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{saveState === "saving" ? "Đang lưu…" : "Lưu"}</span>
                </Button>
              </div>
            </header>

            {activeSection === "overview" && <OverviewSection settings={settings} hasApiKey={Boolean(apiKey.trim())} onNavigate={setActiveSection} />}
            {activeSection === "popup" && <PopupDictionarySection settings={settings} onSettingsChange={setSettings} />}
            {activeSection === "openrouter" && (
              <OpenRouterSection
                settings={settings}
                onSettingsChange={setSettings}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                showKey={showKey}
                onShowKeyChange={setShowKey}
                model={model}
                onModelChange={setModel}
                systemPrompt={systemPrompt}
                onSystemPromptChange={setSystemPrompt}
                onResetSystemPrompt={handleResetSystemPrompt}
              />
            )}
            {activeSection === "about" && <AboutSection />}
          </div>
        </main>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
