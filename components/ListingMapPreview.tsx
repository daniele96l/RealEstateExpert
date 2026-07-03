import type { ListingProfitPreview } from "@/lib/listing-profit-preview";
import { profitGradientColor, type ProfitGradientRange } from "@/lib/profit-gradient";
import { listingConditionLabel } from "@/lib/property-condition";
import type { MapListing } from "@/lib/types";

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
  const accent = listing.operation === "sale" ? "#10b981" : "#3b82f6";
  const profitColor =
    profit && profitRange
      ? profitGradientColor(profit.monthlyNetProfit, profitRange)
      : profit && profit.monthlyNetProfit >= 0
        ? "#34d399"
        : "#f87171";

  return (
    <div
      style={{
        width: 220,
        overflow: "hidden",
        borderRadius: 10,
        background: "#0f172a",
        border: "1px solid rgba(148,163,184,0.25)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          style={{ display: "block", width: "100%", height: 96, objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            height: 72,
            background: `linear-gradient(135deg, ${accent}22, ${accent}08)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: accent,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {listing.operation === "sale" ? "Vendita" : "Affitto"}
        </div>
      )}
      <div style={{ padding: "10px 12px 12px" }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.35,
            color: "#f1f5f9",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {listing.title}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 700, color: accent }}>
          {formatPrice(listing.price, listing.operation)}
        </p>
        {meta && (
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8", lineHeight: 1.35 }}>{meta}</p>
        )}
        {statoLabel && (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 11,
              fontWeight: 600,
              color: needsRenovation ? "#fbbf24" : listing.needs_renovation === false ? "#34d399" : "#94a3b8",
            }}
          >
            Stato: {statoLabel}
            {needsRenovation ? " · Ristrutturazione consigliata" : ""}
          </p>
        )}
        {profit && listing.operation === "sale" && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px solid rgba(148,163,184,0.2)",
            }}
          >
            <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Stima investimento
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 700, color: profitColor }}>
              {formatProfitEuro(profit.monthlyNetProfit)}/mese
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.35 }}>
              Affitto stim. {formatPrice(profit.estimatedMonthlyRent, "rent")}
              {" · "}
              {profit.neighborCount} comparabili
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
