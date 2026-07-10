from reggio_rentals.dates import extract_listing_dates


def test_extract_listing_dates_from_unix_and_label() -> None:
    published, updated = extract_listing_dates(
        {"creationDate": 1745310056, "lastModified": 1754402065},
        {"lastUpdate": "Annuncio aggiornato il 15/04/2026"},
    )
    assert published == "2025-04-22"
    assert updated == "2025-08-05"


def test_extract_listing_dates_from_label_only() -> None:
    published, updated = extract_listing_dates(
        {},
        {"lastUpdate": "Annuncio aggiornato il 15/04/2026"},
    )
    assert published is None
    assert updated == "2026-04-15"
