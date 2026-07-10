import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCasaSearchHtml } from "./casa-search";

const fixturePath = path.join(__dirname, "fixtures", "casa-reggio-search.html");
const html = readFileSync(fixturePath, "utf-8");
const listings = parseCasaSearchHtml(html);

assert.ok(listings.length >= 15, `expected at least 15 listings, got ${listings.length}`);

const first = listings[0]!;
assert.match(first.id, /^ca_\d+$/);
assert.ok(first.price > 0);
assert.ok(first.url.includes("casa.it/immobili/"));
assert.ok((first.sqm ?? 0) > 0);
assert.ok((first.rooms ?? 0) > 0);
assert.ok(first.lat !== 0 || first.lng !== 0);

console.log(`casa-search fixture tests passed (${listings.length} listings)`);
