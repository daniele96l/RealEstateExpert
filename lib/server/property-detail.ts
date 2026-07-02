import type { EnergyClass, ListingDetail, MapListing } from "@/lib/types";
import { propertyTypeLabel } from "@/lib/listing-types";
import { resolvePropertyCondition } from "@/lib/property-condition";

const IDEALISTA_BASE = "https://www.idealista.it";

export function normalizeEnergyClass(raw?: string | null): EnergyClass | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  const valid: EnergyClass[] = ["A4", "A3", "A2", "A1", "B", "C", "D", "E", "F", "G"];
  if (valid.includes(v as EnergyClass)) return v as EnergyClass;
  if (v.length === 1 && valid.includes(v as EnergyClass)) return v as EnergyClass;
  return null;
}

function needsRenovation(status?: string | null): boolean | null {
  return resolvePropertyCondition(status).needs_renovation;
}

function extractBuiltYear(text?: string | null): number | null {
  if (!text) return null;
  const m = text.match(/(?:costruito|costruzione|edificio|building)[\s\S]{0,40}?(\d{4})/i);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 1800 && y <= new Date().getFullYear()) return y;
  }
  return null;
}

function mergeListing(base: MapListing, detail: Partial<ListingDetail>): ListingDetail {
  return {
    ...base,
    bathrooms: detail.bathrooms ?? null,
    floor: detail.floor ?? null,
    energy_class: detail.energy_class ?? null,
    energy_kwh_sqm: detail.energy_kwh_sqm ?? null,
    condition: detail.condition ?? base.condition ?? null,
    condition_status: detail.condition_status ?? base.condition_status ?? null,
    needs_renovation: detail.needs_renovation ?? base.needs_renovation ?? null,
    property_type: detail.property_type ?? base.property_type ?? null,
    property_type_label: detail.property_type_label ?? base.property_type_label ?? null,
    zone: detail.zone ?? null,
    city_label: detail.city_label ?? null,
    price_per_sqm: detail.price_per_sqm ?? (base.sqm ? Math.round(base.price / base.sqm) : null),
    condominio_monthly: detail.condominio_monthly ?? null,
    lift: detail.lift ?? null,
    garden: detail.garden ?? null,
    terrace: detail.terrace ?? null,
    garage: detail.garage ?? null,
    furnished: detail.furnished ?? null,
    built_year: detail.built_year ?? null,
    description: detail.description ?? null,
    images: detail.images ?? [],
    fetched_at: detail.fetched_at ?? new Date().toISOString(),
    title: detail.title ?? base.title,
    sqm: detail.sqm ?? base.sqm,
    rooms: detail.rooms ?? base.rooms,
    address: detail.address ?? base.address,
    lat: detail.lat ?? base.lat,
    lng: detail.lng ?? base.lng,
    price: detail.price ?? base.price,
  };
}

export function listingToDetail(listing: MapListing): ListingDetail {
  return mergeListing(listing, {
    bathrooms: null,
    floor: null,
    energy_class: null,
    energy_kwh_sqm: null,
    condition: null,
    condition_status: null,
    needs_renovation: listing.needs_renovation,
    property_type: null,
    property_type_label: null,
    zone: null,
    city_label: null,
    price_per_sqm: listing.sqm ? Math.round(listing.price / listing.sqm) : null,
    condominio_monthly: null,
    lift: null,
    garden: null,
    terrace: null,
    garage: null,
    furnished: null,
    built_year: null,
    description: null,
    images: [],
    fetched_at: new Date().toISOString(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRapidPropertyPayload(raw: any, sourceUrl: string, base?: MapListing): ListingDetail {
  const property = raw?.property ?? raw;
  const id = String(property?.adid ?? raw?.adId ?? base?.id ?? "");
  const mc = property?.moreCharacteristics ?? {};
  const ub = property?.ubication ?? {};
  const energy = property?.energyCertification?.energyConsumption;
  const status = mc.status as string | undefined;
  const description =
    property?.comments?.[0]?.propertyComment ??
    property?.propertyComment ??
    null;
  const images: string[] = (property?.multimedia?.images ?? [])
    .map((img: { url?: string }) => img.url)
    .filter(Boolean)
    .slice(0, 8);
  const hasTerrace = (property?.multimedia?.images ?? []).some(
    (img: { tag?: string }) => img.tag === "terrace",
  );
  const sqm = mc.constructedArea ?? property?.size ?? base?.sqm ?? null;
  const price = property?.price ?? property?.priceInfo?.amount ?? base?.price ?? 0;
  const operation =
    base?.operation ??
    (String(property?.operation ?? "").includes("rent") ? "rent" : "sale");

  let url = property?.detailWebLink ?? base?.url ?? `${IDEALISTA_BASE}/immobile/${id}/`;
  if (url.startsWith("/")) url = `${IDEALISTA_BASE}${url}`;

  const conditionInfo = resolvePropertyCondition(status, description);

  const listing: MapListing = {
    id,
    title:
      ub.title ??
      ub.locationName ??
      base?.title ??
      property?.suggestedTexts?.title ??
      `Immobile ${id}`,
    price,
    operation,
    url,
    lat: ub.latitude ?? base?.lat ?? 0,
    lng: ub.longitude ?? base?.lng ?? 0,
    sqm,
    rooms: mc.roomNumber ?? property?.rooms ?? base?.rooms ?? null,
    address: ub.locationName ?? ub.title ?? base?.address ?? null,
    property_type: base?.property_type ?? null,
    property_type_label: base?.property_type_label ?? null,
    condition_status: conditionInfo.condition_status ?? base?.condition_status ?? null,
    condition: conditionInfo.condition ?? base?.condition ?? null,
    needs_renovation: conditionInfo.needs_renovation ?? base?.needs_renovation ?? null,
  };

  const typeKey = property?.detailedType?.typology ?? property?.homeType ?? property?.extendedPropertyType;
  if (typeKey) {
    listing.property_type = typeKey;
    listing.property_type_label = propertyTypeLabel(typeKey);
  }

  return mergeListing(listing, {
    bathrooms: mc.bathNumber ?? null,
    floor: mc.floor != null ? String(mc.floor) : null,
    energy_class: normalizeEnergyClass(mc.energyCertificationType ?? energy?.type),
    energy_kwh_sqm: mc.energyPerformance ?? energy?.value ?? null,
    condition: conditionInfo.condition,
    condition_status: conditionInfo.condition_status,
    needs_renovation: conditionInfo.needs_renovation,
    property_type: typeKey ?? null,
    property_type_label: typeKey ? propertyTypeLabel(typeKey) : null,
    zone: ub.administrativeAreaLevel4 ?? ub.locationName ?? null,
    city_label: ub.administrativeAreaLevel2 ?? ub.administrativeAreaLevel1 ?? null,
    price_per_sqm: sqm ? Math.round(price / sqm) : null,
    condominio_monthly: mc.communityCosts ?? null,
    lift: mc.lift ?? null,
    garden: mc.garden ?? null,
    terrace: hasTerrace ? true : null,
    garage: description?.toLowerCase().includes("garage") ? true : null,
    furnished: mc.housingFurnitures && mc.housingFurnitures !== "unknown" ? mc.housingFurnitures : null,
    built_year: extractBuiltYear(description),
    description,
    images,
    fetched_at: new Date().toISOString(),
  });
}
