"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import type { SimpleScenario } from "@/lib/defaults";
import {
  applyRentalModeToSimple,
  getDefaultSimpleScenario,
  resolveUtilitiesAnnual,
} from "@/lib/defaults";
import { estimateSqmFromPrice, estimateUtilitiesAnnual, ITALY_DEFAULTS } from "@/lib/constants";
import { estimateCzechUtilitiesAnnual } from "@/lib/constants-cz";
import type { MarketId } from "@/lib/markets";
import { getRentalModeRules } from "@/lib/rental-presets";
import { cn, fmtMoney } from "@/lib/utils";
import { Home, Key, Sparkles, Info } from "lucide-react";
import type { RentalMode } from "@/lib/types";

interface Props {
  market: MarketId;
  onChange: (data: SimpleScenario) => void;
  prefill?: Partial<SimpleScenario>;
  syncScenario?: SimpleScenario;
  syncToken?: number;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-field">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function RentalModeInfo({ mode, propertyType }: { mode: RentalMode; propertyType: "prima_casa" | "investment" }) {
  const rules = getRentalModeRules(mode);
  return (
    <div className="sm:col-span-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-slate-400">
      <div className="mb-2 flex items-center gap-1.5 font-medium text-accent">
        <Info size={14} />
        Regime: {rules.label}
      </div>
      <ul className="space-y-1.5 leading-relaxed">
        <li>
          <span className="text-slate-300">Cedolare secca:</span> {rules.cedolare_pct}% — {rules.cedolare_note}
        </li>
        <li>
          <span className="text-slate-300">IMU:</span>{" "}
          {propertyType === "prima_casa"
            ? "Esonero — abitazione principale (prima casa)."
            : rules.imu_note}
        </li>
        <li>
          <span className="text-slate-300">Occupazione tipica:</span> {rules.occupancy_pct}% — {rules.occupancy_note}
        </li>
        {mode === "medium_term_semester" ? (
          <>
            <li>
              <span className="text-slate-300">Pulizie:</span> ~€{rules.cleaning_fee_per_turnover} × {rules.turnovers_per_year} cambi/anno tra semestri.
            </li>
            <li>{rules.utilities_note}</li>
          </>
        ) : mode === "short_term_airbnb" ? (
          <>
            <li>
              <span className="text-slate-300">Piattaforma:</span> ~{rules.platform_fee_pct * 100}% sul lordo (Airbnb/Booking).
            </li>
            <li>
              <span className="text-slate-300">Pulizie:</span> ~€{rules.cleaning_fee_per_turnover} per cambio ospite.
            </li>
            <li>{rules.utilities_note}</li>
          </>
        ) : null}
      </ul>
    </div>
  );
}

