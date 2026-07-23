import assert from "node:assert/strict";
import {
  aggregateOccupancyListings,
  computeScopedInventoryBasis,
  timeWeightedAverageActiveCount,
} from "./aggregate";
import { resolveWindowStartMs } from "./tracking-window";
import type { OccupancySnapshot, TrackedRentalListing } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoAfter(baseMs: number, days: number): string {
  return new Date(baseMs + days * DAY_MS).toISOString();
}

function makeSnapshot(fetchedAt: string, activeCount: number, zoneCounts?: Record<string, number>): OccupancySnapshot {
  const listings = zoneCounts
    ? Object.entries(zoneCounts).flatMap(([zone, count]) =>
        Array.from({ length: count }, (_, index) => ({
          id: `${zone}-${fetchedAt}-${index}`,
          price: 500,
          lat: 0,
          lng: 0,
          sqm: 50,
          rooms: 2,
          property_type: null,
          address: null,
          zone,
        })),
      )
    : Array.from({ length: activeCount }, (_, index) => ({
        id: `listing-${fetchedAt}-${index}`,
        price: 500,
        lat: 0,
        lng: 0,
        sqm: 50,
        rooms: 2,
        property_type: null,
        address: null,
        zone: "Centro",
      }));

  return {
    fetched_at: fetchedAt,
    active_count: activeCount,
    listings,
  };
}

function testTimeWeightedSparseSnapshots(): void {
  const startMs = Date.parse("2026-07-04T10:00:00Z");
  const endMs = Date.parse("2026-07-10T10:00:00Z");
  const snapshots = [
    { fetched_at: isoAfter(startMs, 0), active_count: 100 },
    { fetched_at: isoAfter(startMs, 6), active_count: 80 },
  ];

  const weighted = timeWeightedAverageActiveCount(snapshots, startMs, endMs);
  const simpleMean = Math.round((100 + 80) / 2);

  assert.equal(weighted, 100);
  assert.notEqual(weighted, simpleMean);
}

function testResolveWindowStartMsClampsToTracking(): void {
  const asOfMs = Date.parse("2026-07-10T10:00:00Z");
  const trackingStartedAt = "2026-07-04T10:00:00Z";
  const trackingStartMs = Date.parse(trackingStartedAt);

  const monthlyStart = resolveWindowStartMs(asOfMs, 30, trackingStartedAt, "monthly");
  assert.equal(monthlyStart, trackingStartMs);

  const longestStart = resolveWindowStartMs(asOfMs, 6, trackingStartedAt, "longest");
  assert.equal(longestStart, trackingStartMs);
}

function testScopedZoneInventoryBasis(): void {
  const startMs = Date.parse("2026-07-04T10:00:00Z");
  const endMs = Date.parse("2026-07-10T10:00:00Z");
  const snapshots = [
    makeSnapshot(isoAfter(startMs, 0), 100, { Centro: 40, Nord: 60 }),
    makeSnapshot(isoAfter(startMs, 6), 80, { Centro: 20, Nord: 60 }),
  ];

  const centroBasis = computeScopedInventoryBasis(
    snapshots,
    startMs,
    endMs,
    (listing) => listing.zone === "Centro",
  );
  const scaledBasis = Math.round(90 * (20 / 80));

  assert.equal(centroBasis, 40);
  assert.notEqual(centroBasis, scaledBasis);
}

function testAvgWaitingDaysUsesWindow(): void {
  const asOfMs = Date.parse("2026-07-10T10:00:00Z");
  const windowStartMs = Date.parse("2026-07-08T10:00:00Z");
  const listings: TrackedRentalListing[] = [
    {
      id: "active-old",
      price: 500,
      lat: 0,
      lng: 0,
      sqm: 50,
      rooms: 2,
      property_type: null,
      address: null,
      zone: "Centro",
      first_seen_at: isoAfter(asOfMs, -20),
      last_seen_at: isoAfter(asOfMs, 0),
      rented_at: null,
      status: "active",
      days_on_market: null,
      price_history: [],
    },
    {
      id: "active-new",
      price: 500,
      lat: 0,
      lng: 0,
      sqm: 50,
      rooms: 2,
      property_type: null,
      address: null,
      zone: "Centro",
      first_seen_at: isoAfter(asOfMs, -1),
      last_seen_at: isoAfter(asOfMs, 0),
      rented_at: null,
      status: "active",
      days_on_market: null,
      price_history: [],
    },
  ];

  const windowScoped = aggregateOccupancyListings(listings, 2, 2, 2, asOfMs, {
    flowMetricsReady: true,
    windowStartMs,
    turnoverWindowStartMs: windowStartMs,
  });
  const lifetime = aggregateOccupancyListings(listings, 2, 2, 2, asOfMs, {
    flowMetricsReady: true,
    windowStartMs: 0,
    turnoverWindowStartMs: 0,
  });

  assert.equal(windowScoped.avg_waiting_days, 2);
  assert.equal(lifetime.avg_waiting_days, 11);
  assert.ok((lifetime.avg_waiting_days ?? 0) > (windowScoped.avg_waiting_days ?? 0));
}

function testTurnoverWindowStartAlignsWithInventory(): void {
  const asOfMs = Date.parse("2026-07-10T10:00:00Z");
  const windowStartMs = Date.parse("2026-07-04T10:00:00Z");
  const calendarStartMs = asOfMs - 6 * DAY_MS;
  assert.equal(calendarStartMs, windowStartMs);

  const listings: TrackedRentalListing[] = [
    {
      id: "rented-in-window",
      price: 500,
      lat: 0,
      lng: 0,
      sqm: 50,
      rooms: 2,
      property_type: null,
      address: null,
      zone: "Centro",
      first_seen_at: isoAfter(windowStartMs, -2),
      last_seen_at: isoAfter(asOfMs, 0),
      rented_at: isoAfter(asOfMs, 0),
      status: "presumed_rented",
      days_on_market: 8,
      price_history: [],
    },
    {
      id: "rented-before-window",
      price: 500,
      lat: 0,
      lng: 0,
      sqm: 50,
      rooms: 2,
      property_type: null,
      address: null,
      zone: "Centro",
      first_seen_at: isoAfter(windowStartMs, -20),
      last_seen_at: isoAfter(windowStartMs, -1),
      rented_at: isoAfter(windowStartMs, -1),
      status: "presumed_rented",
      days_on_market: 12,
      price_history: [],
    },
  ];

  const metrics = aggregateOccupancyListings(listings, 6, 6, 10, asOfMs, {
    flowMetricsReady: true,
    windowStartMs,
    turnoverWindowStartMs: windowStartMs,
  });

  assert.equal(metrics.turnover_rented_30d, 1);
}

function run(): void {
  testTimeWeightedSparseSnapshots();
  testResolveWindowStartMsClampsToTracking();
  testScopedZoneInventoryBasis();
  testAvgWaitingDaysUsesWindow();
  testTurnoverWindowStartAlignsWithInventory();
  console.log("occupancy rebasing tests passed");
}

run();
