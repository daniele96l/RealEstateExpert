"""Parse __NEXT_DATA__ JSON into Listing rows."""

from __future__ import annotations

import json
import re
from typing import Any

from reggio_rentals.models import Listing

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>',
    re.IGNORECASE,
)
_SURFACE_RE = re.compile(r"\d+")


class ParseError(Exception):
    """Raised when __NEXT_DATA__ cannot be parsed."""


def extract_next_data(html: str) -> dict[str, Any]:
    match = _NEXT_DATA_RE.search(html)
    if not match:
        raise ParseError("__NEXT_DATA__ script tag not found")
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ParseError(f"Invalid __NEXT_DATA__ JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ParseError("__NEXT_DATA__ root is not an object")
    return data


def _parse_surface(value: Any) -> int | None:
    if value is None:
        return None
    match = _SURFACE_RE.search(str(value))
    return int(match.group(0)) if match else None


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _find_results(next_data: dict[str, Any]) -> list[dict[str, Any]]:
    props = _as_dict(next_data.get("props"))
    page_props = _as_dict(props.get("pageProps"))
    dehydrated = _as_dict(page_props.get("dehydratedState"))
    queries = _as_list(dehydrated.get("queries"))

    if queries:
        first = _as_dict(queries[0])
        state = _as_dict(first.get("state"))
        data = _as_dict(state.get("data"))
        results = _as_list(data.get("results"))
        if results and isinstance(results[0], dict) and "realEstate" in results[0]:
            return [r for r in results if isinstance(r, dict)]

    for query in queries:
        state = _as_dict(_as_dict(query).get("state"))
        data = _as_dict(state.get("data"))
        results = _as_list(data.get("results"))
        if results and isinstance(results[0], dict) and "realEstate" in results[0]:
            return [r for r in results if isinstance(r, dict)]

    return []


def _parse_coords(property_row: dict[str, Any]) -> tuple[float | None, float | None]:
    location = _as_dict(property_row.get("location"))
    lat = location.get("latitude")
    lng = location.get("longitude")
    lat_val = float(lat) if isinstance(lat, (int, float)) else None
    lng_val = float(lng) if isinstance(lng, (int, float)) else None
    return lat_val, lng_val


def _advertiser_fields(real_estate: dict[str, Any]) -> tuple[str | None, str | None]:
    advertiser = _as_dict(real_estate.get("advertiser"))
    supervisor = _as_dict(advertiser.get("supervisor"))
    agency = _as_dict(advertiser.get("agency"))
    label = supervisor.get("label") or agency.get("label")
    name = agency.get("displayName")
    return (
        str(label) if label is not None else None,
        str(name) if name is not None else None,
    )


def _listing_from_unit(
    *,
    listing_id: int,
    unit_index: int,
    real_estate: dict[str, Any],
    seo: dict[str, Any],
    property_row: dict[str, Any],
    scraped_at: str,
) -> Listing:
    price_obj = _as_dict(real_estate.get("price"))
    typology = _as_dict(real_estate.get("typology"))
    advertiser_label, advertiser_name = _advertiser_fields(real_estate)
    lat, lng = _parse_coords(property_row)
    price_value = price_obj.get("value")
    price_eur_month = int(price_value) if isinstance(price_value, (int, float)) else None
    rooms = property_row.get("rooms")
    bathrooms = property_row.get("bathrooms")

    return Listing(
        id=listing_id,
        unit_index=unit_index,
        title=str(real_estate.get("title") or ""),
        url=str(seo.get("url") or ""),
        price_eur_month=price_eur_month,
        price_formatted=(
            str(price_obj.get("formattedValue"))
            if price_obj.get("formattedValue") is not None
            else None
        ),
        typology=str(typology.get("name")) if typology.get("name") is not None else None,
        surface_sqm=_parse_surface(property_row.get("surface")),
        rooms=int(rooms) if isinstance(rooms, (int, float)) else None,
        bathrooms=int(bathrooms) if isinstance(bathrooms, (int, float)) else None,
        advertiser_label=advertiser_label,
        advertiser_name=advertiser_name,
        lat=lat,
        lng=lng,
        scraped_at=scraped_at,
    )


def parse_results(next_data: dict[str, Any], scraped_at: str) -> list[Listing]:
    results = _find_results(next_data)
    listings: list[Listing] = []

    for item in results:
        real_estate = _as_dict(item.get("realEstate"))
        listing_id = real_estate.get("id")
        if not isinstance(listing_id, int):
            continue

        seo = _as_dict(item.get("seo"))
        properties = _as_list(real_estate.get("properties"))
        if not properties:
            properties = [{}]

        for unit_index, property_row in enumerate(properties):
            listings.append(
                _listing_from_unit(
                    listing_id=listing_id,
                    unit_index=unit_index,
                    real_estate=real_estate,
                    seo=seo,
                    property_row=_as_dict(property_row),
                    scraped_at=scraped_at,
                )
            )

    return listings
