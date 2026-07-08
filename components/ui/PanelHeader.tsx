import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bordered?: boolean;
}

export default function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
  bordered = true,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-5 py-4",
        bordered && "border-b border-surface-border bg-neutral-50/80",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-white text-neutral-700">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
