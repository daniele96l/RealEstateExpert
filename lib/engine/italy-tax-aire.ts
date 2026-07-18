/**
 * Fiscalità AIRE / incapiente — Reggio Calabria.
 *
 * Caso tipico: cittadino italiano iscritto AIRE, reddito IRPEF italiano
 * iniziale = 0. Il solo reddito rilevante è l'affitto dell'immobile.
 *
 * Bonus ristrutturazione (es. 36% in 10 rate annuali): è una detrazione IRPEF.
 * Con cedolare secca non c'è IRPEF → bonus perso.
 */

/** Scaglioni IRPEF (riforma 2024+): fino a 28k al 23%, poi 35%, poi 43%. */
export const IRPEF_BRACKETS: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 28_000, rate: 0.23 },
  { upTo: 50_000, rate: 0.35 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.43 },
];

/** Aliquota IMU ordinaria Reggio Calabria (seconda casa / investimento). */
export const REGGIO_IMU_ORDINARY_RATE = 0.0106;

/** Bonus ristrutturazione: 36% della spesa, in 10 quote annuali di pari importo. */
export const RENOVATION_BONUS_RATE = 0.36;
export const RENOVATION_BONUS_YEARS = 10;

/** Riduzione IMU per canone concordato (art. 1 c. 9 L. 208/2015): −25%. */
export const CONCORDATO_IMU_FACTOR = 0.75;

export interface IrpefOrdinaryResult {
  annualRent: number;
  taxableIncome: number;
  grossTax: number;
  annualBonusQuota: number;
  /** Quota bonus effettivamente usata (≤ imposta lorda). */
  bonusUsed: number;
  /** Quota bonus persa per incapienza (non recuperabile nell'anno). */
  bonusLost: number;
  /** Imposta netta ≥ 0 (mai negativa). */
  netTax: number;
  imu: number;
  totalAnnualTaxBurden: number;
}

export interface CedolareConcordatoResult {
  annualRent: number;
  cedolareTax: number;
  annualBonusQuota: number;
  /** Sempre 0: con sola cedolare e AIRE incapiente il bonus è perso. */
  bonusUsed: number;
  bonusLost: number;
  imuFull: number;
  imu: number;
  totalAnnualTaxBurden: number;
}

/** IRPEF progressiva sull'imponibile. */
export function computeIrpefProgressive(taxableIncome: number): number {
  const base = Math.max(0, taxableIncome);
  let tax = 0;
  let previous = 0;

  for (const bracket of IRPEF_BRACKETS) {
    if (base <= previous) break;
    const slice = Math.min(base, bracket.upTo) - previous;
    tax += slice * bracket.rate;
    previous = bracket.upTo;
  }

  return round2(tax);
}

/**
 * Quota annuale del bonus ristrutturazione.
 * Esempio: spesa 50_000 → 50_000 * 0.36 / 10 = 1_800 €/anno per 10 anni.
 */
export function annualRenovationBonusQuota(
  renovationSpend: number,
  bonusRate = RENOVATION_BONUS_RATE,
  years = RENOVATION_BONUS_YEARS,
): number {
  if (renovationSpend <= 0 || years <= 0) return 0;
  return round2((renovationSpend * bonusRate) / years);
}

/**
 * CASO 1 — Tassazione ordinaria IRPEF (canone libero).
 *
 * 1. Imponibile = canone_annuo * 0.95
 * 2. Imposta lorda = IRPEF progressiva
 * 3. Imposta netta = max(0, lorda − quota_bonus)  ← incapienza: il resto del bonus si perde
 * 4. IMU = valore_catastale * aliquota ordinaria (RC 1.06%)
 */
export function computeIrpefOrdinaryWithBonus(params: {
  annualRentFree: number;
  cadastralValue: number;
  renovationSpend: number;
  /** Altro reddito IRPEF Italia (AIRE tipicamente 0). */
  otherIrpefIncome?: number;
  imuRate?: number;
  bonusRate?: number;
  bonusYears?: number;
}): IrpefOrdinaryResult {
  const {
    annualRentFree,
    cadastralValue,
    renovationSpend,
    otherIrpefIncome = 0,
    imuRate = REGGIO_IMU_ORDINARY_RATE,
    bonusRate = RENOVATION_BONUS_RATE,
    bonusYears = RENOVATION_BONUS_YEARS,
  } = params;

  const rentalTaxable = Math.max(0, annualRentFree) * 0.95;
  const taxableIncome = rentalTaxable + Math.max(0, otherIrpefIncome);
  const grossTax = computeIrpefProgressive(taxableIncome);
  const annualBonusQuota = annualRenovationBonusQuota(renovationSpend, bonusRate, bonusYears);

  // Incapienza: l'imposta netta non può scendere sotto zero.
  // La parte di bonus eccedente l'imposta lorda è persa per quell'anno.
  const bonusUsed = Math.min(annualBonusQuota, grossTax);
  const bonusLost = round2(annualBonusQuota - bonusUsed);
  const netTax = round2(Math.max(0, grossTax - annualBonusQuota));

  const imu = round2(Math.max(0, cadastralValue) * imuRate);

  return {
    annualRent: round2(annualRentFree),
    taxableIncome: round2(taxableIncome),
    grossTax,
    annualBonusQuota,
    bonusUsed: round2(bonusUsed),
    bonusLost,
    netTax,
    imu,
    totalAnnualTaxBurden: round2(netTax + imu),
  };
}

/**
 * CASO 2 — Cedolare secca 10% (canone concordato).
 *
 * 1. Imposta = canone_annuo_concordato * 0.10 (sul 100% del canone)
 * 2. Bonus = 0 utilizzabile (cedolare → niente IRPEF → detrazione persa se AIRE incapiente)
 * 3. IMU = (catastale * aliquota) * 0.75
 */
export function computeCedolareConcordato10(params: {
  annualRentConcordato: number;
  cadastralValue: number;
  renovationSpend: number;
  imuRate?: number;
  cedolareRate?: number;
  bonusRate?: number;
  bonusYears?: number;
}): CedolareConcordatoResult {
  const {
    annualRentConcordato,
    cadastralValue,
    renovationSpend,
    imuRate = REGGIO_IMU_ORDINARY_RATE,
    cedolareRate = 0.1,
    bonusRate = RENOVATION_BONUS_RATE,
    bonusYears = RENOVATION_BONUS_YEARS,
  } = params;

  const cedolareTax = round2(Math.max(0, annualRentConcordato) * cedolareRate);
  const annualBonusQuota = annualRenovationBonusQuota(renovationSpend, bonusRate, bonusYears);
  const imuFull = round2(Math.max(0, cadastralValue) * imuRate);
  const imu = round2(imuFull * CONCORDATO_IMU_FACTOR);

  return {
    annualRent: round2(annualRentConcordato),
    cedolareTax,
    annualBonusQuota,
    bonusUsed: 0,
    bonusLost: annualBonusQuota,
    imuFull,
    imu,
    totalAnnualTaxBurden: round2(cedolareTax + imu),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
