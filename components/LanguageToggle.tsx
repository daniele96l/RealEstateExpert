"use client";

import { useI18n, type LocaleId } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const OPTIONS: LocaleId[] = ["it", "en"];

export default function LanguageToggle({ className }: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={cn(
        "flex rounded-xl border border-surface-border bg-surface-raised/60 p-1 shadow-inner",
        className,
      )}
      role="group"
      aria-label={t("lang.aria")}
    >
      {OPTIONS.map((id) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setLocale(id)}
            className={cn(
              "min-w-[4.5rem] rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-accent text-white shadow-md"
                : "text-slate-400 hover:bg-surface-border/40 hover:text-slate-200",
            )}
          >
            {id.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
