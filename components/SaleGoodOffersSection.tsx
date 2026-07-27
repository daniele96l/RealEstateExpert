"use client";

import { useMemo, useState } from "react";
import OccupancyDescriptionPreview from "@/components/OccupancyDescriptionPreview";
import { resolveOccupancyListingUrl } from "@/lib/listing-url";
import { newInWindow } from "@/lib/occupancy/aggregate";
import { listSegmentBuckets } from "@/lib/occupancy/segment-metrics";
import {
  parseSaleListingSignals,
  type SaleConditionKind,
  type SaleFloorFilter,
  type SaleFloorKind,
  type SaleListingSignals,
  type SaleOwnershipFilter,
  type SaleOwnershipKind,
} from "@/lib/occupancy/sale-listing-signals";
import { resolveWindowStartMs } from "@/lib/occupancy/tracking-window";
import type { MarketId } from "@/lib/markets";
import type { OccupancyMetricsPeriod } from "@/lib/occupancy/metrics-period";
import type {
  OccupancyAreaMetrics,
  OccupancyCityMetrics,
  TrackedRentalListing,
} from "@/lib/types";
import { cn, fmtMoney } from "@/lib/utils";
import { Search } from "lucide-react";

type SortMode = "newest" | "ppsqm" | "price";
type RoomsFilter = "all" | "1" | "2" | "3" | "4_plus";

const PAGE_SIZE = 8;

function pricePerSqm(listing: TrackedRentalListing): number | null {
  if (listing.sqm == null || listing.sqm <= 0) return null;
  return listing.price / listing.sqm;
}

function matchesRooms(listing: TrackedRentalListing, rooms: RoomsFilter): boolean {
  if (rooms === "all") return true;
  if (rooms === "4_plus") return listing.rooms != null && listing.rooms >= 4;
  return listing.rooms === Number(rooms);
}

function SignalBadge({
  label,
  tone,
}: {
  label: string;
  tone: "warn" | "ok" | "info" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-800",
        tone === "neutral" && "border-neutral-200 bg-neutral-50 text-neutral-600",
      )}
    >
      {label}
    </span>
  );
}

function signalBadges(
  signals: SaleListingSignals,
  t: (key: string) => string,
): Array<{ label: string; tone: "warn" | "ok" | "info" | "neutral" }> {
  const badges: Array<{ label: string; tone: "warn" | "ok" | "info" | "neutral" }> = [];
  if (signals.ownership === "cooperative") {
    badges.push({ label: t("goodOffers.signals.cooperative"), tone: "warn" });
  } else if (signals.ownership === "personal") {
    badges.push({ label: t("goodOffers.signals.personal"), tone: "ok" });
  }
  if (signals.coop_loan) {
    badges.push({ label: t("goodOffers.signals.coopLoan"), tone: "warn" });
  }
  if (signals.floor === "basement") {
    badges.push({ label: t("goodOffers.signals.basement"), tone: "warn" });
  } else if (signals.floor === "ground") {
    badges.push({ label: t("goodOffers.signals.ground"), tone: "info" });
  } else if (signals.floor === "upper") {
    badges.push({ label: t("goodOffers.signals.upper"), tone: "neutral" });
  }
  if (signals.panel_building) {
    badges.push({ label: t("goodOffers.signals.panel"), tone: "neutral" });
  }
  if (signals.brick_building) {
    badges.push({ label: t("goodOffers.signals.brick"), tone: "info" });
  }
  if (signals.has_outdoor) {
    badges.push({ label: t("goodOffers.signals.outdoor"), tone: "ok" });
  }
  return badges;
}

function dealVsZone(
  listing: TrackedRentalListing,
  areaAvgByZone: Map<string, number>,
): number | null {
  const ppsqm = pricePerSqm(listing);
  if (ppsqm == null || !listing.zone) return null;
  const zoneAvg = areaAvgByZone.get(listing.zone);
  if (zoneAvg == null || zoneAvg <= 0) return null;
  return ((ppsqm - zoneAvg) / zoneAvg) * 100;
}

function resolveEnergyClass(listing: TrackedRentalListing): string | null {
  if (listing.energy_class?.trim()) return listing.energy_class.trim().toUpperCase();
  const text = [listing.title, listing.description]
    .filter((part) => part?.trim())
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!text) return null;
  const match =
    text.match(/energetick[ae]\s+trid[ae]\s*([a-g](?:[1-4])?)\b/) ??
    text.match(/energy\s+class\s*([a-g](?:[1-4])?)\b/) ??
    text.match(/classe\s+energetica\s*([a-g](?:[1-4])?)\b/);
  return match?.[1]?.toUpperCase() ?? null;
}

function conditionTone(kind: SaleConditionKind): "warn" | "ok" | "info" | "neutral" {
  if (kind === "needs_renovation" || kind === "old") return "warn";
  if (kind === "renovated" || kind === "good") return "ok";
  if (kind === "new_build") return "info";
  return "neutral";
}

