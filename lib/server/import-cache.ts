import type { CityListingsCache, ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { normalizeCitySlug } from "./geocode";

export { extractIdealistaListingId, extractListingCacheId } from "@/lib/listing-url";

export function mapListingFromDetail(detail: ListingDetail): MapListing {
  return {
    id: detail.id,
    title: detail.title,
    price: detail.price,
    operation: detail.operation,
    url: detail.url,
    lat: detail.lat,
    lng: detail.lng,
    sqm: detail.sqm,
    rooms: detail.rooms,
    address: detail.address,
    property_type: detail.property_type,
    property_type_label: detail.property_type_label,
    condition_status: detail.condition_status,
    condition: detail.condition,
    needs_renovation: detail.needs_renovation,
  };
}

export function cityListingsCacheFromDetail(
  detail: ListingDetail,
  provider?: ListingsProvider,
): CityListingsCache {
  const cityLabel = detail.city_label ?? detail.zone ?? detail.address ?? "import";
  return {
    city: normalizeCitySlug(cityLabel),
    operation: detail.operation,
    fetched_at: detail.fetched_at,
    center: {
      lat: detail.lat,
      lng: detail.lng,
      display_name: detail.city_label ?? detail.address,
    },
    listings: [mapListingFromDetail(detail)],
    provider,
  };
}
