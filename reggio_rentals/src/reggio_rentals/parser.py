"""Parse __NEXT_DATA__ JSON into Listing rows."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from reggio_rentals import config
from reggio_rentals.dates import extract_listing_dates
from reggio_rentals.models import Listing

logger = logging.getLogger(__name__)

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
    listing_published_at, listing_updated_at = extract_listing_dates(real_estate, property_row)

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
        listing_published_at=listing_published_at,
        listing_updated_at=listing_updated_at,
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


def _find_real_estate_by_id(node: Any, listing_id: int) -> dict[str, Any] | None:
    if isinstance(node, dict):
        nested = _as_dict(node.get("realEstate"))
        if nested and nested.get("id") == listing_id:
            return nested
        if node.get("id") == listing_id and (
            node.get("price") is not None or node.get("properties") is not None
        ):
            return node
        for value in node.values():
            found = _find_real_estate_by_id(value, listing_id)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _find_real_estate_by_id(item, listing_id)
            if found:
                return found
    return None


def _detail_html_from_page(page, detail_url: str) -> str | None:
    try:
        in_page = page.evaluate(
            """async (targetUrl) => {
              try {
                const res = await fetch(targetUrl, { credentials: 'include' });
                const html = await res.text();
                return { status: res.status, html };
              } catch (error) {
                return { status: 0, html: '', error: String(error) };
              }
            }""",
            detail_url,
        )
        if (
            isinstance(in_page, dict)
            and in_page.get("status") == 200
            and isinstance(in_page.get("html"), str)
            and "__NEXT_DATA__" in in_page["html"]
        ):
            return in_page["html"]
    except Exception as exc:
        logger.debug("In-page detail fetch failed for %s: %s", detail_url, exc)

    from reggio_rentals.browser import retrying_goto

    try:
        retrying_goto(page, detail_url)
    except Exception as exc:
        logger.warning("Detail navigation failed for %s: %s", detail_url, exc)
        return None

    html = page.content()
    return html if "__NEXT_DATA__" in html else None


def enrich_listings_from_details(page, listings: list[Listing]) -> list[Listing]:
    from dataclasses import replace

    dates_by_id: dict[int, tuple[str | None, str | None]] = {}
    listing_ids = sorted({listing.id for listing in listings})

    for listing_id in listing_ids:
        rows = [listing for listing in listings if listing.id == listing_id]
        if all(row.listing_updated_at and row.listing_published_at for row in rows):
            continue

        detail_url = f"{config.BASE_URL}/annunci/{listing_id}/"
        html = _detail_html_from_page(page, detail_url)
        if not html:
            continue

        next_data = extract_next_data(html)
        if not next_data:
            continue

        real_estate = _find_real_estate_by_id(next_data, listing_id)
        if not real_estate:
            continue

        properties = _as_list(real_estate.get("properties"))
        property_row = _as_dict(properties[0]) if properties else {}
        dates_by_id[listing_id] = extract_listing_dates(real_estate, property_row)
        time.sleep(config.PAGE_DELAY_SECONDS)

    if not dates_by_id:
        return listings

    enriched: list[Listing] = []
    for listing in listings:
        published, updated = dates_by_id.get(listing.id, (listing.listing_published_at, listing.listing_updated_at))
        enriched.append(
            replace(
                listing,
                listing_published_at=listing.listing_published_at or published,
                listing_updated_at=listing.listing_updated_at or updated,
            )
        )
    return enriched
