from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from reggio_rentals.models import Listing
from reggio_rentals.parser import enrich_listings_from_details

DETAIL_FIXTURE = Path(__file__).parent / "fixtures" / "next_data_detail.json"


def _listing() -> Listing:
    return Listing(
        id=97747342,
        unit_index=0,
        title="Monolocale via Cardinale Tripepi",
        url="https://www.immobiliare.it/annunci/97747342/",
        price_eur_month=400,
        price_formatted="€ 400/mese",
        typology="Appartamento",
        surface_sqm=30,
        rooms=1,
        bathrooms=1,
        advertiser_label="privato",
        advertiser_name=None,
        lat=38.1,
        lng=15.6,
        scraped_at="2026-07-10T12:00:00Z",
        listing_published_at=None,
        listing_updated_at=None,
    )


def test_enrich_listings_from_details_uses_context_request() -> None:
    detail_json = DETAIL_FIXTURE.read_text(encoding="utf-8")
    detail_html = f'<html><script id="__NEXT_DATA__" type="application/json">{detail_json}</script></html>'

    response = MagicMock()
    response.status = 200
    response.text.return_value = detail_html

    page = MagicMock()
    page.context.request.get.return_value = response

    enriched = enrich_listings_from_details(page, [_listing()])
    assert enriched[0].listing_published_at == "2025-04-22"
    assert enriched[0].listing_updated_at == "2025-08-05"
    page.context.request.get.assert_called_once()
