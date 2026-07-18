import assert from "node:assert/strict";
import {
  annualRenovationBonusQuota,
  computeCedolareConcordato10,
  computeIrpefOrdinaryWithBonus,
  computeIrpefProgressive,
} from "./italy-tax-aire";

// IRPEF: 20_000 → tutto nel primo scaglione 23%
assert.equal(computeIrpefProgressive(20_000), 4600);

// Bonus annuale: 50k * 36% / 10 = 1800
assert.equal(annualRenovationBonusQuota(50_000), 1800);

// Caso 1: incapienza — bonus > imposta lorda → netTax = 0, bonus perso
{
  const r = computeIrpefOrdinaryWithBonus({
    annualRentFree: 6000, // imponibile 5700 → IRPEF 1311
    cadastralValue: 100_000,
    renovationSpend: 50_000, // quota 1800 > 1311
  });
  assert.equal(r.taxableIncome, 5700);
  assert.equal(r.grossTax, 1311);
  assert.equal(r.netTax, 0);
  assert.equal(r.bonusUsed, 1311);
  assert.equal(r.bonusLost, 489);
  assert.equal(r.imu, 1060); // 100k * 1.06%
}

// Caso 1: bonus pieno recuperabile
{
  const r = computeIrpefOrdinaryWithBonus({
    annualRentFree: 12_000, // imponibile 11400 → IRPEF 2622
    cadastralValue: 80_000,
    renovationSpend: 50_000, // quota 1800
  });
  assert.equal(r.netTax, 822); // 2622 - 1800
  assert.equal(r.bonusLost, 0);
  assert.equal(r.imu, 848);
}

// Caso 2: cedolare 10% + IMU −25%, bonus perso
{
  const r = computeCedolareConcordato10({
    annualRentConcordato: 7200,
    cadastralValue: 100_000,
    renovationSpend: 50_000,
  });
  assert.equal(r.cedolareTax, 720);
  assert.equal(r.bonusUsed, 0);
  assert.equal(r.bonusLost, 1800);
  assert.equal(r.imuFull, 1060);
  assert.equal(r.imu, 795); // 1060 * 0.75
}

console.log("italy-tax-aire tests ok");
