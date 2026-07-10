import assert from "node:assert/strict";
import {
  extractSrealityListingDates,
  srealityEstateIdFromListingId,
} from "./sreality-dates";

const dates = extractSrealityListingDates({ since: "2026-04-29", edited: "2026-07-09" });
assert.equal(dates.listing_published_at, "2026-04-29");
assert.equal(dates.listing_updated_at, "2026-07-09");

const partial = extractSrealityListingDates({ since: "2026-04-29" });
assert.equal(partial.listing_published_at, "2026-04-29");
assert.equal(partial.listing_updated_at, null);

assert.equal(srealityEstateIdFromListingId("sr_694394956"), 694394956);
assert.equal(srealityEstateIdFromListingId("im_123"), null);

console.log("sreality-dates tests passed");
