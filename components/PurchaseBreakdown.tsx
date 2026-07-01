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
  const rows: { label: string; field: PurchaseCostField; value: number }[] = [
    { label: "Anticipo", field: "down_payment", value: costs.down_payment },
    { label: "Imposta di registro", field: "registration_tax", value: costs.registration_tax },
    { label: "Notaio", field: "notary", value: costs.notary },
    { label: "Agenzia", field: "agency", value: costs.agency },
    { label: "Ristrutturazione", field: "renovation", value: costs.renovation },
    { label: "Arredamento", field: "furnishing", value: costs.furnishing },
  ];

  const handleEdit = (field: PurchaseCostField, valueEuro: number) => {
    const next = applyPurchaseCostEdit(scenario, field, valueEuro);
    onScenarioChange(sanitizeSimple(next));
  };

  return (
    <div className="card-glass p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-300">Costi iniziali</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.field} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{r.label}</span>
            <EditableEuro value={r.value} onCommit={(n) => handleEdit(r.field, n)} />
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-surface-border pt-2 text-sm font-semibold">
          <span className="text-slate-300">Totale capitale necessario</span>
          <span className="text-accent">{fmtEuro(costs.total_initial_cash)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">Mutuo</span>
          <EditableEuro value={costs.loan_amount} onCommit={(n) => handleEdit("loan_amount", n)} />
        </div>
      </div>
    </div>
  );
}
