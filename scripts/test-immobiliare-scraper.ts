import assert from "node:assert/strict";
import { mapRealEstateToDetail, parseImmobiliareHtml } from "../lib/server/immobiliare-scraper";

const numericId = "120760352";
const url = `https://www.immobiliare.it/annunci/${numericId}/`;

const fixtureRealEstate = {
  id: numericId,
  title: "Trilocale via Roma 1, Centro",
  contract: "Vendita",
  price: { value: 185000, formattedValue: "€ 185.000" },
  typology: { id: 1, name: "Appartamento" },
  properties: [
    {
      surface: "75 m²",
      rooms: 3,
      bathrooms: 1,
      floor: { value: "2" },
      description: "Luminoso trilocale in ottime condizioni.",
      elevator: true,
      energy: { certificate: "E" },
      location: {
        address: "Via Roma 1, Centro",
        latitude: 45.46,
        longitude: 9.19,
        city: "Milano",
        macrozone: "Centro",
      },
      multimedia: {
        photos: [
          {
            urls: {
              large: "https://pic.im-cdn.it/image/120760352/1.jpg",
            },
          },
        ],
      },
    },
  ],
};

const fixtureHtml = `<!DOCTYPE html><html><head></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { realEstate: fixtureRealEstate } },
})}</script>
</body></html>`;

const detailFromNode = mapRealEstateToDetail(fixtureRealEstate, url, numericId);
assert.equal(detailFromNode.price, 185000);
assert.equal(detailFromNode.sqm, 75);
assert.equal(detailFromNode.rooms, 3);
assert.equal(detailFromNode.bathrooms, 1);
assert.equal(detailFromNode.images.length, 1);
assert.equal(detailFromNode.energy_class, "E");

const detailFromHtml = parseImmobiliareHtml(fixtureHtml, url, numericId);
assert.equal(detailFromHtml.id, "im_120760352");
assert.equal(detailFromHtml.price, 185000);
assert.equal(detailFromHtml.images.length, 1);

console.log("immobiliare-scraper fixture tests passed");
