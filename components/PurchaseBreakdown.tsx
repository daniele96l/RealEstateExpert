"use client";

import { useEffect, useState } from "react";
import { applyPurchaseCostEdit, sanitizeSimple, type PurchaseCostField, type SimpleScenario } from "@/lib/defaults";
import { fmtEuro } from "@/lib/utils";
import type { PurchaseCostBreakdown } from "@/lib/types";

interface Props {
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

export default function PurchaseBreakdown({ costs, scenario, onScenarioChange }: Props) {
  const purchasePrice = scenario.purchase_price;
  const loanShare = Math.max(0, Math.min(1, 1 - scenario.down_payment_pct / 100));
  const loanOnPrice = purchasePrice * loanShare;
  const loanRenovation = costs.renovation * loanShare;
  const loanFurnishing = costs.furnishing * loanShare;
  const accessoryCosts = costs.registration_tax + costs.vat + costs.notary + costs.agency;

  const cashRows: { label: string; field?: PurchaseCostField; value: number }[] = [
    { label: "Imposta di registro", field: "registration_tax", value: costs.registration_tax },
    ...(costs.vat > 0 ? [{ label: "IVA", value: costs.vat }] : []),
    { label: "Notaio", field: "notary", value: costs.notary },
    { label: "Agenzia", field: "agency", value: costs.agency },
  ];

  const loanRows: { label: string; field?: PurchaseCostField; value: number }[] = [
    { label: "Quota prezzo immobile", value: loanOnPrice },
    { label: "Ristrutturazione", field: "renovation", value: loanRenovation },
    { label: "Arredamento", field: "furnishing", value: loanFurnishing },
  ];

  const handleEdit = (field: PurchaseCostField, valueEuro: number) => {
    const next = applyPurchaseCostEdit(scenario, field, valueEuro);
    onScenarioChange(sanitizeSimple(next));
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
        <span className="shrink-0 text-sm font-medium text-slate-200">{fmtEuro(value)}</span>
      )}
    </div>
  );

  return (
    <div className="card-glass p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-300">Costi iniziali</h2>
      <p className="mb-4 text-xs text-slate-500">
        L&apos;anticipo % si applica a prezzo + ristrutturazione + arredamento. Il mutuo copre il resto;
        tasse e notaio si pagano in contanti all&apos;acquisto.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-surface-border/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Equity iniziale</p>
          <p className="text-lg font-bold text-slate-100">{fmtEuro(costs.down_payment)}</p>
          <p className="text-[11px] text-slate-600">Quota casa di tua proprietà (prezzo + lavori)</p>
        </div>
        <div className="rounded-lg bg-surface-border/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Contanti subito</p>
          <p className="text-lg font-bold text-accent">{fmtEuro(costs.total_initial_cash)}</p>
          <p className="text-[11px] text-slate-600">Anticipo + tasse e notaio</p>
        </div>
        <div className="rounded-lg bg-surface-border/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Coperto da mutuo</p>
          <p className="text-lg font-bold text-slate-100">{fmtEuro(costs.loan_amount)}</p>
          <p className="text-[11px] text-slate-600">Prezzo + ristrutturazione + arredamento</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Prezzo immobile</p>
          {renderRow("Prezzo di acquisto", purchasePrice)}
        </div>

        <div className="space-y-2 border-t border-surface-border pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Finanziato con mutuo
          </p>
          {loanRows.map((r) =>
            renderRow(r.label, r.value, r.field, r.field ? "Incluso nel mutuo" : "Parte del prezzo finanziata"),
          )}
          {renderRow("Totale mutuo", costs.loan_amount, "loan_amount")}
          {renderRow(
            "Anticipo (equity)",
            costs.down_payment,
            "down_payment",
            "Tua quota su prezzo + ristrutturazione + arredamento",
          )}
        </div>

        <div className="space-y-2 border-t border-surface-border pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Pagamento immediato in contanti
          </p>
          {renderRow(
            "Anticipo casa",
            costs.down_payment,
            undefined,
            "Non coperto dal mutuo — modifica sopra",
          )}
          {cashRows.map((r) => renderRow(r.label, r.value, r.field, "Non coperto dal mutuo"))}
          <div className="flex justify-between border-t border-surface-border pt-2 text-sm font-semibold">
            <span className="text-slate-300">Totale contanti all&apos;acquisto</span>
            <span className="text-accent">{fmtEuro(costs.total_initial_cash)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500">
            <span>di cui tasse e accessori</span>
            <span>{fmtEuro(accessoryCosts)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
