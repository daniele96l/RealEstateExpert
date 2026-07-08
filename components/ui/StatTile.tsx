import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  valueClassName?: string;
}

export default function StatTile({ label, value, hint, className, valueClassName }: Props) {
  return (
    <div className={cn("rounded-lg border border-surface-border bg-neutral-50 px-3 py-2", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold text-neutral-900", valueClassName)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}
