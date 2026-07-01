export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  flat: "Appartamento",
  chalet: "Villa/Casa",
  countryHouse: "Casa di campagna",
  studio: "Monolocale",
  duplex: "Duplex",
  penthouse: "Attico",
  homes: "Abitazione",
  room: "Stanza",
};

export function propertyTypeLabel(raw?: string | null): string | null {
  if (!raw) return null;
  return PROPERTY_TYPE_LABELS[raw] ?? raw;
}
