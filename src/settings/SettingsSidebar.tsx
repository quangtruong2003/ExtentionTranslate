import { SETTINGS_NAVIGATION, type SettingsSectionId } from "./navigation";

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
}

interface NavigationItemsProps extends SettingsSidebarProps {
  compact?: boolean;
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
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                : `flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
            }
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              {!compact && <span className="mt-0.5 block text-xs opacity-80">{item.description}</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function SettingsSidebar({ activeSection, onSelect }: SettingsSidebarProps) {
  return (
    <>
      <nav
        aria-label="Điều hướng cài đặt"
        className="sticky top-0 z-30 flex h-12 w-full min-w-0 max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b bg-background/95 px-3 backdrop-blur lg:hidden"
      >
        <NavigationItems activeSection={activeSection} onSelect={onSelect} compact />
      </nav>

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r bg-background p-5 lg:block">
        <div className="mb-6 px-3">
          <p className="text-sm font-semibold">Cài đặt</p>
          <p className="mt-1 text-xs text-muted-foreground">ExtentionTranslate</p>
        </div>
        <nav aria-label="Điều hướng cài đặt" className="space-y-1">
          <NavigationItems activeSection={activeSection} onSelect={onSelect} />
        </nav>
      </aside>
    </>
  );
}
