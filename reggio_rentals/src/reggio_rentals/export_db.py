"""Export SQLite listings as JSON for downstream consumers."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


def export_listings(db_path: Path) -> list[dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT id, unit_index, scraped_at, title, url, price_eur_month, price_formatted,
                   typology, surface_sqm, rooms, bathrooms, advertiser_label, advertiser_name,
                   lat, lng, listing_published_at, listing_updated_at
            FROM listings
            ORDER BY id, unit_index
            """
        ).fetchall()
    finally:
        conn.close()

    return [dict(row) for row in rows]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export reggio_rentals SQLite rows as JSON")
    parser.add_argument("--db", type=Path, required=True, help="SQLite database path")
    args = parser.parse_args(argv)

    if not args.db.exists():
        print(f"Database not found: {args.db}", file=sys.stderr)
        return 1

    listings = export_listings(args.db)
    payload = {
        "fetched_at": listings[-1]["scraped_at"] if listings else None,
        "listings": listings,
    }
    json.dump(payload, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
