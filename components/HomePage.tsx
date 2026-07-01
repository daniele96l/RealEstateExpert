"use client";

import { useCallback, useState } from "react";
import ScenarioForm from "@/components/ScenarioForm";
import ListingsMap from "@/components/ListingsMap";
import MarketPriceCharts from "@/components/MarketPriceCharts";
import SummaryCards from "@/components/SummaryCards";
import PurchaseBreakdown from "@/components/PurchaseBreakdown";
import MonthlyBreakdownChart from "@/components/MonthlyBreakdownChart";
import {
  getDefaultSimpleScenario,
  sanitizeSimple,
  toInvestmentScenario,
  type SimpleScenario,
} from "@/lib/defaults";
import { runSimulation } from "@/lib/engine/simulator";
import type { AnalysisResult, ListingDetail, MapListing } from "@/lib/types";
import { Building2, BarChart3 } from "lucide-react";

export default function HomePage() {
  const [result, setResult] = useState<AnalysisResult | null>(() => {
    const s = sanitizeSimple(getDefaultSimpleScenario());
    return runSimulation(toInvestmentScenario(s));
  });
  const [formPrefill, setFormPrefill] = useState<Partial<SimpleScenario> | undefined>();
  const [marketCity, setMarketCity] = useState("Reggio Calabria");

  const handleFormChange = useCallback((simple: SimpleScenario) => {
    const cleaned = sanitizeSimple(simple);
    setResult(runSimulation(toInvestmentScenario(cleaned)));
  }, []);

  const handleSelectListing = useCallback((listing: MapListing, detail?: ListingDetail) => {
    const d = detail ?? listing;
    const sqm = d.sqm ?? listing.sqm;
    setFormPrefill({
      ...(d.operation === "sale"
        ? { purchase_price: d.price, rental_mode: "medium_term_semester" as const }
        : { monthly_rent: d.price, rental_mode: "medium_term_semester" as const, rent_price_basis: "whole" as const }),
      ...(sqm != null && sqm > 0 ? { sqm } : {}),
      ...(d.rooms != null && d.rooms > 0 ? { rent_rooms: d.rooms } : {}),
      ...(detail?.energy_class ? { energy_class: detail.energy_class } : {}),
      ...(detail?.condominio_monthly ? { condominio_monthly: detail.condominio_monthly } : {}),
      ...(detail?.needs_renovation === true ? { renovation_cost: 15_000 } : {}),
    });
  }, []);

  const handleUseSimilarRent = useCallback((saleDetail: ListingDetail, rentListing: MapListing) => {
    setFormPrefill({
      purchase_price: saleDetail.price,
      rental_mode: "medium_term_semester" as const,
      monthly_rent: rentListing.price,
      rent_price_basis: "whole" as const,
      ...(saleDetail.rooms != null && saleDetail.rooms > 0 ? { rent_rooms: saleDetail.rooms } : {}),
      ...(saleDetail.sqm != null && saleDetail.sqm > 0 ? { sqm: saleDetail.sqm } : {}),
      ...(saleDetail.energy_class ? { energy_class: saleDetail.energy_class } : {}),
      ...(saleDetail.condominio_monthly ? { condominio_monthly: saleDetail.condominio_monthly } : {}),
      ...(saleDetail.needs_renovation === true ? { renovation_cost: 15_000 } : {}),
    });
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-surface-border/60 bg-surface-raised/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-5 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Building2 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">RealEstateExpert</h1>
            <p className="text-sm text-slate-400">Simulatore investimento immobiliare — Italia</p>
          </div>
          <a
            href="#parametri"
            className="ml-auto rounded-lg border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-raised lg:hidden"
          >
            Parametri
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div
            id="parametri"
            className="lg:sticky lg:top-6 lg:z-10 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
          >
            <ScenarioForm onChange={handleFormChange} prefill={formPrefill} />
          </div>

          <div className="min-w-0 space-y-6">
            <ListingsMap
              onSelectListing={handleSelectListing}
              onUseSimilarRent={handleUseSimilarRent}
              onCityChange={setMarketCity}
            />
            {result ? (
              <>
                <SummaryCards result={result} />
                <PurchaseBreakdown costs={result.summary.purchase_costs} />
                <MonthlyBreakdownChart result={result} />
                <MarketPriceCharts city={marketCity} />
              </>
            ) : (
              <div className="card-glass flex flex-col items-center justify-center px-8 py-24 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <BarChart3 size={32} />
                </div>
                <h2 className="text-lg font-semibold text-slate-200">Inserisci i dati e analizza</h2>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-12 border-t border-surface-border/40 pt-6 text-center text-xs text-slate-600">
          Stime indicative — imposta di registro sul valore catastale, cedolare secca 21%/26%. Non è consulenza fiscale.
        </footer>
      </main>
    </div>
  );
}
