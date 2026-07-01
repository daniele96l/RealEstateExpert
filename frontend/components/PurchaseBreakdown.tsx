"use client";

import { fmtEuro } from "@/lib/utils";
import type { PurchaseCostBreakdown } from "@/lib/types";

interface Props {
  costs: PurchaseCostBreakdown;
}

export default function PurchaseBreakdown({ costs }: Props) {
  const rows = [
    { label: "Anticipo", value: costs.down_payment },
    { label: "Imposta di registro", value: costs.registration_tax },
    { label: "Notaio", value: costs.notary },
    { label: "Agenzia", value: costs.agency },
    { label: "Ristrutturazione", value: costs.renovation },
    { label: "Arredamento", value: costs.furnishing },
  ].filter((r) => r.value > 0);

  return (
    <div className="card-glass p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-300">Costi iniziali</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between text-sm">
            <span className="text-slate-500">{r.label}</span>
            <span className="font-medium text-slate-200">{fmtEuro(r.value)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-surface-border pt-2 text-sm font-semibold">
          <span className="text-slate-300">Totale capitale necessario</span>
          <span className="text-accent">{fmtEuro(costs.total_initial_cash)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Mutuo</span>
          <span className="text-slate-300">{fmtEuro(costs.loan_amount)}</span>
        </div>
      </div>
    </div>
  );
}
