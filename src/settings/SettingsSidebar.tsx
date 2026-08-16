import { SETTINGS_NAVIGATION, type SettingsSectionId } from "./navigation";

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
}

interface NavigationItemsProps extends SettingsSidebarProps {
  compact?: boolean;
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

function getExtensionVersion(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // Preview/test environments lack the extension runtime.
  }
  return "";
}

function NavigationItems({ activeSection, onSelect, compact = false }: NavigationItemsProps) {
  return (
    <>
      {SETTINGS_NAVIGATION.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeSection;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            className={
              compact
                ? `flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                : `flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
            }
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              {!compact && <span className="mt-0.5 block text-xs opacity-70">{item.description}</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function SettingsSidebar({ activeSection, onSelect }: SettingsSidebarProps) {
  const version = getExtensionVersion();

  return (
    <>
      <nav
        aria-label="Điều hướng cài đặt"
        className="sticky top-0 z-30 flex h-12 w-full min-w-0 max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b bg-background/95 px-3 backdrop-blur lg:hidden"
      >
        <NavigationItems activeSection={activeSection} onSelect={onSelect} compact />
      </nav>

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex items-center gap-3 border-b px-6 py-5">
          <img src={getProjectIconUrl()} alt="" className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">ExtentionTranslate</p>
            <p className="text-xs text-muted-foreground">Cài đặt tiện ích</p>
          </div>
        </div>

        <nav aria-label="Điều hướng cài đặt" className="flex-1 space-y-1 overflow-y-auto p-4">
          <NavigationItems activeSection={activeSection} onSelect={onSelect} />
        </nav>

        <div className="border-t px-6 py-4">
          <p className="text-xs text-muted-foreground">{version ? `Phiên bản ${version}` : "ExtentionTranslate"}</p>
        </div>
      </aside>
    </>
  );
}
