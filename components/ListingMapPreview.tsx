import type { ListingProfitPreview } from "@/lib/listing-profit-preview";
import { profitGradientColor, type ProfitGradientRange } from "@/lib/profit-gradient";
import { listingConditionLabel } from "@/lib/property-condition";
import type { MapListing } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatPrice(price: number, operation: "sale" | "rent") {
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return operation === "rent" ? `${formatted}/mese` : formatted;
}

function formatProfitEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(value);
}

export function ListingMapPreview({
  listing,
  imageUrl,
  profit,
  profitRange,
}: {
  listing: MapListing;
  imageUrl?: string | null;
  profit?: ListingProfitPreview | null;
  profitRange?: ProfitGradientRange;
}) {
  const meta = [
    listing.sqm != null && `${listing.sqm} m²`,
    listing.rooms != null && `${listing.rooms} locali`,
    listing.property_type_label,
  ]
    .filter(Boolean)
    .join(" · ");

  const statoLabel = listingConditionLabel(listing);
  const needsRenovation = listing.needs_renovation === true;
  const profitColor =
    profit && profitRange
      ? profitGradientColor(profit.monthlyNetProfit, profitRange)
      : profit && profit.monthlyNetProfit >= 0
        ? "#16a34a"
        : "#dc2626";

  return (
    <div className="w-[220px] overflow-hidden rounded-lg border border-neutral-200 bg-white font-sans shadow-card">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="block h-24 w-full object-cover" />
      ) : (
        <div
          className={cn(
            "flex h-[72px] items-center justify-center text-[11px] font-semibold uppercase tracking-wide",
            listing.operation === "sale" ? "bg-neutral-100 text-neutral-800" : "bg-neutral-50 text-neutral-700",
          )}
        >
          {listing.operation === "sale" ? "Vendita" : "Affitto"}
        </div>
      )}
      <div className="p-3">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900">{listing.title}</p>
        <p className="mt-1.5 text-[15px] font-bold text-neutral-900">{formatPrice(listing.price, listing.operation)}</p>
        {meta ? <p className="mt-1 text-[11px] leading-snug text-neutral-500">{meta}</p> : null}
        {statoLabel ? (
          <p
            className={cn(
              "mt-1.5 text-[11px] font-semibold",
              needsRenovation
                ? "text-amber-700"
                : listing.needs_renovation === false
                  ? "text-green-600"
                  : "text-neutral-500",
            )}
          >
            Stato: {statoLabel}
            {needsRenovation ? " · Ristrutturazione consigliata" : ""}
          </p>
        ) : null}
        {profit && listing.operation === "sale" ? (
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">Stima investimento</p>
            <p className="mt-1 text-[13px] font-bold" style={{ color: profitColor }}>
              {formatProfitEuro(profit.monthlyNetProfit)}/mese
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-neutral-500">
              Affitto stim. {formatPrice(profit.estimatedMonthlyRent, "rent")}
              {" · "}
              {profit.neighborCount} comparabili
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
