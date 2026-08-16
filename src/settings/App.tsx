import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "@/components/ui/sonner";
import { DEFAULT_SETTINGS, getOpenRouterSettingsValidationError, type ExtensionSettings } from "@/shared/types";
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
  const [baseline, setBaseline] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
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
        setBaseline(next);
      } catch {
        setSettings(DEFAULT_SETTINGS);
        setApiKey(DEFAULT_SETTINGS.openRouterApiKey);
        setModel(DEFAULT_SETTINGS.openRouterModel);
        setSystemPrompt(DEFAULT_SETTINGS.systemPrompt);
        setBaseline(DEFAULT_SETTINGS);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function composeNext(): ExtensionSettings {
    return {
      selectionTriggerMode: settings.selectionTriggerMode,
      autoAskAIOnPopup: settings.autoAskAIOnPopup,
      includeSelectionContext: settings.includeSelectionContext,
      targetLanguage: settings.targetLanguage,
      theme: settings.theme,
      openRouterApiKey: apiKey.trim(),
      openRouterModel: model.trim() || DEFAULT_SETTINGS.openRouterModel,
      openRouterThinkingEnabled: settings.openRouterThinkingEnabled,
      openRouterReasoningEffort: settings.openRouterReasoningEffort,
      openRouterReasoningMaxTokens: settings.openRouterReasoningMaxTokens,
      openRouterMaxTokens: settings.openRouterMaxTokens,
      systemPrompt: systemPrompt,
    };
  }

  const isDirty = loaded && (() => {
    const next = composeNext();
    return (Object.keys(next) as Array<keyof ExtensionSettings>).some((key) => next[key] !== baseline[key]);
  })();
  const settingsValidationError = getOpenRouterSettingsValidationError(settings);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const effectiveDark = settings.theme === "dark" || (settings.theme !== "light" && media.matches);
      root.classList.toggle("dark", effectiveDark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function handleSave() {
    const next = composeNext();
    const validationError = getOpenRouterSettingsValidationError(next);
    if (validationError) {
      setSaveState("error");
      toast.error(validationError);
      return;
    }
    setSaveState("saving");
    try {
      await sendMessage("SAVE_SETTINGS", next);
      setSettings(next);
      setBaseline(next);
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

  function handleDiscard() {
    setSettings(baseline);
    setApiKey(baseline.openRouterApiKey);
    setModel(baseline.openRouterModel);
    setSystemPrompt(baseline.systemPrompt);
    setSaveState("idle");
  }

  if (!loaded) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Đang tải…</div>;
  }

  const activeNavigation = SETTINGS_NAVIGATION.find((item) => item.id === activeSection) ?? SETTINGS_NAVIGATION[0]!;
  const projectIconUrl = getProjectIconUrl();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-full overflow-x-clip flex-col lg:max-w-7xl lg:flex-row">
        <SettingsSidebar activeSection={activeSection} onSelect={setActiveSection} />

        <main className="w-full min-w-0 max-w-full flex-1">
          <div className="mx-auto w-full min-w-0 max-w-full p-4 pb-28 sm:p-6 sm:pb-28 lg:max-w-4xl lg:p-8 lg:pb-28">
            <header className="mb-8">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <img src={projectIconUrl} alt="" className="h-4 w-4 rounded" />
                <span>Cài đặt</span>
                <span aria-hidden="true">/</span>
                <span className="font-medium text-foreground">{activeNavigation.title}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{activeNavigation.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{activeNavigation.description}</p>
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

      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p role="status" aria-live="polite" className="min-w-0 truncate text-sm text-muted-foreground">
              {settingsValidationError ?? (saveState === "saving" ? "Đang lưu thay đổi…" : saveState === "error" ? "Không thể lưu. Vui lòng thử lại." : "Bạn có thay đổi chưa lưu.")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="ghost" onClick={handleDiscard} disabled={saveState === "saving"}>
                Hủy thay đổi
              </Button>
              <Button type="button" onClick={handleSave} disabled={saveState === "saving" || Boolean(settingsValidationError)}>
                {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {saveState === "saving" ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
