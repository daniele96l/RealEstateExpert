import { verifyImmobiliareListingDates } from "../lib/server/verify-immobiliare-listing";

async function main() {
  const listingId = process.argv[2] ?? "94562640";
  const result = await verifyImmobiliareListingDates({ id: listingId });
  console.log(JSON.stringify(result, null, 2));
  if (result.blocked) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