export default function ScenarioForm({ market, onChange, prefill, syncScenario, syncToken }: Props) {
  const currency = market === "cz" ? "Kč" : "€";
  const { register, watch, reset, setValue, getValues } = useForm<SimpleScenario>({
    defaultValues: getDefaultSimpleScenario(market),
  });

  const rentalMode = watch("rental_mode");
  const propertyType = watch("property_type");
  const purchasePrice = watch("purchase_price");
  const sqm = watch("sqm");
  const energyClass = watch("energy_class");
  const occupancyPct = watch("occupancy_pct");
  const utilitiesAuto = watch("utilities_auto");
  const rentPriceBasis = watch("rent_price_basis");
  const rentRooms = watch("rent_rooms");
  const monthlyRent = watch("monthly_rent");
  const prevMode = useRef<RentalMode | null>(null);
  const prevPrice = useRef<number | null>(null);
  const syncScenarioRef = useRef(syncScenario);
  syncScenarioRef.current = syncScenario;

  useEffect(() => {
    if (prefill) {
      const merged = { ...getDefaultSimpleScenario(market), ...prefill };
      reset(merged);
      prevMode.current = prefill.rental_mode ?? "medium_term_semester";
      prevPrice.current = prefill.purchase_price ?? merged.purchase_price;
      onChange(merged);
    }
  }, [prefill, reset, onChange, market]);

  useEffect(() => {
    if (!syncToken) return;
    const synced = syncScenarioRef.current;
    if (synced == null) return;
    reset(synced);
    prevMode.current = synced.rental_mode;
    prevPrice.current = synced.purchase_price;
  }, [syncToken, reset]);

  useEffect(() => {
    if (prevMode.current === null) {
      prevMode.current = rentalMode;
      return;
    }
    if (prevMode.current === rentalMode) return;
    prevMode.current = rentalMode;

    const updated = applyRentalModeToSimple(getValues(), rentalMode, market);
    setValue("occupancy_pct", updated.occupancy_pct);
    setValue("monthly_rent", updated.monthly_rent);
    setValue("nightly_rate", updated.nightly_rate);
    setValue("furnishing_cost", updated.furnishing_cost);
    setValue("condominio_monthly", updated.condominio_monthly);
    if (getValues("utilities_auto")) {
      setValue("utilities_annual", updated.utilities_annual);
    }
  }, [rentalMode, purchasePrice, setValue, getValues, market]);

  useEffect(() => {
    if (prevPrice.current === null) {
      prevPrice.current = purchasePrice;
      return;
    }
    if (prevPrice.current === purchasePrice) return;
    prevPrice.current = purchasePrice;
    if (purchasePrice > 0) {
      setValue("sqm", estimateSqmFromPrice(purchasePrice));
    }
  }, [purchasePrice, setValue]);

  useEffect(() => {
    if (!utilitiesAuto) return;
    const values = getValues();
    setValue(
      "utilities_annual",
      market === "cz"
        ? estimateCzechUtilitiesAnnual(
            values.sqm || estimateSqmFromPrice(values.purchase_price),
            values.energy_class,
            values.rental_mode,
            values.occupancy_pct,
          )
        : estimateUtilitiesAnnual(
            values.sqm || estimateSqmFromPrice(values.purchase_price),
            values.energy_class,
            values.rental_mode,
            values.occupancy_pct,
          ),
    );
  }, [sqm, energyClass, rentalMode, occupancyPct, utilitiesAuto, setValue, getValues, market]);

  useEffect(() => {
    const subscription = watch((values) => {
      onChange(values as SimpleScenario);
    });
    return () => subscription.unsubscribe();
  }, [watch, onChange]);

  return (
    <div className="card-glass overflow-hidden">
      <div className="border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <h2 className="font-semibold text-slate-100">Parametri</h2>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            Live
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">I grafici si aggiornano mentre modifichi i valori.</p>
      </div>

      <div className="space-y-6 p-5">
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-accent">
            <Home size={16} />
            Acquisto e mutuo
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Prezzo di acquisto (${currency})`}>
              <input
                type="number"
                step={5000}
                min={5000}
                className="input-field"
                {...register("purchase_price", {
                  valueAsNumber: true,
                  setValueAs: (v) => {
                    const n = typeof v === "string" ? Number(v) : v;
                    return Number.isFinite(n) && n > 0
                      ? n
                      : (market === "cz" ? 4_000_000 : ITALY_DEFAULTS.default_purchase_price);
                  },
                })}
              />
            </Field>
            {market === "it" ? (
            <Field label="Tipologia">
              <select className="select-field" {...register("property_type")}>
                <option value="investment">Investimento</option>
                <option value="prima_casa">Prima casa</option>
              </select>
            </Field>
            ) : (
              <>
                <Field label="Daň z nemovitosti (Kč/anno)" hint="Stima municipale semplificata">
                  <input type="number" step={500} className="input-field" {...register("property_tax_annual", { valueAsNumber: true })} />
                </Field>
                <Field label="Daň z příjmu (%)" hint="15% paušál — modello semplificato">
                  <input type="number" step={1} className="input-field" {...register("rental_income_tax_pct", { valueAsNumber: true })} />
                </Field>
              </>
            )}
            <Field label="Anticipo (%)" hint="Su prezzo + ristrutturazione + arredamento">
              <input type="number" step="1" className="input-field" {...register("down_payment_pct", { valueAsNumber: true })} />
            </Field>
            <Field label="Tasso mutuo TAN (%)">
              <input type="number" step="0.1" className="input-field" {...register("interest_rate_annual", { valueAsNumber: true })} />
            </Field>
            <Field label="Durata mutuo (anni)">
              <input type="number" className="input-field" {...register("loan_years", { valueAsNumber: true })} />
            </Field>
            <Field label={`Ristrutturazione (${currency})`}>
              <input
                type="number"
                min={0}
                step={500}
                className="input-field"
                {...register("renovation_cost", {
                  valueAsNumber: true,
                  setValueAs: (v) => {
                    const n = typeof v === "string" ? Number(v) : v;
                    return Number.isFinite(n) && n >= 0
                      ? n
                      : ITALY_DEFAULTS.default_renovation_cost;
                  },
                })}
              />
            </Field>
            <Field label={`Arredamento (${currency})`} hint={
              rentalMode === "short_term_airbnb"
                ? "Obbligatorio per affitto breve"
                : rentalMode === "medium_term_semester"
                  ? "Di solito arredato (studenti/lavoratori)"
                  : "Spesso a carico inquilino se non arredato"
            }>
              <input type="number" className="input-field" {...register("furnishing_cost", { valueAsNumber: true })} />
            </Field>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-accent">
            <Key size={16} />
            Affitto
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modalità">
              <select className="select-field" {...register("rental_mode")}>
                <option value="long_term">Lungo termine (4+4)</option>
                <option value="medium_term_semester">Medio termine / semestri</option>
                <option value="short_term_airbnb">Breve termine / Airbnb (≤30 gg)</option>
              </select>
            </Field>
            {rentalMode === "short_term_airbnb" ? (
              <Field label={`Tariffa notturna (${currency})`}>
                <input type="number" className="input-field" {...register("nightly_rate", { valueAsNumber: true })} />
              </Field>
            ) : (
              <>
                <Field label="Stanze">
                  <input
                    type="number"
                    min={1}
                    className="input-field"
                    {...register("rent_rooms", {
                      valueAsNumber: true,
                      setValueAs: (v) => {
                        const n = typeof v === "string" ? Number(v) : v;
                        return Number.isFinite(n) && n > 0
                          ? Math.round(n)
                          : ITALY_DEFAULTS.default_rent_rooms;
                      },
                    })}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <p className="label-field mb-2">Base affitto mensile</p>
                  <div className="mb-3 flex rounded-lg border border-surface-border overflow-hidden">
                    {(
                      [
                        { id: "per_room" as const, label: "Per stanza" },
                        { id: "whole" as const, label: "Tutto appartamento" },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setValue("rent_price_basis", id)}
                        className={cn(
                          "flex-1 px-3 py-2 text-sm transition-colors",
                          rentPriceBasis === id
                            ? "bg-accent/20 text-accent"
                            : "text-slate-400 hover:text-slate-200",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Field
                    label={
                      rentPriceBasis === "per_room"
                        ? `Affitto mensile per stanza (${currency})`
                        : `Affitto mensile tutto appartamento (${currency})`
                    }
                    hint={
                      rentPriceBasis === "per_room" && rentRooms > 0
                        ? `Totale stimato: ${fmtMoney(monthlyRent * rentRooms, market)}/mese (${rentRooms} stanze)`
                        : undefined
                    }
                  >
                    <input
                      type="number"
                      step={50}
                      min={0}
                      className="input-field"
                      {...register("monthly_rent", { valueAsNumber: true })}
                    />
                  </Field>
                </div>
              </>
            )}
            <Field
              label="Occupazione (%)"
              hint={getRentalModeRules(rentalMode).occupancy_note}
            >
              <input type="number" min="0" max="100" className="input-field" {...register("occupancy_pct", { valueAsNumber: true })} />
            </Field>
            <Field label={`Condominio (${currency}/mese)`}>
              <input type="number" className="input-field" {...register("condominio_monthly", { valueAsNumber: true })} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={`Bollette annue (${currency})`}
                hint={
                  rentalMode === "short_term_airbnb"
                    ? utilitiesAuto
                      ? `Auto: ~${fmtMoney(resolveUtilitiesAnnual(getValues(), market), market)}/anno`
                      : "Importo manuale"
                    : market === "cz"
                      ? "A carico nájemníka (0 Kč). Upravte pokud platíte část."
                      : "A carico inquilino (0 €). Modifica se paghi parte delle utenze."
                }
              >
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    className="input-field flex-1"
                    disabled={utilitiesAuto}
                    {...register("utilities_annual", { valueAsNumber: true })}
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-surface-border px-3 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      className="rounded border-surface-border"
                      {...register("utilities_auto")}
                    />
                    Auto
                  </label>
                </div>
              </Field>
            </div>
            {market === "it" && <RentalModeInfo mode={rentalMode} propertyType={propertyType} />}
            {market === "cz" && (
              <div className="sm:col-span-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-slate-400">
                Modello fiscale semplificato: 15% sul canone lordo, daň z nemovitosti annuale. Non è consulenza fiscale.
              </div>
            )}
          </div>
        </section>

        {market === "it" && (
        <p className="text-xs text-slate-500">
          Fonti:{" "}
          <a
            href="https://www.agenziaentrate.gov.it/portale/le-locazioni-brevi-e-la-cedolare-secca"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent/80 hover:underline"
          >
            Agenzia delle Entrate
          </a>
          . Stime IMU, TARI e notaio calcolate automaticamente per regime.
        </p>
        )}
      </div>
    </div>
  );
}
