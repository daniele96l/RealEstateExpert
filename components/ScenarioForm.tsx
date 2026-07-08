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
import { MAINTENANCE_PCT_OPTIONS, monthlyMaintenanceCost } from "@/lib/maintenance-options";
import { useI18n } from "@/lib/i18n/context";
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
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function RentalModeInfo({ mode }: { mode: RentalMode }) {
  const { t } = useI18n();
  const rules = getRentalModeRules(mode);
  const modeKey = mode as "long_term" | "medium_term_semester" | "short_term_airbnb";
  return (
    <div className="sm:col-span-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
      <div className="mb-2 flex items-center gap-1.5 font-medium text-neutral-900">
        <Info size={14} />
        {t("scenario.regime")}: {t(`rentalModes.${modeKey}.label`)}
      </div>
      <ul className="space-y-1.5 leading-relaxed">
        <li>
          <span className="text-neutral-700">{t("scenario.flatTax")}:</span> {rules.cedolare_pct}% — {t(`rentalModes.${modeKey}.cedolareNote`)}
        </li>
        <li>
          <span className="text-neutral-700">{t("scenario.imu")}:</span> {t(`rentalModes.${modeKey}.imuNote`)}
        </li>
        <li>
          <span className="text-neutral-700">{t("scenario.typicalOccupancy")}:</span> {rules.occupancy_pct}% — {t(`rentalModes.${modeKey}.occupancyNote`)}
        </li>
        {mode === "medium_term_semester" ? (
          <li>{t(`rentalModes.${modeKey}.utilitiesNote`)}</li>
        ) : mode === "short_term_airbnb" ? (
          <>
            <li>
              <span className="text-neutral-700">{t("scenario.platform")}:</span>{" "}
              {t("scenario.platformFee", { pct: rules.platform_fee_pct * 100 })}
            </li>
            <li>{t(`rentalModes.${modeKey}.utilitiesNote`)}</li>
          </>
        ) : (
          <li>{t(`rentalModes.${modeKey}.utilitiesNote`)}</li>
        )}
      </ul>
    </div>
  );
}

