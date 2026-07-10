from __future__ import annotations

import json
from pathlib import Path

from reggio_rentals.parser import parse_results

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "next_data_page1.json"
SCRAPED_AT = "2026-07-08T12:00:00Z"


def load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_parse_results_row_count_and_multi_unit() -> None:
    listings = parse_results(load_fixture(), SCRAPED_AT)
    assert len(listings) == 3

    single = [row for row in listings if row.id == 97747342]
    multi = [row for row in listings if row.id == 88112233]

    assert len(single) == 1
    assert single[0].unit_index == 0
    assert single[0].surface_sqm == 30
    assert single[0].url == "https://www.immobiliare.it/annunci/97747342/"
    assert single[0].listing_published_at == "2025-04-22"
    assert single[0].listing_updated_at == "2025-08-05"

    assert len(multi) == 2
    assert [row.unit_index for row in multi] == [0, 1]
    assert multi[0].surface_sqm == 55
    assert multi[1].surface_sqm == 18
    assert multi[0].url == "https://www.immobiliare.it/annunci/88112233/"


def test_parse_surface_integer_and_missing() -> None:
    listings = parse_results(load_fixture(), SCRAPED_AT)
    assert all(row.url for row in listings)
    assert all(row.scraped_at == SCRAPED_AT for row in listings)

    data = load_fixture()
    results = data["props"]["pageProps"]["dehydratedState"]["queries"][0]["state"]["data"]["results"]
    results[0]["realEstate"]["properties"][0]["surface"] = None
    listings_missing = parse_results(data, SCRAPED_AT)
    assert listings_missing[0].surface_sqm is None
