import { useEffect, useRef } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import type { TargetLanguage } from "@/shared/types";
import { getPopupCopy } from "./copy";
import { registerShadowButtonAction } from "@/content/shadowRoot";

export type PopupTab = "dictionary" | "ai";

interface Props {
  activeTab: PopupTab;
  aiLoading: boolean;
  dictionaryTranslating?: boolean;
  targetLanguage: TargetLanguage;
  primaryLabel?: string;
  onChange: (tab: PopupTab) => void;
}

export function PopupTabs({ activeTab, aiLoading, dictionaryTranslating, targetLanguage, primaryLabel, onChange }: Props) {
  const copy = getPopupCopy(targetLanguage);
  const dictionaryButtonRef = useRef<HTMLButtonElement>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const tabs: Array<{ id: PopupTab; label: string; icon: typeof BookOpen }> = [
    { id: "dictionary", label: primaryLabel ?? copy.dictionaryTab, icon: BookOpen },
    { id: "ai", label: copy.aiTab, icon: Sparkles },
  ];

  useEffect(() => {
    const bindings = [
      [dictionaryButtonRef.current, "dictionary" as const],
      [aiButtonRef.current, "ai" as const],
    ] as const;
    const cleanups = bindings.flatMap(([button, id]) => {
      if (!button) return [];
      const unregisterAction = registerShadowButtonAction(button, () => onChange(id));
      return [unregisterAction];
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [onChange]);

  return (
    <div className="grid grid-cols-2 border-b bg-muted/20 px-2" role="tablist" aria-label={copy.tabListLabel}>
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`popup-panel-${id}`}
            ref={id === "dictionary" ? dictionaryButtonRef : aiButtonRef}
            onClick={() => onChange(id)}
            className={`relative inline-flex min-h-10 w-full items-center justify-center gap-1.5 px-3 text-xs font-medium transition-colors ${
              selected ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {id === "ai" && aiLoading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
            {id === "dictionary" && dictionaryTranslating && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
            {selected && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
