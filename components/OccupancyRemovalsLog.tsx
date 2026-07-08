"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchOccupancyRemovals } from "@/lib/api";
import type { OccupancyPortal } from "@/lib/occupancy/portals";
import type { OccupancyRemovalEvent } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { fmtMoney } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

const OCCUPANCY_PORTAL_STORAGE_KEY = "occupancy-portal";

function readStoredPortal(): OccupancyPortal {
  if (typeof window === "undefined") return "idealista";
  const saved = window.localStorage.getItem(OCCUPANCY_PORTAL_STORAGE_KEY);
  if (saved === "immobiliare" || saved === "immobiliare_scraper") return saved;
  return "idealista";
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatPricePerSqm(
  price: number,
  sqm: number | null,
  perSqmLabel: string,
): string {
  if (sqm == null || sqm <= 0) return "—";
  return `${fmtMoney(Math.round(price / sqm))}${perSqmLabel}`;
}

function formatPriceHistory(
  history: OccupancyRemovalEvent["price_history"],
): string {
  if (history.length <= 1) return "—";
  return history.map((p) => fmtMoney(p.price)).join(" → ");
}

interface Props {
  refreshToken?: number;
}

export default function OccupancyRemovalsLog({ refreshToken = 0 }: Props) {
  const { t, locale } = useI18n();
  const [events, setEvents] = useState<OccupancyRemovalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateLocale = locale === "en" ? "en-GB" : "it-IT";
  const perSqmLabel = t("listings.perSqm");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const portal = readStoredPortal();
      const data = await fetchOccupancyRemovals(portal, 50);
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.removals.loadError"));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
            <ClipboardList size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{t("occupancy.removals.title")}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t("occupancy.removals.subtitle")}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("common.loading")}</p>
      ) : error ? (
        <p className="px-6 py-8 text-center text-sm text-rose-400">{error}</p>
      ) : events.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("occupancy.removals.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-6 py-3">{t("occupancy.removals.table.detected")}</th>
                <th className="px-4 py-3">{t("occupancy.removals.table.zone")}</th>
                <th className="px-4 py-3">{t("occupancy.removals.table.rent")}</th>
                <th className="px-4 py-3">{t("occupancy.removals.table.rentPerSqm")}</th>
                <th className="px-4 py-3">{t("occupancy.removals.table.dom")}</th>
                <th className="px-4 py-3">{t("occupancy.removals.table.priceHistory")}</th>
                <th className="px-6 py-3">{t("occupancy.removals.table.address")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={`${event.id}-${event.detected_at}`}
                  className="border-b border-surface-border/20 text-neutral-700 last:border-0"
                >
                  <td className="whitespace-nowrap px-6 py-3 text-xs text-neutral-600">
                    {formatWhen(event.detected_at, dateLocale)}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-800">{event.zone ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-neutral-900">{fmtMoney(event.price)}</td>
                  <td className="px-4 py-3">
                    {formatPricePerSqm(event.price, event.sqm, perSqmLabel)}
                  </td>
                  <td className="px-4 py-3">
                    {event.days_on_market != null ? `${event.days_on_market}d` : "—"}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-neutral-500">
                    {formatPriceHistory(event.price_history)}
                  </td>
                  <td className="max-w-md px-6 py-3">
                    <p className="truncate text-neutral-700">{event.address ?? "—"}</p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{event.id}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
