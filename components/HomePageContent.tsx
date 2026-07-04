"use client";

import { useCallback, useEffect, useState } from "react";
import ScenarioForm from "@/components/ScenarioForm";
import ListingsMap from "@/components/ListingsMap";
import MarketToggle from "@/components/MarketToggle";
import LanguageToggle from "@/components/LanguageToggle";
import AnalysisSourcesPanel from "@/components/AnalysisSourcesPanel";
import AnalysisHistoryPanel from "@/components/AnalysisHistoryPanel";
import MarketPriceCharts from "@/components/MarketPriceCharts";
import PurchaseBreakdown from "@/components/PurchaseBreakdown";
import MonthlyBreakdownChart from "@/components/MonthlyBreakdownChart";
import RoiChart from "@/components/RoiChart";
import ListingsExportPanel from "@/components/ListingsExportPanel";
import {
  getDefaultSimpleScenario,
  sanitizeSimple,
  toInvestmentScenario,
  type SimpleScenario,
} from "@/lib/defaults";
import { runSimulation } from "@/lib/engine/simulator";
import { estimateRentableRooms, similarRentEstimateSummary, type SimilarRentEstimateMethod } from "@/lib/rent-price-basis";
import { listingRenovationCost } from "@/lib/constants";
import {
  scenarioFromListingAnalysis,
  type ListingAnalysisSource,
} from "@/lib/listing-analysis";
import { saveAnalysisComparison } from "@/lib/analysis-history-client";
import { useI18n } from "@/lib/i18n/context";
import {
  getMarket,
  readStoredMarket,
  writeStoredMarket,
  type MarketId,
} from "@/lib/markets";
import { clearLocalListingsCacheForMarket } from "@/lib/listings-cache-client";
import type { AnalysisResult, ListingDetail, MapListing } from "@/lib/types";
import type { ListingsExportContext } from "@/lib/listings-export";
import { Building2, BarChart3 } from "lucide-react";

function initialMarketScenario(): SimpleScenario {
  const stored = typeof window !== "undefined" ? readStoredMarket() : "it";
  return sanitizeSimple(getDefaultSimpleScenario(stored), stored);
}

