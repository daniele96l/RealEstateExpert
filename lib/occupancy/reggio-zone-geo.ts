/** Immobiliare.it macro-areas for Reggio Calabria. */
export const REGGIO_MACRO_ZONES = {
  CENTRO: "Centro Storico, Pineta Zerbi",
  RAVAGNESE: "Ravagnese, Gallina, Armo",
  ARCHI: "Archi, Gallico, Catona",
  PELLARO: "San Gregorio, Pellaro",
  TERRETI: "Terreti, Ortì",
  TRABOCHETTO: "Trabocchetto, Spirito Santo, Tremulini, Eremo",
  SANTA_CATERINA: "Santa Caterina, San Brunello, Vito",
  FERROVIERI: "Ferrovieri, Stadio, Sbarre",
  MODENA: "Modena, San Giorgio Extra, San Sperato",
} as const;

export type ReggioMacroZone = (typeof REGGIO_MACRO_ZONES)[keyof typeof REGGIO_MACRO_ZONES];

export const GEO_ZONES: Array<{ zone: ReggioMacroZone; lat: number; lng: number; maxM: number }> = [
  { zone: REGGIO_MACRO_ZONES.PELLARO, lat: 38.005, lng: 15.655, maxM: 4_500 },
  { zone: REGGIO_MACRO_ZONES.ARCHI, lat: 38.075, lng: 15.638, maxM: 3_500 },
  { zone: REGGIO_MACRO_ZONES.CENTRO, lat: 38.111, lng: 15.648, maxM: 2_200 },
  { zone: REGGIO_MACRO_ZONES.TRABOCHETTO, lat: 38.108, lng: 15.662, maxM: 2_800 },
  { zone: REGGIO_MACRO_ZONES.FERROVIERI, lat: 38.096, lng: 15.642, maxM: 2_500 },
  { zone: REGGIO_MACRO_ZONES.SANTA_CATERINA, lat: 38.132, lng: 15.652, maxM: 3_500 },
  { zone: REGGIO_MACRO_ZONES.RAVAGNESE, lat: 38.155, lng: 15.645, maxM: 4_000 },
  { zone: REGGIO_MACRO_ZONES.MODENA, lat: 38.118, lng: 15.675, maxM: 3_500 },
  { zone: REGGIO_MACRO_ZONES.TERRETI, lat: 38.105, lng: 15.635, maxM: 2_500 },
];
