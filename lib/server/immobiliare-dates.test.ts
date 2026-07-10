import assert from "node:assert/strict";
import { extractImmobiliareListingDates } from "./immobiliare-dates";

const dates = extractImmobiliareListingDates({
  creationDate: 1745310056,
  lastModified: 1754402065,
});

assert.equal(dates.listing_published_at, "2025-04-22");
assert.equal(dates.listing_updated_at, "2025-08-05");

const fromLabel = extractImmobiliareListingDates(
  {},
  { lastUpdate: "Annuncio aggiornato il 15/04/2026" },
);
assert.equal(fromLabel.listing_published_at, null);
assert.equal(fromLabel.listing_updated_at, "2026-04-15");

const propertyWins = extractImmobiliareListingDates(
  { lastUpdate: "Annuncio aggiornato il 01/01/2025" },
  { lastModified: 1754402065 },
);
assert.equal(propertyWins.listing_updated_at, "2025-08-05");

console.log("immobiliare-dates tests passed");
