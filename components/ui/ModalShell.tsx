"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  title?: ReactNode;
}

export default function ModalShell({
  open,
  onClose,
  children,
  className,
  panelClassName,
  title,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center",
        className,
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden",
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title != null ? (
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <div className="text-base font-semibold text-neutral-900">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
