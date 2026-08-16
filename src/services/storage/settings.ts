import { normalizeSettings, type ExtensionSettings, type StoredSettings } from "@/shared/types";

export const SETTINGS_KEY = "extention-translate:settings";

export async function getSettings(): Promise<ExtensionSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = (raw[SETTINGS_KEY] ?? {}) as StoredSettings;
  return normalizeSettings(stored);
}

export async function saveSettings(next: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export function onSettingsChanged(
  listener: (next: ExtensionSettings, prev: ExtensionSettings) => void,
): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local") return;
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    const prev = normalizeSettings(change.oldValue as StoredSettings | undefined);
    const next = normalizeSettings(change.newValue as StoredSettings | undefined);
    listener(next, prev);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
