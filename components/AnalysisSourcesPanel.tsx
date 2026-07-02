"use client";

import dynamic from "next/dynamic";
import {
  estimateRentableRooms,
  estimateWholeFlatRent,
  inferRentPriceBasis,
  rentPriceBasisBadgeClass,
  rentPriceBasisLabel,
  similarRentEstimateSummary,
  SINGLE_RENTABLE_ROOM_PREMIUM,
} from "@/lib/rent-price-basis";
import type { ListingAnalysisSource } from "@/lib/listing-analysis";
import { resolveScenarioMonthlyRent, type SimpleScenario } from "@/lib/defaults";
import { cn, fmtEuro } from "@/lib/utils";
import { Building2, Download, ExternalLink, Home, Key } from "lucide-react";
import { downloadAnalysisJson } from "@/lib/analysis-history-client";
import { createSavedComparison } from "@/lib/analysis-history";

const PropertySimilarRentMap = dynamic(() => import("./PropertySimilarRentMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-surface-border/60 text-sm text-slate-500">
      Caricamento mappa…
    </div>
  ),
});

interface Props {
  source: ListingAnalysisSource;
  scenario: SimpleScenario;
}

function RentComparableRow({ rent }: { rent: ListingAnalysisSource["similarRentals"][number] }) {
  const basis = inferRentPriceBasis(rent);
  const wholeFlat = estimateWholeFlatRent(rent, basis);

  return (
    <div className="rounded-lg border border-surface-border/60 bg-surface-raised/40 p-3">
      <p className="text-sm font-medium text-slate-200 line-clamp-2">{rent.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-500">
          {wholeFlat
            ? [
                `${fmtEuro(wholeFlat.pricePerRoom)}/mese/stanza`,
                `${wholeFlat.roomCount} locali`,
                `→ ${fmtEuro(wholeFlat.totalMonthly)}/mese intero stimato`,
              ].join(" · ")
            : [
                `${fmtEuro(rent.price)}/mese`,
                rent.sqm != null && `${rent.sqm} m²`,
                rent.rooms != null && `${rent.rooms} locali`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            rentPriceBasisBadgeClass(basis),
          )}
        >
          {rentPriceBasisLabel(basis)}
        </span>
      </div>
      <a
        href={rent.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
      >
        <ExternalLink size={12} />
        Idealista
      </a>
    </div>
  );
}

export default function AnalysisSourcesPanel({ source, scenario }: Props) {
  const { sale, similarRentals } = source;
  const method = source.rentEstimateMethod ?? "per_room";
  const rentSummary = similarRentEstimateSummary(sale, similarRentals, method);
  const avgRentPerRoom = rentSummary.avgRentPerRoom;
  const avgRentPerSqm = rentSummary.avgRentPerSqm;
  const avgWholeMonthly = rentSummary.avgWholeMonthly;
  const underTwoLocali = rentSummary.underTwoLocali;
  const rentableRooms = estimateRentableRooms(sale.rooms);
  const grossRent = resolveScenarioMonthlyRent(scenario);

  return (
    <section className="card-glass overflow-hidden">
      <div className="border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-accent" />
              <h2 className="font-semibold text-slate-100">Annunci usati nell&apos;analisi</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Immobile in vendita e {similarRentals.length} affitti simili usati per stimare il canone
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadAnalysisJson(createSavedComparison(source, scenario))
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-raised"
          >
            <Download size={14} />
            Esporta JSON
          </button>
        </div>
      </div>

      <div className="border-b border-surface-border/60 px-5 py-4">
        <PropertySimilarRentMap saleProperty={sale} similarRentals={similarRentals} />
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-emerald-400">
            <Home size={14} />
            Acquisto
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="font-medium text-slate-100 line-clamp-2">{sale.title}</p>
            <p className="mt-1 text-lg font-bold text-accent">{fmtEuro(sale.price)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {[
                sale.sqm != null && `${sale.sqm} m²`,
                sale.rooms != null && `${sale.rooms} locali`,
                sale.zone,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <a
              href={sale.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <ExternalLink size={12} />
              Apri su Idealista
            </a>
          </div>

          <div className="rounded-xl border border-surface-border/60 bg-surface-raised/30 p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-300">Valori applicati al form</p>
            <ul className="mt-2 space-y-1">
              <li>Prezzo acquisto: {fmtEuro(scenario.purchase_price)}</li>
              <li>Superficie: {scenario.sqm} m²</li>
              <li>
                Affitto:{" "}
                {scenario.rent_price_basis === "per_room"
                  ? `${fmtEuro(scenario.monthly_rent)}/stanza × ${scenario.rent_rooms} → ${fmtEuro(grossRent)}/mese`
                  : `${fmtEuro(scenario.monthly_rent)}/mese (intero)`}
              </li>
              {scenario.condominio_monthly > 0 && (
                <li>Condominio: {fmtEuro(scenario.condominio_monthly)}/mese</li>
              )}
              {scenario.renovation_cost > 0 && (
                <li>Ristrutturazione: {fmtEuro(scenario.renovation_cost)}</li>
              )}
            </ul>
          </div>
        </div>

        <div className="min-h-0 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-blue-400">
            <Key size={14} />
            Affitti simili ({similarRentals.length})
          </div>

          <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-accent">
              Media usata nell&apos;analisi
              {method === "per_sqm" ? " (€/m²)" : ""}
            </p>
            {method === "per_sqm" && avgWholeMonthly != null && avgRentPerSqm != null && sale.sqm ? (
              <>
                <p className="mt-0.5 text-base font-bold text-slate-100">
                  {fmtEuro(avgWholeMonthly)}
                  <span className="text-sm font-normal text-slate-400">/mese intero</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {avgRentPerSqm.toLocaleString("it-IT", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 1,
                  })}
                  /m² × {sale.sqm} m² = {fmtEuro(avgWholeMonthly)}/mese
                </p>
              </>
            ) : underTwoLocali && avgWholeMonthly != null && avgRentPerRoom != null ? (
              <>
                <p className="mt-0.5 text-base font-bold text-slate-100">
                  {fmtEuro(avgWholeMonthly)}
                  <span className="text-sm font-normal text-slate-400">/mese intero</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {fmtEuro(avgRentPerRoom)}/stanza × {SINGLE_RENTABLE_ROOM_PREMIUM.toLocaleString("it-IT")} ={" "}
                  {fmtEuro(avgWholeMonthly)}/mese
                </p>
              </>
            ) : avgRentPerRoom != null ? (
              <>
                <p className="mt-0.5 text-base font-bold text-slate-100">
                  {fmtEuro(avgRentPerRoom)}
                  <span className="text-sm font-normal text-slate-400">/mese/stanza</span>
                </p>
                {avgWholeMonthly != null && rentableRooms != null && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fmtEuro(avgRentPerRoom)}/stanza × {rentableRooms} stanze = {fmtEuro(avgWholeMonthly)}/mese
                  </p>
                )}
              </>
            ) : null}
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {similarRentals.map((rent) => (
              <RentComparableRow key={rent.id} rent={rent} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
