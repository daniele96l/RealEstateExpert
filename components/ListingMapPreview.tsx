import type { MapListing } from "@/lib/types";

function formatPrice(price: number, operation: "sale" | "rent") {
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return operation === "rent" ? `${formatted}/mese` : formatted;
}

export function ListingMapPreview({
  listing,
  imageUrl,
}: {
  listing: MapListing;
  imageUrl?: string | null;
}) {
  const meta = [
    listing.sqm != null && `${listing.sqm} m²`,
    listing.rooms != null && `${listing.rooms} locali`,
    listing.property_type_label,
  ]
    .filter(Boolean)
    .join(" · ");

  const accent = listing.operation === "sale" ? "#10b981" : "#3b82f6";

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
      </div>
    </div>
  );
}
