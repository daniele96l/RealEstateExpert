"""Extract Immobiliare listing publish/update dates from JSON payloads."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

ITALIAN_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _iso_date_from_parts(year: int, month: int, day: int) -> str | None:
    if year < 1970 or year > 2100 or month < 1 or month > 12 or day < 1 or day > 31:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def _normalize_unix_timestamp(value: Any) -> str | None:
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    seconds = value / 1000 if value > 1e12 else value
    return datetime.fromtimestamp(seconds, tz=UTC).date().isoformat()


def _parse_italian_date_string(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    match = ITALIAN_DATE_RE.search(value)
    if not match:
        return None
    day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    return _iso_date_from_parts(year, month, day)


def _read_updated_from_source(source: dict[str, Any]) -> str | None:
    label = _parse_italian_date_string(source.get("lastUpdate"))
    if label:
        return label
    for value in source.values():
        if isinstance(value, str) and "aggiornato" in value.lower():
            parsed = _parse_italian_date_string(value)
            if parsed:
                return parsed
    return None


def extract_listing_dates(
    real_estate: dict[str, Any],
    property_row: dict[str, Any] | None = None,
) -> tuple[str | None, str | None]:
    sources = [real_estate, _as_dict(property_row)]
    published: str | None = None
    updated: str | None = None

    for source in sources:
        if published is None:
            published = _normalize_unix_timestamp(source.get("creationDate"))

    for source in sources:
        modified = _normalize_unix_timestamp(source.get("lastModified"))
        if modified:
            updated = modified
            break

    if updated is None:
        for source in sources:
            label = _read_updated_from_source(source)
            if label:
                updated = label
                break

    return published, updated