export default function ScenarioForm({ market, onChange, prefill, syncScenario, syncToken }: Props) {
  const { t } = useI18n();
  const currency = market === "cz" ? "Kč" : "€";
  const { register, watch, reset, setValue, getValues } = useForm<SimpleScenario>({
    defaultValues: syncScenario ?? getDefaultSimpleScenario(market),
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
  const maintenancePct = watch("maintenance_pct");
  const propertyManagerFeePct = watch("property_manager_fee_pct");
  const propertyManagerActive =
    rentalMode !== "short_term_airbnb" && (propertyManagerFeePct ?? 0) > 0;
  const prevMode = useRef<RentalMode | null>(null);
  const prevPrice = useRef<number | null>(null);
  const prevPropertyType = useRef(propertyType);
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
    reset({ ...synced }, { keepDefaultValues: false });
    prevMode.current = synced.rental_mode;
    prevPrice.current = synced.purchase_price;
    prevPropertyType.current = synced.property_type;
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
    if (market !== "it") return;
    if (prevPropertyType.current === propertyType) return;
    prevPropertyType.current = propertyType;
    setValue("registration_tax_pct", null);
  }, [propertyType, setValue, market]);

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
    <div className="card overflow-hidden">
      <div className="border-b border-surface-border bg-neutral-50 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-neutral-900" />
            <h2 className="font-semibold text-neutral-900">{t("scenario.title")}</h2>
          </div>
          <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-900">
            {t("common.live")}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">{t("scenario.subtitle")}</p>
      </div>

      <div className="space-y-6 p-5">
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-900">
            <Home size={16} />
            {t("scenario.purchaseSection")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("scenario.purchasePrice", { currency })}>
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
            <Field
              label={t("scenario.propertyType")}
              hint={propertyType === "prima_casa" ? t("scenario.primaryHomeNote") : undefined}
            >
              <select className="select-field" {...register("property_type")}>
                <option value="investment">{t("scenario.investment")}</option>
                <option value="prima_casa">{t("scenario.primaryHome")}</option>
              </select>
            </Field>
            ) : (
              <>
                <Field label={t("scenario.propertyTaxCz")} hint={t("scenario.propertyTaxHint")}>
                  <input type="number" step={500} className="input-field" {...register("property_tax_annual", { valueAsNumber: true })} />
                </Field>
                <Field label={t("scenario.incomeTaxCz")} hint={t("scenario.incomeTaxHint")}>
                  <input type="number" step={1} className="input-field" {...register("rental_income_tax_pct", { valueAsNumber: true })} />
                </Field>
              </>
            )}
            <Field label={t("scenario.downPayment")} hint={t("scenario.downPaymentHint")}>
              <input
                type="number"
                step="5"
                min={0}
                max={100}
                className="input-field"
                {...register("down_payment_pct", {
                  valueAsNumber: true,
                  setValueAs: (v) => {
                    const n = typeof v === "string" ? Number(v) : v;
                    if (!Number.isFinite(n)) return 0;
                    return Math.min(100, Math.max(0, n));
                  },
                })}
              />
            </Field>
            <Field label={t("scenario.mortgageRate")}>
              <input type="number" step="0.1" className="input-field" {...register("interest_rate_annual", { valueAsNumber: true })} />
            </Field>
            <Field label={t("scenario.mortgageYears")}>
              <input type="number" className="input-field" {...register("loan_years", { valueAsNumber: true })} />
            </Field>
            <Field label={t("scenario.renovation", { currency })}>
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
            <Field label={t("scenario.furnishing", { currency })} hint={
              rentalMode === "short_term_airbnb"
                ? t("scenario.furnishingShort")
                : rentalMode === "medium_term_semester"
                  ? t("scenario.furnishingMedium")
                  : t("scenario.furnishingLong")
            }>
              <input type="number" className="input-field" {...register("furnishing_cost", { valueAsNumber: true })} />
            </Field>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-900">
            <Key size={16} />
            {t("scenario.rentSection")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("scenario.rentalMode")}>
              <select className="select-field" {...register("rental_mode")}>
                <option value="long_term">{t("scenario.longTerm")}</option>
                <option value="medium_term_semester">{t("scenario.mediumTerm")}</option>
                <option value="short_term_airbnb">{t("scenario.shortTerm")}</option>
              </select>
            </Field>
            {rentalMode === "short_term_airbnb" ? (
              <Field label={t("scenario.nightlyRate", { currency })}>
                <input type="number" className="input-field" {...register("nightly_rate", { valueAsNumber: true })} />
              </Field>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <p className="label-field mb-2">{t("scenario.rentBasis")}</p>
                  <div className="mb-3 flex rounded-lg border border-surface-border overflow-hidden">
                    {(
                      [
                        { id: "per_room" as const, label: t("scenario.perRoom") },
                        { id: "whole" as const, label: t("scenario.wholeFlat") },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setValue("rent_price_basis", id)}
                        className={cn(
                          "flex-1 px-3 py-2 text-sm transition-colors",
                          rentPriceBasis === id
                            ? "bg-neutral-100 text-neutral-900"
                            : "text-neutral-600 hover:text-neutral-800",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Field
                    label={
                      rentPriceBasis === "per_room"
                        ? t("scenario.monthlyRentPerRoom", { currency })
                        : t("scenario.monthlyRentWhole", { currency })
                    }
                    hint={
                      rentPriceBasis === "per_room" && rentRooms > 0
                        ? t("scenario.estimatedTotal", {
                            amount: fmtMoney(monthlyRent * rentRooms, market),
                            rooms: rentRooms,
                          })
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
              label={t("scenario.occupancy")}
              hint={t(`rentalModes.${rentalMode as "long_term" | "medium_term_semester" | "short_term_airbnb"}.occupancyNote`)}
            >
              <input type="number" min="0" max="100" className="input-field" {...register("occupancy_pct", { valueAsNumber: true })} />
            </Field>
            <Field label={t("scenario.condominio", { currency })}>
              <input type="number" className="input-field" {...register("condominio_monthly", { valueAsNumber: true })} />
            </Field>
            {rentalMode !== "short_term_airbnb" && (
              <Field
                label={t("scenario.propertyManagerFee")}
                hint={t("scenario.propertyManagerFeeHint")}
              >
                <input
                  type="number"
                  step="1"
                  min={0}
                  max={100}
                  className="input-field"
                  {...register("property_manager_fee_pct", {
                    valueAsNumber: true,
                    setValueAs: (v) => {
                      const n = typeof v === "string" ? Number(v) : v;
                      if (!Number.isFinite(n)) return 10;
                      return Math.min(100, Math.max(0, n));
                    },
                  })}
                />
              </Field>
            )}
            {!propertyManagerActive && (
            <Field
              label={t("scenario.maintenance")}
              hint={t("scenario.maintenanceHint", {
                monthly: fmtMoney(
                  monthlyMaintenanceCost(purchasePrice > 0 ? purchasePrice : 0, maintenancePct ?? 0),
                  market,
                ),
                annual: fmtMoney(
                  monthlyMaintenanceCost(purchasePrice > 0 ? purchasePrice : 0, maintenancePct ?? 0) * 12,
                  market,
                ),
              })}
            >
              <select className="select-field" {...register("maintenance_pct", { valueAsNumber: true })}>
                {MAINTENANCE_PCT_OPTIONS.map(({ id, pct }) => (
                  <option key={id} value={pct}>
                    {t(`scenario.maintenanceOptions.${id}`)}
                  </option>
                ))}
              </select>
            </Field>
            )}
            <div className="sm:col-span-2">
              <Field
                label={t("scenario.utilities", { currency })}
                hint={
                  rentalMode === "short_term_airbnb"
                    ? utilitiesAuto
                      ? t("scenario.utilitiesAutoShort", { amount: fmtMoney(resolveUtilitiesAnnual(getValues(), market), market) })
                      : t("scenario.utilitiesManual")
                    : market === "cz"
                      ? t("scenario.utilitiesTenantCz")
                      : t("scenario.utilitiesTenantIt")
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
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-surface-border px-3 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      className="rounded border-surface-border"
                      {...register("utilities_auto")}
                    />
                    {t("common.auto")}
                  </label>
                </div>
              </Field>
            </div>
            {market === "it" && <RentalModeInfo mode={rentalMode} />}
            {market === "cz" && (
              <div className="sm:col-span-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                {t("scenario.czTaxNote")}
              </div>
            )}
          </div>
        </section>

        {market === "it" && (
        <p className="text-xs text-neutral-500">
          {t("scenario.sourcesPrefix")}{" "}
          <a
            href="https://www.agenziaentrate.gov.it/portale/le-locazioni-brevi-e-la-cedolare-secca"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-900/80 hover:underline"
          >
            Agenzia delle Entrate
          </a>
          . {t("scenario.sourcesSuffix")}
        </p>
        )}
      </div>
    </div>
  );
}
