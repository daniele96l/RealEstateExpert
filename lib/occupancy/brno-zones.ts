import { OCCUPANCY_FALLBACK_ZONE } from "./constants";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function extractDistrict(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    const single = parts[0] ?? "";
    const hyphenated = single.match(/^brno[-–]\s*(.+)$/i);
    if (hyphenated?.[1]?.trim()) return hyphenated[1].trim();
    return null;
  }

  const last = parts[parts.length - 1]!;
  if (/brno/i.test(last) && parts.length >= 2) {
    const candidate = parts[parts.length - 2]!;
    const hyphenated = candidate.match(/^brno[-–]\s*(.+)$/i);
    return hyphenated?.[1]?.trim() || candidate;
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
  { zone: "Bosonohy", pattern: /bosonohy/i },
  { zone: "Žebětín", pattern: /žeb[eě]t[ií]n|zebetin/i },
  { zone: "Slatina", pattern: /slatina/i },
  { zone: "Trnitá", pattern: /trnit[aá]/i },
  { zone: "Černovice", pattern: /černovice|cernovice/i },
  { zone: "Horní Heršpice", pattern: /horn[ií]\s*her[sš]pice/i },
  { zone: "Dolní Heršpice", pattern: /doln[ií]\s*her[sš]pice/i },
  { zone: "Lesná", pattern: /lesn[aá]/i },
  { zone: "Řečkovice", pattern: /řečkovice|reckovice/i },
  { zone: "Vinohrady", pattern: /vinohrady/i },
  { zone: "Štýřice", pattern: /štýřice|styřice|styrice/i },
  { zone: "Pisárky", pattern: /pis[aá]rky/i },
  { zone: "Jundrov", pattern: /jundrov/i },
  { zone: "Obřany", pattern: /obřany|obrany/i },
  { zone: "Maloměřice", pattern: /malom[eě]řice|malomerice/i },
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
  description?: string | null,
): string {
  if (address?.trim()) {
    const district = extractDistrict(address);
    if (district && !/^brno$/i.test(district)) return district;

    const keyword = matchKeywordZone(address);
    if (keyword) return keyword;
  }

  if (description?.trim()) {
    const fromDescription = matchKeywordZone(description);
    if (fromDescription) return fromDescription;
  }

  return OCCUPANCY_FALLBACK_ZONE;
}
