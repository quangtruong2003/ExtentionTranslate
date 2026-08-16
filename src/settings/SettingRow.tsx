import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SettingRowProps {
  id?: string;
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingRow({ id, icon: Icon, title, description, children }: SettingRowProps) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
          {title}
        </label>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