export default function SaleGoodOffersSection({
  listings,
  metrics,
  metricsPeriod,
  market,
  t,
  perSqmLabel,
  showIntro = true,
}: {
  listings: TrackedRentalListing[];
  metrics: OccupancyCityMetrics | null;
  metricsPeriod: OccupancyMetricsPeriod;
  market: MarketId;
  t: (key: string, vars?: Record<string, string | number>) => string;
  perSqmLabel: string;
  showIntro?: boolean;
}) {
  const [areaFilter, setAreaFilter] = useState("all");
  const [roomsFilter, setRoomsFilter] = useState<RoomsFilter>("all");
  const [priceBand, setPriceBand] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState<SaleOwnershipFilter>("all");
  const [floorFilter, setFloorFilter] = useState<SaleFloorFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("ppsqm");
  const [page, setPage] = useState(0);

  const priceBands = useMemo(
    () => listSegmentBuckets("price", market, "sale"),
    [market],
  );

  const asOfMs = useMemo(() => {
    const raw = metrics?.updated_at ?? metrics?.tracking_ended_at;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [metrics?.updated_at, metrics?.tracking_ended_at]);

  const windowDays = metrics?.occupancy_window_days ?? 30;
  const windowStartMs = resolveWindowStartMs(
    asOfMs,
    windowDays,
    metrics?.tracking_started_at ?? null,
    metricsPeriod,
  );

  const areaAvgByZone = useMemo(() => {
    const map = new Map<string, number>();
    for (const area of (metrics?.areas ?? []) as OccupancyAreaMetrics[]) {
      if (area.avg_price_per_sqm != null && area.avg_price_per_sqm > 0) {
        map.set(area.zone, area.avg_price_per_sqm);
      }
    }
    return map;
  }, [metrics?.areas]);

  const newListings = useMemo(() => {
    return listings.filter((listing) =>
      newInWindow(listing, windowDays, asOfMs, windowStartMs),
    );
  }, [listings, windowDays, asOfMs, windowStartMs]);

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    for (const listing of newListings) {
      if (listing.zone) zones.add(listing.zone);
    }
    return [...zones].sort((a, b) => a.localeCompare(b, market === "cz" ? "cs" : "it"));
  }, [newListings, market]);

  const enriched = useMemo(() => {
    return newListings.map((listing) => {
      const signals = parseSaleListingSignals(listing);
      return { listing, signals, ppsqm: pricePerSqm(listing), vsZone: dealVsZone(listing, areaAvgByZone) };
    });
  }, [newListings, areaAvgByZone]);

  const filtered = useMemo(() => {
    const priceMatcher =
      priceBand === "all"
        ? null
        : priceBands.find((band) => band.id === priceBand)?.match ?? null;

    return enriched.filter(({ listing, signals }) => {
      if (areaFilter !== "all" && (listing.zone ?? "") !== areaFilter) return false;
      if (!matchesRooms(listing, roomsFilter)) return false;
      if (priceMatcher && !priceMatcher(listing)) return false;
      if (ownershipFilter !== "all" && signals.ownership !== ownershipFilter) return false;
      if (floorFilter !== "all" && signals.floor !== floorFilter) return false;
      return true;
    });
  }, [enriched, areaFilter, roomsFilter, priceBand, priceBands, ownershipFilter, floorFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      if (sortMode === "newest") {
        return (
          Date.parse(b.listing.first_seen_at) - Date.parse(a.listing.first_seen_at) ||
          b.listing.price - a.listing.price
        );
      }
      if (sortMode === "price") {
        return a.listing.price - b.listing.price;
      }
      const aP = a.ppsqm ?? Number.POSITIVE_INFINITY;
      const bP = b.ppsqm ?? Number.POSITIVE_INFINITY;
      return aP - bP || a.listing.price - b.listing.price;
    });
    return rows;
  }, [filtered, sortMode]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE) || 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const ownershipOptions: SaleOwnershipKind[] = ["personal", "cooperative", "unknown"];
  const floorOptions: SaleFloorKind[] = ["ground", "upper", "basement", "unknown"];

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        {showIntro ? (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
                <Search size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">{t("goodOffers.title")}</h2>
                <p className="mt-1 text-sm text-neutral-600">{t("goodOffers.subtitle")}</p>
              </div>
            </div>
            {sorted.length > 0 ? (
              <p className="text-xs text-neutral-500">
                {t("goodOffers.total", { count: sorted.length })}
              </p>
            ) : null}
          </div>
        ) : sorted.length > 0 ? (
          <p className="mb-4 text-xs text-neutral-500">
            {t("goodOffers.total", { count: sorted.length })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="sale-good-area">
            {t("kpi.areaFilter")}
            <select
              id="sale-good-area"
              value={areaFilter}
              onChange={(e) => {
                setAreaFilter(e.target.value);
                setPage(0);
              }}
              className="min-w-[10rem] rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              <option value="all">{t("kpi.allCity")}</option>
              {zoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="sale-good-rooms">
            {t("goodOffers.roomsFilter")}
            <select
              id="sale-good-rooms"
              value={roomsFilter}
              onChange={(e) => {
                setRoomsFilter(e.target.value as RoomsFilter);
                setPage(0);
              }}
              className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              <option value="all">{t("goodOffers.allRooms")}</option>
              <option value="1">{t("segments.rooms.1")}</option>
              <option value="2">{t("segments.rooms.2")}</option>
              <option value="3">{t("segments.rooms.3")}</option>
              <option value="4_plus">{t("segments.rooms.4_plus")}</option>
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="sale-good-price">
            {t("goodOffers.priceFilter")}
            <select
              id="sale-good-price"
              value={priceBand}
              onChange={(e) => {
                setPriceBand(e.target.value);
                setPage(0);
              }}
              className="min-w-[10rem] rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              <option value="all">{t("goodOffers.allPrices")}</option>
              {priceBands.map((band) => (
                <option key={band.id} value={band.id}>
                  {t(`segments.price.${band.id}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="sale-good-own">
            {t("goodOffers.ownershipFilter")}
            <select
              id="sale-good-own"
              value={ownershipFilter}
              onChange={(e) => {
                setOwnershipFilter(e.target.value as SaleOwnershipFilter);
                setPage(0);
              }}
              className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              <option value="all">{t("goodOffers.allOwnership")}</option>
              {ownershipOptions.map((id) => (
                <option key={id} value={id}>
                  {t(`goodOffers.ownership.${id}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="sale-good-floor">
            {t("goodOffers.floorFilter")}
            <select
              id="sale-good-floor"
              value={floorFilter}
              onChange={(e) => {
                setFloorFilter(e.target.value as SaleFloorFilter);
                setPage(0);
              }}
              className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              <option value="all">{t("goodOffers.allFloors")}</option>
              {floorOptions.map((id) => (
                <option key={id} value={id}>
                  {t(`goodOffers.floor.${id}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="sale-good-sort">
            {t("goodOffers.sort")}
            <select
              id="sale-good-sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
            >
              <option value="ppsqm">{t("goodOffers.sortPpsqm")}</option>
              <option value="price">{t("goodOffers.sortPrice")}</option>
              <option value="newest">{t("goodOffers.sortNewest")}</option>
            </select>
          </label>
        </div>
      </div>

      {newListings.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("goodOffers.empty")}</p>
      ) : sorted.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("goodOffers.emptyFiltered")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.listing")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.price")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.ppsqm")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.vsZone")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.energy")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.condition")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.signals")}</th>
                  <th className="px-4 py-3 font-medium">{t("goodOffers.table.description")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ listing, signals, ppsqm, vsZone }) => {
                  const url = resolveOccupancyListingUrl(listing);
                  const badges = signalBadges(signals, t);
                  return (
                    <tr key={listing.id} className="border-b border-surface-border/30 align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">
                          {listing.zone ?? "—"}
                          {listing.rooms != null ? ` · ${listing.rooms}` : ""}
                          {listing.sqm != null ? ` · ${Math.round(listing.sqm)} m²` : ""}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500">
                          {listing.address ?? listing.id}
                        </p>
                        {listing.floor ? (
                          <p className="mt-0.5 text-[10px] text-neutral-500">
                            {t("goodOffers.floorLabel", { floor: listing.floor })}
                          </p>
                        ) : null}
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-[10px] text-sky-800 hover:underline"
                          >
                            {t("breakdownDrilldown.openListing")}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-800">
                        {fmtMoney(listing.price, market)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-800">
                        {ppsqm != null
                          ? `${fmtMoney(Math.round(ppsqm), market)}${perSqmLabel}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {vsZone == null ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <span
                            className={cn(
                              "font-medium",
                              vsZone <= -5
                                ? "text-emerald-700"
                                : vsZone >= 5
                                  ? "text-rose-700"
                                  : "text-neutral-700",
                            )}
                          >
                            {vsZone > 0 ? "+" : ""}
                            {vsZone.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-800">
                        {resolveEnergyClass(listing) ?? (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {signals.condition === "unknown" ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <SignalBadge
                            label={t(`goodOffers.condition.${signals.condition}`)}
                            tone={conditionTone(signals.condition)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {badges.length === 0 ? (
                          <span className="text-xs text-neutral-400">{t("goodOffers.signals.none")}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {badges.map((badge) => (
                              <SignalBadge key={badge.label} label={badge.label} tone={badge.tone} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[16rem] px-4 py-3">
                        <OccupancyDescriptionPreview
                          description={listing.description}
                          url={url}
                          operation="sale"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sorted.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-surface-border/40 px-6 py-3 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, safePage - 1))}
                disabled={safePage <= 0}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  safePage <= 0
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {t("diff.paginationPrev")}
              </button>
              <span>
                {t("diff.paginationPage", {
                  current: safePage + 1,
                  total: pageCount,
                })}{" "}
                ·{" "}
                {t("removals.showing", {
                  from: safePage * PAGE_SIZE + 1,
                  to: Math.min((safePage + 1) * PAGE_SIZE, sorted.length),
                  total: sorted.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  safePage >= pageCount - 1
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {t("diff.paginationNext")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
