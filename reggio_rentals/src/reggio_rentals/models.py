"""Domain models."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Listing:
    id: int
    unit_index: int
    title: str
    url: str
    price_eur_month: int | None
    price_formatted: str | None
    typology: str | None
    surface_sqm: int | None
    rooms: int | None
    bathrooms: int | None
    advertiser_label: str | None
    advertiser_name: str | None
    lat: float | None
    lng: float | None
    scraped_at: str
