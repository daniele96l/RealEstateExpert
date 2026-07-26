"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/context";
import {
  occupancyI18nRoot,
  type OccupancyOperation,
} from "@/lib/occupancy/operation";
import { ExternalLink, X } from "lucide-react";

function shortenDescription(text: string, maxWords = 8): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const words = trimmed.split(" ");
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export default function OccupancyDescriptionPreview({
  description,
  url,
  className,
  textClassName,
  operation = "rent",
}: {
  description: string | null | undefined;
  url?: string | null;
  className?: string;
  textClassName?: string;
  operation?: OccupancyOperation;
}) {
  const { t } = useI18n();
  const i18nRoot = occupancyI18nRoot(operation);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const full = description?.replace(/\s+/g, " ").trim() || "";
  const listingUrl = url?.trim() || null;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!full) {
    return <span className={textClassName ?? "text-xs text-neutral-400"}>—</span>;
  }

  const preview = shortenDescription(full);
  const isTruncated = preview !== full;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "max-w-full truncate text-left text-xs leading-snug text-sky-700 hover:text-sky-900 hover:underline"
        }
        title={isTruncated ? t(`${i18nRoot}.descriptionPreview.openHint`) : full}
      >
        {preview}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[2020] flex items-center justify-center bg-neutral-900/40 p-3"
              onClick={() => setOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t(`${i18nRoot}.descriptionPreview.title`)}
            >
              <div
                className="card flex max-h-[min(80vh,32rem)] w-full max-w-xl flex-col overflow-hidden shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    {t(`${i18nRoot}.descriptionPreview.title`)}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
                    aria-label={t(`${i18nRoot}.descriptionPreview.close`)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="overflow-y-auto px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                    {full}
                  </p>
                </div>
                {listingUrl ? (
                  <div className="shrink-0 border-t border-surface-border px-4 py-3">
                    <a
                      href={listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
                    >
                      {t(`${i18nRoot}.descriptionPreview.openListing`)}
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
