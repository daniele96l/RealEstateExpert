const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Known Sreality slugs that differ from our normalized city input. */
export const CITY_SEO_ALIASES: Record<string, string> = {
  "brno-mesto": "brno",
  prague: "praha",
};

export function citySeoName(city: string): string {
  return (
    city
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brno"
  );
}

/** Sreality municipality IDs for price map (`locality=municipality,{id}`). */
const MUNICIPALITY_IDS: Record<string, number> = {
  brno: 5740,
  praha: 3468,
  prague: 3468,
  tabor: 1031,
  rosice: 6240,
  ostrava: 4730,
};

interface SuggestUserData {
  municipality_id?: number;
  municipality?: string;
  municipality_seo_name?: string;
}

interface SuggestResult {
  category?: string;
  userData?: SuggestUserData;
}

export class SrealityLocalityError extends Error {}

function resolveKnownMunicipalityId(city: string): number | null {
  const seo = citySeoName(city);
  const canonical = CITY_SEO_ALIASES[seo] ?? seo;
  return MUNICIPALITY_IDS[canonical] ?? MUNICIPALITY_IDS[seo] ?? null;
}

async function suggestMunicipality(city: string): Promise<{ id: number; label: string } | null> {
  const phrase = city.trim();
  if (!phrase) return null;

  const params = new URLSearchParams({ phrase, limit: "8" });
  const res = await fetch(`https://www.sreality.cz/api/v1/localities/suggest?${params}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { results?: SuggestResult[] };
  const targetSeo = citySeoName(city);
  const canonicalSeo = CITY_SEO_ALIASES[targetSeo] ?? targetSeo;

  const municipalities =
    data.results?.filter((entry) => entry.category === "municipality_cz" && entry.userData?.municipality_id) ??
    [];

  const exact =
    municipalities.find(
      (entry) => entry.userData?.municipality_seo_name === canonicalSeo,
    ) ?? municipalities[0];

  if (!exact?.userData?.municipality_id) return null;

  return {
    id: exact.userData.municipality_id,
    label: exact.userData.municipality ?? phrase,
  };
}

export async function resolveSrealityMunicipality(
  city: string,
): Promise<{ id: number; label: string; locality: string }> {
  const knownId = resolveKnownMunicipalityId(city);
  if (knownId != null) {
    return {
      id: knownId,
      label: city.trim(),
      locality: `municipality,${knownId}`,
    };
  }

  const suggested = await suggestMunicipality(city);
  if (!suggested) {
    throw new SrealityLocalityError(`No Sreality municipality found for ${city}`);
  }

  return {
    id: suggested.id,
    label: suggested.label,
    locality: `municipality,${suggested.id}`,
  };
}
