import type { MarketId } from "./markets";

export interface ListingsUiLabels {
  mapTitle: string;
  searchCity: string;
  sale: string;
  rent: string;
  both: string;
  perMonth: string;
  perYear: string;
  perSqm: string;
  perRoom: string;
  rooms: (count: number) => string;
  netProfit: string;
  estNetProfit: string;
  estRent: string;
  rentsInArea: (count: number) => string;
  condition: string;
  inView: (visible: number, total: number) => string;
  profitFilters: (filtered: number, total: number) => string;
  noListings: string;
  noListingsInArea: string;
  loadCityHint: string;
}

const IT: ListingsUiLabels = {
  mapTitle: "Mappa annunci Idealista",
  searchCity: "Cerca per città",
  sale: "Vendita",
  rent: "Affitto",
  both: "Entrambi",
  perMonth: "/mese",
  perYear: "/anno",
  perSqm: "/m²",
  perRoom: "/stanza",
  rooms: (n) => `${n} locali`,
  netProfit: "Utile netto",
  estNetProfit: "Utile netto stimato",
  estRent: "affitto stim.",
  rentsInArea: (n) => `${n} affitti in zona`,
  condition: "Stato",
  inView: (visible, total) => `${visible} in vista · ${total} totali`,
  profitFilters: (filtered, total) => `Filtri utile: ${filtered} di ${total} annunci`,
  noListings: "Nessun annuncio trovato",
  noListingsInArea: "Nessun annuncio in questa area — sposta o zooma la mappa",
  loadCityHint: "Inserisci una città — gli annunci in cache si caricano automaticamente",
};

const CZ: ListingsUiLabels = {
  mapTitle: "Mapa inzerátů Sreality",
  searchCity: "Hledat podle města",
  sale: "Prodej",
  rent: "Pronájem",
  both: "Obojí",
  perMonth: "/měs.",
  perYear: "/rok",
  perSqm: "/m²",
  perRoom: "/pokoj",
  rooms: (n) => `${n} pok.`,
  netProfit: "Čistý zisk",
  estNetProfit: "Odhad. čistý zisk",
  estRent: "odh. nájem",
  rentsInArea: (n) => `${n} pronájmů v okolí`,
  condition: "Stav",
  inView: (visible, total) => `${visible} v zobrazení · ${total} celkem`,
  profitFilters: (filtered, total) => `Filtry zisku: ${filtered} z ${total} inzerátů`,
  noListings: "Žádné inzeráty",
  noListingsInArea: "V této oblasti žádné inzeráty — posuňte nebo přibližte mapu",
  loadCityHint: "Zadejte město — inzeráty z cache se načtou automaticky",
};

export function listingsUiLabels(market: MarketId): ListingsUiLabels {
  return market === "cz" ? CZ : IT;
}

const CONDITION_CZ: Record<string, string> = {
  "Buono stato": "Dobrý stav",
  "Quasi nuovo": "Téměř nový",
  "Di recente costruzione": "Nedávno postavený",
  "Nuova costruzione": "Novostavba",
  "Da ristrutturare": "K rekonstrukci",
  "Da demolire/ricostruire": "K demolici/rekonstrukci",
  "Non specificato": "Neuvedeno",
};

export function conditionLabelForMarket(label: string | null, market: MarketId): string | null {
  if (!label || market !== "cz") return label;
  return CONDITION_CZ[label] ?? label;
}
