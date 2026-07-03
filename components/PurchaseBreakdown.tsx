"use client";

import { useEffect, useState } from "react";
import { applyPurchaseCostEdit, sanitizeSimple, type PurchaseCostField, type SimpleScenario } from "@/lib/defaults";
import { fmtMoney } from "@/lib/utils";
import type { MarketId } from "@/lib/markets";
import { useI18n } from "@/lib/i18n/context";
import type { PurchaseCostBreakdown } from "@/lib/types";

interface Props {
  market: MarketId;
  costs: PurchaseCostBreakdown;
  scenario: SimpleScenario;
  onScenarioChange: (next: SimpleScenario) => void;
}

function EditableEuro({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = () => {
    const n = Number(draft.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0) onCommit(n);
    else setDraft(String(Math.round(value)));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className="w-[5.5rem] rounded border border-surface-border bg-surface-raised/60 px-2 py-0.5 text-right text-sm font-medium text-slate-200 focus:border-accent focus:outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export default function PurchaseBreakdown({ market, costs, scenario, onScenarioChange }: Props) {
  const { t } = useI18n();
  const purchasePrice = scenario.purchase_price;
  const loanShare = Math.max(0, Math.min(1, 1 - scenario.down_payment_pct / 100));
  const loanOnPrice = purchasePrice * loanShare;
  const loanRenovation = costs.renovation * loanShare;
  const loanFurnishing = costs.furnishing * loanShare;
  const accessoryCosts = costs.registration_tax + costs.vat + costs.notary + costs.agency;

  const cashRows: { label: string; field?: PurchaseCostField; value: number }[] = [
    ...(market === "it"
      ? [{ label: t("purchase.registrationTax"), field: "registration_tax" as const, value: costs.registration_tax }]
      : []),
    ...(costs.vat > 0 ? [{ label: t("purchase.vat"), value: costs.vat }] : []),
    { label: t("purchase.notary"), field: "notary", value: costs.notary },
    { label: t("purchase.agency"), field: "agency", value: costs.agency },
  ];

  const loanRows: { label: string; field?: PurchaseCostField; value: number }[] = [
    { label: t("purchase.priceShare"), value: loanOnPrice },
    { label: t("purchase.renovation"), field: "renovation", value: loanRenovation },
    { label: t("purchase.furnishing"), field: "furnishing", value: loanFurnishing },
  ];

  const handleEdit = (field: PurchaseCostField, valueEuro: number) => {
    const next = applyPurchaseCostEdit(scenario, field, valueEuro);
    onScenarioChange(sanitizeSimple(next, market));
  };

  const renderRow = (
    label: string,
    value: number,
    field?: PurchaseCostField,
    hint?: string,
  ) => (
    <div key={label} className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <span className="text-slate-500">{label}</span>
        {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
      </div>
      {field ? (
        <EditableEuro value={value} onCommit={(n) => handleEdit(field, n)} />
      ) : (
        <span className="shrink-0 text-sm font-medium text-slate-200">{fmtMoney(value, market)}</span>
      )}
    </div>
  );

  return (
    <div className="card-glass p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-300">{t("purchase.title")}</h2>
      <p className="mb-4 text-xs text-slate-500">{t("purchase.subtitle")}</p>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-surface-border/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{t("purchase.initialEquity")}</p>
          <p className="text-lg font-bold text-slate-100">{fmtMoney(costs.down_payment, market)}</p>
          <p className="text-[11px] text-slate-600">{t("purchase.initialEquityHint")}</p>
        </div>
        <div className="rounded-lg bg-surface-border/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{t("purchase.cashUpfront")}</p>
          <p className="text-lg font-bold text-accent">{fmtMoney(costs.total_initial_cash, market)}</p>
          <p className="text-[11px] text-slate-600">{t("purchase.cashUpfrontHint")}</p>
        </div>
        <div className="rounded-lg bg-surface-border/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{t("purchase.coveredByMortgage")}</p>
          <p className="text-lg font-bold text-slate-100">{fmtMoney(costs.loan_amount, market)}</p>
          <p className="text-[11px] text-slate-600">{t("purchase.coveredByMortgageHint")}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("purchase.propertyPrice")}</p>
          {renderRow(t("purchase.purchasePrice"), purchasePrice)}
        </div>

        <div className="space-y-2 border-t border-surface-border pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {t("purchase.financedSection")}
          </p>
          {loanRows.map((r) =>
            renderRow(r.label, r.value, r.field, r.field ? t("purchase.includedInMortgage") : t("purchase.financedShare")),
          )}
          {renderRow(t("purchase.totalMortgage"), costs.loan_amount, "loan_amount")}
          {renderRow(
            t("purchase.downPaymentEquity"),
            costs.down_payment,
            "down_payment",
            t("purchase.downPaymentHint"),
          )}
        </div>

        <div className="space-y-2 border-t border-surface-border pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {t("purchase.immediateCash")}
          </p>
          {renderRow(
            t("purchase.downPaymentHouse"),
            costs.down_payment,
            undefined,
            t("purchase.editAbove"),
          )}
          {cashRows.map((r) => renderRow(r.label, r.value, r.field, t("purchase.notCoveredByMortgage")))}
          <div className="flex justify-between border-t border-surface-border pt-2 text-sm font-semibold">
            <span className="text-slate-300">{t("purchase.totalCashAtPurchase")}</span>
            <span className="text-accent">{fmtMoney(costs.total_initial_cash, market)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500">
            <span>{t("purchase.taxesAndAccessories")}</span>
            <span>{fmtMoney(accessoryCosts, market)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
