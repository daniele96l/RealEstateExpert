"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOccupancyRemovals } from "@/lib/api";
import {
  OCCUPANCY_CITY_STORAGE_KEY,
  isOccupancyCitySlug,
  type OccupancyCitySlug,
} from "@/lib/occupancy/cities";
import { defaultPortalForCity, portalsForCity, type OccupancyPortal } from "@/lib/occupancy/portals";
import { getOccupancyCityConfig } from "@/lib/occupancy/cities";
import {
  normalizeOccupancyPropertyType,
  type OccupancyTypeFilter,
} from "@/lib/occupancy/filtered-breakdown";
import {
  parseRoomOccupancyKind,
  type RoomOccupancyKindFilter,
} from "@/lib/occupancy/room-occupancy-kind";
import type { MarketId } from "@/lib/markets";
import type { OccupancyRemovalEvent } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import type { OccupancyOperation } from "@/lib/occupancy/operation";
import { occupancyI18nRoot } from "@/lib/occupancy/operation";
import { cn, fmtMoney } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import OccupancyDescriptionPreview from "@/components/OccupancyDescriptionPreview";
import { resolveOccupancyListingUrl } from "@/lib/listing-url";

const OCCUPANCY_PORTAL_STORAGE_KEY = "occupancy-portal";
const REMOVALS_FETCH_LIMIT = 500;
const PAGE_SIZE = 5;

function isRemovalRoom(event: OccupancyRemovalEvent): boolean {
  return normalizeOccupancyPropertyType(event) === "room";
}

function removalListingKind(
  event: OccupancyRemovalEvent,
): "entire_place" | "private_room" | "shared_bed" | "unknown" {
  if (!isRemovalRoom(event)) return "entire_place";
  const kind = parseRoomOccupancyKind(event.description);
  if (kind === "private_room" || kind === "shared_bed") return kind;
  return "unknown";
}

function RemovalKindBadge({
  kind,
  label,
}: {
  kind: "entire_place" | "private_room" | "shared_bed" | "unknown";
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        kind === "entire_place" && "border-sky-200 bg-sky-50 text-sky-800",
        kind === "private_room" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        kind === "shared_bed" && "border-amber-200 bg-amber-50 text-amber-900",
        kind === "unknown" && "border-neutral-200 bg-neutral-50 text-neutral-600",
      )}
    >
      {label}
    </span>
  );
}

function matchesRemovalFilters(
  event: OccupancyRemovalEvent,
  areaFilter: string,
  typeFilter: OccupancyTypeFilter,
  roomKindFilter: RoomOccupancyKindFilter,
): boolean {
  if (areaFilter !== "all" && (event.zone ?? "") !== areaFilter) return false;
  if (typeFilter === "room" && !isRemovalRoom(event)) return false;
  if (typeFilter === "flat" && isRemovalRoom(event)) return false;
  if (roomKindFilter !== "all") {
    if (!isRemovalRoom(event)) return false;
    if (parseRoomOccupancyKind(event.description) !== roomKindFilter) return false;
  }
  return true;
}

function readStoredPortal(citySlug: OccupancyCitySlug): OccupancyPortal {
  if (typeof window === "undefined") return defaultPortalForCity(citySlug);
  const saved = window.localStorage.getItem(OCCUPANCY_PORTAL_STORAGE_KEY);
  const allowed = portalsForCity(citySlug);
  if (saved && allowed.includes(saved as OccupancyPortal)) return saved as OccupancyPortal;
  return defaultPortalForCity(citySlug);
}

function readStoredCity(): OccupancyCitySlug {
  if (typeof window === "undefined") return "reggio_calabria";
  const saved = window.localStorage.getItem(OCCUPANCY_CITY_STORAGE_KEY);
  return isOccupancyCitySlug(saved) ? saved : "reggio_calabria";
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
  market: MarketId,
): string {
  if (sqm == null || sqm <= 0) return "—";
  return `${fmtMoney(Math.round(price / sqm), market)}${perSqmLabel}`;
}

