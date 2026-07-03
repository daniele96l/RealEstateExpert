"use client";

import { getMarket, type MarketId } from "@/lib/markets";
import { cn } from "@/lib/utils";

interface Props {
  market: MarketId;
  onChange: (market: MarketId) => void;
  className?: string;
}

const OPTIONS: MarketId[] = ["it", "cz"];

export default function MarketToggle({ market, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "flex rounded-xl border border-surface-border bg-surface-raised/60 p-1 shadow-inner",
        className,
      )}
      role="group"
      aria-label="Mercato"
    >
      {OPTIONS.map((id) => {
        const cfg = getMarket(id);
        const active = market === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "min-w-[7rem] rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-accent text-white shadow-md"
                : "text-slate-400 hover:bg-surface-border/40 hover:text-slate-200",
            )}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
