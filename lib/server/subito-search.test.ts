import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSubitoSearchHtml } from "./subito-search";

const fixturePath = path.join(__dirname, "fixtures", "subito-reggio-search.html");
const html = readFileSync(fixturePath, "utf-8");
const { listings, totalPages } = parseSubitoSearchHtml(html);

assert.ok(listings.length >= 10, `expected at least 10 listings, got ${listings.length}`);
assert.ok(totalPages >= 2, `expected pagination, got totalPages=${totalPages}`);

const priced = listings.filter((listing) => listing.price > 0);
assert.ok(priced.length >= 5, `expected priced listings, got ${priced.length}`);

const first = priced[0]!;
assert.match(first.id, /^sb_\d+$/);
assert.ok(first.url.includes("subito.it"));
assert.ok(first.title.length > 0);

console.log(`subito-search fixture tests passed (${listings.length} listings)`);
