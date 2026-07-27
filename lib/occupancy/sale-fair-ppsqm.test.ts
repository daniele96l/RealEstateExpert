import { describe, expect, it } from "vitest";
import {
  askingVsFairPct,
  comparableSalePpsqmValues,
  estimateFairSalePpsqm,
} from "./sale-fair-ppsqm";
import type { SaleListingSignals } from "./sale-listing-signals";
import type { TrackedRentalListing } from "@/lib/types";

const baseSignals: SaleListingSignals = {
  ownership: "unknown",
  floor: "unknown",
  condition: "unknown",
  after_renovation: false,
  needs_renovation: false,
  panel_building: false,
  brick_building: false,
  has_outdoor: false,
  coop_loan: false,
  new_build: false,
};

function listing(
  partial: Partial<TrackedRentalListing> & Pick<TrackedRentalListing, "id" | "price" | "sqm">,
): TrackedRentalListing {
  return {
    status: "active",
    first_seen_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-07-27T00:00:00.000Z",
    rented_at: null,
    days_on_market: 10,
    lat: 0,
    lng: 0,
    rooms: 2,
    address: null,
    zone: "Žebětín",
    url: null,
    description: null,
    property_type: "flat",
    price_history: [],
    ...partial,
  };
}

describe("comparableSalePpsqmValues", () => {
  it("does not mix large houses into small-flat comps", () => {
    const subject = listing({ id: "s", price: 5_000_000, sqm: 50 });
    const universe = [
      subject,
      listing({ id: "f1", price: 6_000_000, sqm: 55 }),
      listing({ id: "f2", price: 5_500_000, sqm: 48 }),
      listing({ id: "f3", price: 5_800_000, sqm: 52 }),
      listing({ id: "h1", price: 9_000_000, sqm: 215 }),
      listing({ id: "h2", price: 8_800_000, sqm: 180 }),
    ];
    const comps = comparableSalePpsqmValues(subject, universe);
    expect(comps.every((v) => v > 90_000)).toBe(true);
    expect(comps.some((v) => v < 50_000)).toBe(false);
  });
});

describe("estimateFairSalePpsqm", () => {
  it("returns null without comps", () => {
    expect(
      estimateFairSalePpsqm({
        listing: listing({ id: "s", price: 5_000_000, sqm: 50 }),
        universe: [],
        signals: baseSignals,
      }),
    ).toBeNull();
  });

  it("discounts cooperative vs renovated brick with outdoor", () => {
    const universe = [
      listing({ id: "c1", price: 6_500_000, sqm: 50 }),
      listing({ id: "c2", price: 6_600_000, sqm: 52 }),
      listing({ id: "c3", price: 6_400_000, sqm: 49 }),
      listing({ id: "c4", price: 6_550_000, sqm: 51 }),
    ];
    const coop = estimateFairSalePpsqm({
      listing: listing({ id: "s", price: 5_000_000, sqm: 50 }),
      universe,
      signals: {
        ...baseSignals,
        ownership: "cooperative",
        floor: "basement",
        condition: "needs_renovation",
        panel_building: true,
      },
    });
    const personal = estimateFairSalePpsqm({
      listing: listing({
        id: "s2",
        price: 7_000_000,
        sqm: 50,
        lift: true,
      }),
      universe,
      signals: {
        ...baseSignals,
        ownership: "personal",
        floor: "upper",
        condition: "renovated",
        brick_building: true,
        has_outdoor: true,
      },
      energyClass: "B",
    });
    expect(coop).not.toBeNull();
    expect(personal).not.toBeNull();
    expect(coop!.fairPpsqm).toBeLessThan(coop!.basePpsqm);
    expect(personal!.fairPpsqm).toBeGreaterThan(coop!.fairPpsqm);
  });

  it("marks asking below fair as negative pct", () => {
    expect(askingVsFairPct(80_000, 100_000)).toBeCloseTo(-20);
  });
});
