import { describe, expect, it } from "vitest";
import { askingVsFairPct, estimateFairSalePpsqm } from "./sale-fair-ppsqm";
import type { SaleListingSignals } from "./sale-listing-signals";

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

describe("estimateFairSalePpsqm", () => {
  it("returns null without a baseline", () => {
    expect(
      estimateFairSalePpsqm({
        zoneAvgPpsqm: null,
        signals: baseSignals,
      }),
    ).toBeNull();
  });

  it("discounts cooperative basement vs personal upper renovated", () => {
    const coop = estimateFairSalePpsqm({
      zoneAvgPpsqm: 100_000,
      signals: {
        ...baseSignals,
        ownership: "cooperative",
        floor: "basement",
        condition: "needs_renovation",
        panel_building: true,
      },
    });
    const personal = estimateFairSalePpsqm({
      zoneAvgPpsqm: 100_000,
      signals: {
        ...baseSignals,
        ownership: "personal",
        floor: "upper",
        condition: "renovated",
        brick_building: true,
        has_outdoor: true,
      },
      energyClass: "B",
      lift: true,
    });
    expect(coop).not.toBeNull();
    expect(personal).not.toBeNull();
    expect(coop!.fairPpsqm).toBeLessThan(100_000);
    expect(personal!.fairPpsqm).toBeGreaterThan(coop!.fairPpsqm);
  });

  it("marks asking below fair as negative pct", () => {
    expect(askingVsFairPct(80_000, 100_000)).toBeCloseTo(-20);
  });
});
