import { OCCUPANCY_FALLBACK_ZONE } from "./constants";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function extractDistrict(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1]!;
  if (/brno/i.test(last) && parts.length >= 2) {
    return parts[parts.length - 2]!;
  }

  return null;
}

const KEYWORD_RULES: Array<{ zone: string; pattern: RegExp }> = [
  { zone: "Královo Pole", pattern: /kr[aá]lovo\s*pole/i },
  { zone: "Žabovřesky", pattern: /žabovřesky|zabovresky/i },
  { zone: "Ponava", pattern: /ponava/i },
  { zone: "Veveří", pattern: /veveř[ií]|veveri/i },
  { zone: "Zábrdovice", pattern: /zábrdovice|zabrdovice/i },
  { zone: "Líšeň", pattern: /l[ií]šeň|lisen/i },
  { zone: "Bystrc", pattern: /bystrc/i },
  { zone: "Komín", pattern: /kom[ií]n|komin/i },
  { zone: "Bohunice", pattern: /bohunice/i },
  { zone: "Kohoutovice", pattern: /kohoutovice/i },
  { zone: "Staré Brno", pattern: /star[eé]\s*brno/i },
  { zone: "Černá Pole", pattern: /čern[aá]\s*pole|cerna\s*pole/i },
  { zone: "Židenice", pattern: /židenice|zidenice/i },
  { zone: "Husovice", pattern: /husovice/i },
  { zone: "Medlánky", pattern: /medl[aá]nky|medlanky/i },
  { zone: "Nový Lískovec", pattern: /nov[yý]\s*l[ií]skovec/i },
  { zone: "Starý Lískovec", pattern: /star[yý]\s*l[ií]skovec/i },
  { zone: "Brno-střed", pattern: /brno-střed|brno-stred/i },
  { zone: "Brno-sever", pattern: /brno-sever/i },
  { zone: "Brno-Židenice", pattern: /brno-židenice|brno-zidenice/i },
];

function matchKeywordZone(text: string): string | null {
  const normalized = normalizeText(text);
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(normalized)) return rule.zone;
  }
  return null;
}

export function resolveBrnoZone(
  address: string | null,
  _lat?: number | null,
  _lng?: number | null,
): string {
  if (!address?.trim()) return OCCUPANCY_FALLBACK_ZONE;

  const district = extractDistrict(address);
  if (district) return district;

  const keyword = matchKeywordZone(address);
  if (keyword) return keyword;

  return OCCUPANCY_FALLBACK_ZONE;
}
