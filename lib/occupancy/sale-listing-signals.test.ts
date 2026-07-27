import { describe, expect, it } from "vitest";
import { parseSaleListingSignals } from "./sale-listing-signals";

describe("parseSaleListingSignals", () => {
  it("detects Czech cooperative ownership", () => {
    const signals = parseSaleListingSignals({
      description: "Nabízíme krásný družstevní byt 2+kk v Brno.",
    });
    expect(signals.ownership).toBe("cooperative");
  });

  it("detects personal ownership (OV)", () => {
    const signals = parseSaleListingSignals({
      description: "Byt v osobním vlastnictví, OV, ihned k nastěhování.",
    });
    expect(signals.ownership).toBe("personal");
  });

  it("prefers structured floor for ground level", () => {
    const signals = parseSaleListingSignals({
      floor: "Přízemí",
      description: "Hezký byt s balkonem.",
    });
    expect(signals.floor).toBe("ground");
  });

  it("detects basement from description", () => {
    const signals = parseSaleListingSignals({
      description: "Sklepní byt / suterén, tiché bydlení.",
    });
    expect(signals.floor).toBe("basement");
  });

  it("detects upper floor patterns", () => {
    const signals = parseSaleListingSignals({
      description: "Byt ve 3. patře panelového domu s výtahem.",
    });
    expect(signals.floor).toBe("upper");
    expect(signals.panel_building).toBe(true);
  });

  it("detects renovation and outdoor signals", () => {
    const signals = parseSaleListingSignals({
      description: "Byt po kompletní rekonstrukci s balkonem a terasou.",
    });
    expect(signals.after_renovation).toBe(true);
    expect(signals.has_outdoor).toBe(true);
  });

  it("detects Italian cooperative and piano terra", () => {
    const signals = parseSaleListingSignals({
      description: "Appartamento in cooperativa al piano terra con giardino.",
    });
    expect(signals.ownership).toBe("cooperative");
    expect(signals.floor).toBe("ground");
    expect(signals.has_outdoor).toBe(true);
  });

  it("returns unknowns when empty", () => {
    const signals = parseSaleListingSignals({});
    expect(signals.ownership).toBe("unknown");
    expect(signals.floor).toBe("unknown");
    expect(signals.coop_loan).toBe(false);
  });

  it("detects Filkukova-style coop share with loan and nadzemni podlazi", () => {
    const signals = parseSaleListingSignals({
      description: `Nabízíme k převodu novostavbu družstevního bytu o dispozici 2+kk
s balkonem 3 m², který se nachází ve 2. nadzemním podlaží. Družstevní vlastnictví —
předmětem prodeje je převod družstevního podílu. Kupující přebírá odpovídající část
dlouhodobého úvěru bytového družstva. Alikvotní část úvěru činí 4 400 000 Kč.
Měsíční platba družstvu ve výši 24 355 Kč.`,
    });
    expect(signals.ownership).toBe("cooperative");
    expect(signals.floor).toBe("upper");
    expect(signals.has_outdoor).toBe(true);
    expect(signals.coop_loan).toBe(true);
    expect(signals.new_build).toBe(true);
    expect(signals.condition).toBe("new_build");
  });

  it("classifies renovated and needs-renovation conditions", () => {
    expect(
      parseSaleListingSignals({ description: "Byt po kompletní rekonstrukci, ihned k nastěhování." })
        .condition,
    ).toBe("renovated");
    expect(
      parseSaleListingSignals({ description: "Byt k rekonstrukci, v původním stavu." }).condition,
    ).toBe("needs_renovation");
  });
});
