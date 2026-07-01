"use client";

import { useCallback, useState } from "react";
import ScenarioForm from "@/components/ScenarioForm";
import ListingsMap from "@/components/ListingsMap";
import SummaryCards from "@/components/SummaryCards";
import CashFlowChart from "@/components/CashFlowChart";
import AnnualSummaryChart from "@/components/AnnualSummaryChart";
import MonthlyBreakdownChart from "@/components/MonthlyBreakdownChart";
import PurchaseBreakdown from "@/components/PurchaseBreakdown";
import {
  getDefaultSimpleScenario,
  sanitizeSimple,
  toInvestmentScenario,
  type SimpleScenario,
} from "@/lib/defaults";
import { runSimulation } from "@/lib/engine/simulator";
import type { AnalysisResult, MapListing } from "@/lib/types";
import { Building2, BarChart3 } from "lucide-react";

export default function HomePage() {
  const [result, setResult] = useState<AnalysisResult | null>(() => {
    const s = sanitizeSimple(getDefaultSimpleScenario());
    return runSimulation(toInvestmentScenario(s));
  });
  const [loading, setLoading] = useState(false);
  const [formPrefill, setFormPrefill] = useState<Partial<SimpleScenario> | undefined>();

  const handleAnalyze = useCallback((simple: SimpleScenario) => {
    setLoading(true);
    requestAnimationFrame(() => {
      const cleaned = sanitizeSimple(simple);
      setResult(runSimulation(toInvestmentScenario(cleaned)));
      setLoading(false);
    });
  }, []);

  const handleSelectListing = useCallback((listing: MapListing) => {
    if (listing.operation === "sale") {
      setFormPrefill({
        purchase_price: listing.price,
        rental_mode: "long_term",
        ...(listing.sqm != null && listing.sqm > 0 ? { sqm: listing.sqm } : {}),
      });
    } else {
      setFormPrefill({
        monthly_rent: listing.price,
        rental_mode: "long_term",
        ...(listing.sqm != null && listing.sqm > 0 ? { sqm: listing.sqm } : {}),
      });
    }
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
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            <ScenarioForm onSubmit={handleAnalyze} loading={loading} prefill={formPrefill} />
          </div>

          <div className="space-y-6">
            <ListingsMap onSelectListing={handleSelectListing} />
            {result ? (
              <>
                <SummaryCards result={result} />
                <PurchaseBreakdown costs={result.summary.purchase_costs} />
                <CashFlowChart result={result} />
                <MonthlyBreakdownChart result={result} />
                <AnnualSummaryChart result={result} />
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
