"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-surface-border bg-neutral-100 p-1",
        className,
      )}
      role={ariaLabel ? "tablist" : "group"}
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role={ariaLabel ? "tab" : undefined}
            aria-selected={ariaLabel ? active : undefined}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-600 hover:text-neutral-900 disabled:opacity-40",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
