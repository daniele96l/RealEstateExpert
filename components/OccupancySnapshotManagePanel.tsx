"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchOccupancySnapshotDetail, patchOccupancySnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type {
  OccupancyBasicListing,
  OccupancyDashboardData,
  OccupancySnapshot,
  OccupancySnapshotSummary,
} from "@/lib/types";
import type { OccupancyCitySlug } from "@/lib/occupancy/cities";
import type { OccupancyPortal } from "@/lib/occupancy/portals";
import type { OccupancyMetricsBasis } from "@/lib/occupancy/metrics-basis";
import type { OccupancyMetricsPeriod } from "@/lib/occupancy/metrics-period";
import { Pencil, Settings2, X } from "lucide-react";

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

function SnapshotEditModal({
  fetchedAt,
  citySlug,
  portal,
  selectedSnapshotAt,
  metricsPeriod,
  metricsBasis,
  dateLocale,
  onClose,
  onSaved,
}: {
  fetchedAt: string;
  citySlug: OccupancyCitySlug;
  portal: OccupancyPortal;
  selectedSnapshotAt: string | null;
  metricsPeriod: OccupancyMetricsPeriod;
  metricsBasis: OccupancyMetricsBasis;
  dateLocale: string;
  onClose: () => void;
  onSaved: (data: OccupancyDashboardData) => void;
}) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<OccupancySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOccupancySnapshotDetail(fetchedAt, { city: citySlug, portal })
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data.snapshot);
        setRemoveIds(new Set());
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("occupancy.snapshotManage.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchedAt, citySlug, portal, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sortedListings = useMemo(
    () =>
      [...(snapshot?.listings ?? [])].sort(
        (a, b) => (a.zone ?? "").localeCompare(b.zone ?? "", "it") || b.price - a.price,
      ),
    [snapshot?.listings],
  );

  const toggleRemove = (id: string) => {
    setRemoveIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!removeIds.size) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const asOf =
        selectedSnapshotAt === fetchedAt ? null : selectedSnapshotAt;
      const data = await patchOccupancySnapshot({
        fetched_at: fetchedAt,
        city: citySlug,
        portal,
        remove_listing_ids: [...removeIds],
        edit_note: editNote.trim() || null,
        asOf,
        period: metricsPeriod,
        basis: metricsBasis,
      });
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.snapshotManage.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-neutral-900/40 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card flex max-h-[min(80vh,40rem)] w-full max-w-3xl flex-col overflow-hidden shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">
              {t("occupancy.snapshotManage.editTitle")}
            </h3>
            <p className="text-xs text-neutral-500">{formatWhen(fetchedAt, dateLocale)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-neutral-500">{t("occupancy.snapshotManage.loading")}</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-neutral-600">{t("occupancy.snapshotManage.editHint")}</p>
              <label className="mb-3 block text-xs text-neutral-600">
                {t("occupancy.snapshotManage.editNote")}
                <input
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-800"
                  placeholder={t("occupancy.snapshotManage.editNotePlaceholder")}
                />
              </label>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border/40 text-left text-[10px] uppercase tracking-wide text-neutral-500">
                    <th className="px-2 py-2">{t("occupancy.snapshotManage.remove")}</th>
                    <th className="px-2 py-2">{t("occupancy.preview.table.zone")}</th>
                    <th className="px-2 py-2">{t("occupancy.preview.table.rent")}</th>
                    <th className="px-2 py-2">{t("occupancy.preview.table.sqm")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedListings.map((listing: OccupancyBasicListing) => (
                    <tr key={listing.id} className="border-b border-surface-border/20 text-neutral-700">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={removeIds.has(listing.id)}
                          onChange={() => toggleRemove(listing.id)}
                        />
                      </td>
                      <td className="max-w-[14rem] truncate px-2 py-2">
                        <span className="font-medium">{listing.zone ?? "—"}</span>
                        {listing.address ? (
                          <span className="block truncate text-[10px] text-neutral-500">{listing.address}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{listing.price}</td>
                      <td className="px-2 py-2">{listing.sqm ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            {t("occupancy.snapshotManage.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading || !removeIds.size}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? t("occupancy.snapshotManage.saving") : t("occupancy.snapshotManage.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function OccupancySnapshotManagePanel({
  snapshots,
  citySlug,
  portal,
  selectedSnapshotAt,
  metricsPeriod,
  metricsBasis,
  dateLocale,
  disabled,
  onDashboardUpdate,
}: {
  snapshots: OccupancySnapshotSummary[];
  citySlug: OccupancyCitySlug;
  portal: OccupancyPortal;
  selectedSnapshotAt: string | null;
  metricsPeriod: OccupancyMetricsPeriod;
  metricsBasis: OccupancyMetricsBasis;
  dateLocale: string;
  disabled?: boolean;
  onDashboardUpdate: (data: OccupancyDashboardData) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editingFetchedAt, setEditingFetchedAt] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [busyFetchedAt, setBusyFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleExclude = useCallback(
    async (snapshot: OccupancySnapshotSummary) => {
      setBusyFetchedAt(snapshot.fetched_at);
      setError(null);
      try {
        const excluding = !snapshot.excluded;
        const asOf =
          excluding && selectedSnapshotAt === snapshot.fetched_at
            ? null
            : selectedSnapshotAt;
        const data = await patchOccupancySnapshot({
          fetched_at: snapshot.fetched_at,
          city: citySlug,
          portal,
          excluded: excluding,
          exclude_reason: excluding ? reasonDrafts[snapshot.fetched_at]?.trim() || null : null,
          asOf,
          period: metricsPeriod,
          basis: metricsBasis,
        });
        onDashboardUpdate(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("occupancy.snapshotManage.saveError"));
      } finally {
        setBusyFetchedAt(null);
      }
    },
    [
      citySlug,
      metricsBasis,
      metricsPeriod,
      onDashboardUpdate,
      portal,
      reasonDrafts,
      selectedSnapshotAt,
      t,
    ],
  );

  if (!snapshots.length) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        <Settings2 size={16} />
        {t("occupancy.snapshotManage.title")}
      </button>

      {open ? (
        <div className="mt-3 rounded-xl border border-surface-border bg-neutral-50/80 p-3">
          <p className="mb-3 text-xs text-neutral-600">{t("occupancy.snapshotManage.subtitle")}</p>
          {error ? <p className="mb-3 text-sm text-red-500">{error}</p> : null}
          <ul className="space-y-2">
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.fetched_at}
                className={cn(
                  "rounded-lg border bg-white px-3 py-2",
                  snapshot.excluded ? "border-amber-300/80 bg-amber-50/40" : "border-surface-border",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {formatWhen(snapshot.fetched_at, dateLocale)}
                      <span className="ml-2 font-normal text-neutral-500">
                        · {snapshot.active_count} {t("occupancy.refreshListings")}
                      </span>
                    </p>
                    {snapshot.excluded ? (
                      <p className="text-xs text-amber-800">
                        {t("occupancy.snapshotManage.excludedLabel")}
                        {snapshot.exclude_reason ? `: ${snapshot.exclude_reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!snapshot.excluded ? (
                      <button
                        type="button"
                        onClick={() => setEditingFetchedAt(snapshot.fetched_at)}
                        disabled={disabled || busyFetchedAt === snapshot.fetched_at}
                        className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        <Pencil size={14} />
                        {t("occupancy.snapshotManage.edit")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void toggleExclude(snapshot)}
                      disabled={disabled || busyFetchedAt === snapshot.fetched_at}
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50",
                        snapshot.excluded
                          ? "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
                      )}
                    >
                      {busyFetchedAt === snapshot.fetched_at
                        ? t("occupancy.snapshotManage.saving")
                        : snapshot.excluded
                          ? t("occupancy.snapshotManage.include")
                          : t("occupancy.snapshotManage.exclude")}
                    </button>
                  </div>
                </div>
                {!snapshot.excluded ? (
                  <input
                    value={reasonDrafts[snapshot.fetched_at] ?? ""}
                    onChange={(e) =>
                      setReasonDrafts((current) => ({
                        ...current,
                        [snapshot.fetched_at]: e.target.value,
                      }))
                    }
                    placeholder={t("occupancy.snapshotManage.excludeReasonPlaceholder")}
                    className="mt-2 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs text-neutral-800"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editingFetchedAt ? (
        <SnapshotEditModal
          fetchedAt={editingFetchedAt}
          citySlug={citySlug}
          portal={portal}
          selectedSnapshotAt={selectedSnapshotAt}
          metricsPeriod={metricsPeriod}
          metricsBasis={metricsBasis}
          dateLocale={dateLocale}
          onClose={() => setEditingFetchedAt(null)}
          onSaved={onDashboardUpdate}
        />
      ) : null}
    </div>
  );
}