export default function HomePageContent() {
  const { t, ready: i18nReady } = useI18n();
  const [market, setMarket] = useState<MarketId>(() =>
    typeof window !== "undefined" ? readStoredMarket() : "it",
  );
  const [marketReady, setMarketReady] = useState(false);
  const [scenario, setScenario] = useState(initialMarketScenario);
  const [result, setResult] = useState<AnalysisResult | null>(() => {
    const initial = initialMarketScenario();
    const stored = typeof window !== "undefined" ? readStoredMarket() : "it";
    return runSimulation(toInvestmentScenario(initial, stored), stored);
  });
  const [formPrefill, setFormPrefill] = useState<Partial<SimpleScenario> | undefined>();
  const [formSyncToken, setFormSyncToken] = useState(0);
  const [marketCity, setMarketCity] = useState("Reggio Calabria");
  const [analysisSource, setAnalysisSource] = useState<ListingAnalysisSource | null>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [listingsResetToken, setListingsResetToken] = useState(0);
  const [exportCacheRefreshToken, setExportCacheRefreshToken] = useState(0);
  const [exportContext, setExportContext] = useState<ListingsExportContext | null>(null);

  useEffect(() => {
    const stored = readStoredMarket();
    setMarket(stored);
    const cfg = getMarket(stored);
    const initial = sanitizeSimple(getDefaultSimpleScenario(stored), stored);
    setScenario(initial);
    setResult(runSimulation(toInvestmentScenario(initial, stored), stored));
    setMarketCity(cfg.defaultCity);
    setMarketReady(true);
  }, []);

  const updateScenario = useCallback(
    (simple: SimpleScenario) => {
      const cleaned = sanitizeSimple(simple, market);
      setScenario(cleaned);
      setResult(runSimulation(toInvestmentScenario(cleaned, market), market));
    },
    [market],
  );

  const handleFormChange = updateScenario;

  const handlePurchaseScenarioChange = useCallback(
    (simple: SimpleScenario) => {
      updateScenario(simple);
      setFormSyncToken((n) => n + 1);
    },
    [updateScenario],
  );

  const handleMarketChange = useCallback((next: MarketId) => {
    if (next === market) return;
    writeStoredMarket(next);
    clearLocalListingsCacheForMarket(market);
    clearLocalListingsCacheForMarket(next);
    const cfg = getMarket(next);
    const initial = sanitizeSimple(getDefaultSimpleScenario(next), next);
    setMarket(next);
    setMarketCity(cfg.defaultCity);
    setScenario(initial);
    setResult(runSimulation(toInvestmentScenario(initial, next), next));
    setFormPrefill(undefined);
    setFormSyncToken((n) => n + 1);
    setAnalysisSource(null);
    setListingsResetToken((n) => n + 1);
  }, [market]);

  const handleSelectListing = useCallback((listing: MapListing, detail?: ListingDetail) => {
    const d = detail ?? listing;
    const sqm = d.sqm ?? listing.sqm;
    const renovation = listingRenovationCost(detail?.needs_renovation, sqm, d.price);
    setFormPrefill({
      ...(d.operation === "sale"
        ? { purchase_price: d.price, rental_mode: "medium_term_semester" as const }
        : { monthly_rent: d.price, rental_mode: "medium_term_semester" as const, rent_price_basis: "whole" as const }),
      ...(sqm != null && sqm > 0 ? { sqm } : {}),
      ...(d.rooms != null && d.rooms > 0
        ? { rent_rooms: estimateRentableRooms(d.rooms) ?? d.rooms }
        : {}),
      ...(detail?.energy_class ? { energy_class: detail.energy_class } : {}),
      ...(detail?.condominio_monthly ? { condominio_monthly: detail.condominio_monthly } : {}),
      ...(renovation != null ? { renovation_cost: renovation } : {}),
    });
  }, []);

  const handleUseSimilarRent = useCallback((saleDetail: ListingDetail, rentListing: MapListing) => {
    const renovation = listingRenovationCost(
      saleDetail.needs_renovation,
      saleDetail.sqm,
      saleDetail.price,
    );
    setFormPrefill({
      purchase_price: saleDetail.price,
      rental_mode: "medium_term_semester" as const,
      monthly_rent: rentListing.price,
      rent_price_basis: "whole" as const,
      ...(saleDetail.rooms != null && saleDetail.rooms > 0
        ? { rent_rooms: estimateRentableRooms(saleDetail.rooms) ?? saleDetail.rooms }
        : {}),
      ...(saleDetail.sqm != null && saleDetail.sqm > 0 ? { sqm: saleDetail.sqm } : {}),
      ...(saleDetail.energy_class ? { energy_class: saleDetail.energy_class } : {}),
      ...(saleDetail.condominio_monthly ? { condominio_monthly: saleDetail.condominio_monthly } : {}),
      ...(renovation != null ? { renovation_cost: renovation } : {}),
    });
  }, []);

  const handleUseAverageRent = useCallback(
    (
      saleDetail: ListingDetail,
      similarRentals: MapListing[],
      estimateMethod: SimilarRentEstimateMethod,
    ) => {
      const summary = similarRentEstimateSummary(saleDetail, similarRentals, estimateMethod);
      if (summary.avgWholeMonthly == null && summary.avgRentPerRoom == null) return;

      const next = scenarioFromListingAnalysis(
        saleDetail,
        summary.avgRentPerRoom ?? 0,
        summary.avgWholeMonthly,
        market,
      );
      const source: ListingAnalysisSource = {
        sale: saleDetail,
        similarRentals,
        avgRentPerRoom: summary.avgRentPerRoom ?? 0,
        avgWholeMonthly: summary.avgWholeMonthly,
        rentEstimateMethod: estimateMethod,
      };
      setAnalysisSource(source);
      setFormPrefill(next);
      saveAnalysisComparison(source, next, marketCity, market);
      setHistoryRefreshToken((n) => n + 1);
      document.getElementById("parametri")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [marketCity, market],
  );

  const handleRestoreAnalysis = useCallback(
    (source: ListingAnalysisSource, restoredScenario: SimpleScenario) => {
      const method = source.rentEstimateMethod ?? "per_room";
      const summary = similarRentEstimateSummary(source.sale, source.similarRentals, method);
      const scenario =
        summary.avgRentPerRoom != null
          ? scenarioFromListingAnalysis(
              source.sale,
              summary.avgRentPerRoom,
              summary.avgWholeMonthly,
              market,
            )
          : restoredScenario;
      setAnalysisSource({
        ...source,
        avgRentPerRoom: summary.avgRentPerRoom ?? source.avgRentPerRoom,
        avgWholeMonthly: summary.avgWholeMonthly,
        rentEstimateMethod: method,
      });
      setFormPrefill(scenario);
      updateScenario(scenario);
      setFormSyncToken((n) => n + 1);
    },
    [updateScenario],
  );

  const marketCfg = getMarket(market);
  const subtitle = market === "cz" ? t("market.subtitleCz") : t("market.subtitleIt");

  if (!marketReady || !i18nReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-surface-border/60 bg-surface-raised/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-5 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Building2 size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">RealEstateExpert</h1>
            <p className="text-sm text-slate-400">{subtitle}</p>
          </div>
          <LanguageToggle />
          <MarketToggle market={market} onChange={handleMarketChange} className="order-last w-full sm:order-none sm:w-auto" />
          <a
            href="#parametri"
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-raised lg:hidden"
          >
            {t("nav.parameters")}
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div
            id="parametri"
            className="lg:sticky lg:top-6 lg:z-10 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
          >
            <ScenarioForm
              key={market}
              market={market}
              onChange={handleFormChange}
              prefill={formPrefill}
              syncScenario={scenario}
              syncToken={formSyncToken}
            />
          </div>

          <div className="min-w-0 space-y-6">
            <ListingsMap
              key={`${market}-${listingsResetToken}`}
              market={market}
              defaultCity={marketCfg.defaultCity}
              onSelectListing={handleSelectListing}
              onUseSimilarRent={handleUseSimilarRent}
              onUseAverageRent={handleUseAverageRent}
              onCityChange={setMarketCity}
              onExportContextChange={setExportContext}
              cacheRefreshToken={exportCacheRefreshToken}
            />
            <AnalysisHistoryPanel
              market={market}
              onRestore={handleRestoreAnalysis}
              refreshToken={historyRefreshToken}
            />
            {result ? (
              <>
                {analysisSource && (
                  <AnalysisSourcesPanel source={analysisSource} scenario={scenario} market={market} />
                )}
                <PurchaseBreakdown
                  market={market}
                  costs={result.summary.purchase_costs}
                  scenario={scenario}
                  onScenarioChange={handlePurchaseScenarioChange}
                />
                <MonthlyBreakdownChart result={result} market={market} />
                <RoiChart result={result} market={market} />
                <MarketPriceCharts city={marketCity} market={market} />
                <ListingsExportPanel
                  market={market}
                  context={exportContext}
                  onExportComplete={() => setExportCacheRefreshToken((n) => n + 1)}
                />
              </>
            ) : (
              <div className="card-glass flex flex-col items-center justify-center px-8 py-24 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <BarChart3 size={32} />
                </div>
                <h2 className="text-lg font-semibold text-slate-200">{t("home.emptyTitle")}</h2>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-12 border-t border-surface-border/40 pt-6 text-center text-xs text-slate-600">
          {market === "cz" ? t("home.footerCz") : t("home.footerIt")}
        </footer>
      </main>
    </div>
  );
}