function formatPriceHistory(
  history: OccupancyRemovalEvent["price_history"],
  market: MarketId,
): string {
  if (history.length <= 1) return "—";
  return history.map((p) => fmtMoney(p.price, market)).join(" → ");
}

interface Props {
  refreshToken?: number;
  operation?: OccupancyOperation;
}

export default function OccupancyRemovalsLog({ refreshToken = 0, operation = "rent" }: Props) {
  const { t, locale } = useI18n();
  const i18nRoot = occupancyI18nRoot(operation);
  const ot = useCallback(
    (key: string, vars?: Record<string, string | number>) => t(`${i18nRoot}.${key}`, vars),
    [t, i18nRoot],
  );
  const [events, setEvents] = useState<OccupancyRemovalEvent[]>([]);
  const [displayMarket, setDisplayMarket] = useState<MarketId>("it");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<OccupancyTypeFilter>("all");
  const [roomKindFilter, setRoomKindFilter] = useState<RoomOccupancyKindFilter>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const dateLocale = locale === "en" ? "en-GB" : "it-IT";
  const perSqmLabel = t("listings.perSqm");

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    for (const event of events) {
      if (event.zone) zones.add(event.zone);
    }
    return [...zones].sort((a, b) => a.localeCompare(b, displayMarket === "cz" ? "cs" : "it"));
  }, [events, displayMarket]);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) =>
        matchesRemovalFilters(
          event,
          areaFilter,
          typeFilter,
          operation === "rent" ? roomKindFilter : "all",
        ),
      ),
    [events, areaFilter, typeFilter, roomKindFilter, operation],
  );

  const pageCount = Math.ceil(filteredEvents.length / PAGE_SIZE) || 1;
  const pageEvents = useMemo(
    () => filteredEvents.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filteredEvents, page],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const citySlug = readStoredCity();
      const portal = readStoredPortal(citySlug);
      const market = getOccupancyCityConfig(citySlug).market;
      const data = await fetchOccupancyRemovals(portal, REMOVALS_FETCH_LIMIT, citySlug, operation);
      setEvents(data.events);
      setDisplayMarket(market);
      setAreaFilter("all");
      setTypeFilter("all");
      setRoomKindFilter("all");
      setPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : ot("removals.loadError"));
      setEvents([]);
      setPage(0);
    } finally {
      setLoading(false);
    }
  }, [operation, ot]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    void reload();
  }, [reload, refreshToken, shouldLoad]);

  useEffect(() => {
    setPage(0);
  }, [areaFilter, typeFilter, roomKindFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const showCzFilters =
    displayMarket === "cz" || events.some((event) => event.id.startsWith("sr_"));

  return (
    <section ref={sectionRef} className="card mt-6 overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900">{ot("removals.title")}</h2>
              <p className="mt-1 text-sm text-neutral-600">{ot("removals.subtitle")}</p>
            </div>
          </div>
          {!loading && !error && events.length > 0 ? (
            <p className="text-xs text-neutral-500">
              {ot("removals.total", { count: filteredEvents.length })}
            </p>
          ) : null}
        </div>
        {!loading && !error && events.length > 0 ? (
          <div className="mt-4 space-y-3">
            {zoneOptions.length > 0 ? (
              <label
                className="inline-flex flex-wrap items-center gap-2 text-sm text-neutral-600"
                htmlFor="occupancy-removals-area"
              >
                <span>{ot("kpi.areaFilter")}</span>
                <select
                  id="occupancy-removals-area"
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="min-w-[12rem] rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
                >
                  <option value="all">{ot("kpi.allCity")}</option>
                  {zoneOptions.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {showCzFilters ? (
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className="inline-flex items-center gap-2 text-sm text-neutral-600"
                  htmlFor="occupancy-removals-type"
                >
                  <span>{ot("kpi.typeFilter")}</span>
                  <select
                    id="occupancy-removals-type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as OccupancyTypeFilter)}
                    className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
                  >
                    <option value="all">{ot("kpi.allTypes")}</option>
                    <option value="flat">{ot("kpi.typeFlat")}</option>
                    <option value="room">{ot("kpi.typeRoom")}</option>
                  </select>
                </label>
                {operation === "rent" ? (
                  <label
                    className="inline-flex items-center gap-2 text-sm text-neutral-600"
                    htmlFor="occupancy-removals-room-kind"
                  >
                    <span>{ot("diff.roomKindFilter")}</span>
                    <select
                      id="occupancy-removals-room-kind"
                      value={roomKindFilter}
                      onChange={(e) => setRoomKindFilter(e.target.value as RoomOccupancyKindFilter)}
                      className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
                    >
                      <option value="all">{ot("diff.allRoomKinds")}</option>
                      <option value="private_room">{ot("diff.roomKindPrivate")}</option>
                      <option value="shared_bed">{ot("diff.roomKindSharedBed")}</option>
                      <option value="unknown">{ot("diff.roomKindUnknown")}</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("common.loading")}</p>
      ) : error ? (
        <p className="px-6 py-8 text-center text-sm text-rose-400">{error}</p>
      ) : events.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{ot("removals.empty")}</p>
      ) : filteredEvents.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{ot("removals.emptyFiltered")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-6 py-3">{ot("removals.table.detected")}</th>
                  <th className="px-4 py-3">{ot("removals.table.zone")}</th>
                  <th className="px-4 py-3">{ot("removals.table.rent")}</th>
                  <th className="px-4 py-3">{ot("removals.table.rentPerSqm")}</th>
                  <th className="px-4 py-3">{ot("removals.table.dom")}</th>
                  <th className="px-4 py-3">{ot("removals.table.priceHistory")}</th>
                  <th className="px-6 py-3">{ot("removals.table.address")}</th>
                  <th className="px-4 py-3">{ot("removals.table.kind")}</th>
                  <th className="min-w-[14rem] px-6 py-3">{ot("removals.table.description")}</th>
                </tr>
              </thead>
              <tbody>
                {pageEvents.map((event) => {
                  const kind = removalListingKind(event);
                  const kindLabel =
                    kind === "entire_place"
                      ? ot("removals.table.entirePlace")
                      : kind === "private_room"
                        ? ot("removals.table.privateRoom")
                        : kind === "shared_bed"
                          ? ot("removals.table.sharedBed")
                          : ot("removals.table.kindUnknown");
                  return (
                  <tr
                    key={`${event.id}-${event.detected_at}`}
                    className="border-b border-surface-border/20 text-neutral-700 last:border-0"
                  >
                    <td className="whitespace-nowrap px-6 py-3 text-xs text-neutral-600">
                      {formatWhen(event.detected_at, dateLocale)}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">{event.zone ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {fmtMoney(event.price, displayMarket)}
                    </td>
                    <td className="px-4 py-3">
                      {formatPricePerSqm(event.price, event.sqm, perSqmLabel, displayMarket)}
                    </td>
                    <td className="px-4 py-3">
                      {event.days_on_market != null ? `${event.days_on_market}d` : "—"}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-neutral-500">
                      {formatPriceHistory(event.price_history, displayMarket)}
                    </td>
                    <td className="max-w-md px-6 py-3">
                      <p className="truncate text-neutral-700">{event.address ?? "—"}</p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{event.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RemovalKindBadge kind={kind} label={kindLabel} />
                    </td>
                    <td className="max-w-xs px-6 py-3">
                      <OccupancyDescriptionPreview
                        description={event.description}
                        url={resolveOccupancyListingUrl(event)}
                        operation={operation}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredEvents.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-surface-border/40 px-6 py-3 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page <= 0}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  page <= 0
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {ot("diff.paginationPrev")}
              </button>
              <span>
                {ot("diff.paginationPage", {
                  current: page + 1,
                  total: pageCount,
                })}
                {" · "}
                {ot("removals.showing", {
                  from: page * PAGE_SIZE + 1,
                  to: Math.min((page + 1) * PAGE_SIZE, filteredEvents.length),
                  total: filteredEvents.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  page >= pageCount - 1
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {ot("diff.paginationNext")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
