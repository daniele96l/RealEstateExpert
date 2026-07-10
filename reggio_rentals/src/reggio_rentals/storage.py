"""SQLite persistence."""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from reggio_rentals.models import Listing

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER NOT NULL,
  unit_index INTEGER NOT NULL,
  scraped_at TEXT NOT NULL,
  title TEXT,
  url TEXT,
  price_eur_month INTEGER,
  price_formatted TEXT,
  typology TEXT,
  surface_sqm INTEGER,
  rooms INTEGER,
  bathrooms INTEGER,
  advertiser_label TEXT,
  advertiser_name TEXT,
  lat REAL,
  lng REAL,
  listing_published_at TEXT,
  listing_updated_at TEXT,
  PRIMARY KEY (id, unit_index)
);
CREATE INDEX IF NOT EXISTS idx_scraped_at ON listings(scraped_at);
"""

UPSERT_SQL = """
INSERT OR REPLACE INTO listings (
  id, unit_index, scraped_at, title, url, price_eur_month, price_formatted,
  typology, surface_sqm, rooms, bathrooms, advertiser_label, advertiser_name, lat, lng,
  listing_published_at, listing_updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def init_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA_SQL)
    for column, col_type in (
        ("lat", "REAL"),
        ("lng", "REAL"),
        ("listing_published_at", "TEXT"),
        ("listing_updated_at", "TEXT"),
    ):
        try:
            conn.execute(f"ALTER TABLE listings ADD COLUMN {column} {col_type}")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    return conn


def upsert_listings(conn: sqlite3.Connection, listings: list[Listing]) -> int:
    if not listings:
        return 0

    rows = [
        (
            listing.id,
            listing.unit_index,
            listing.scraped_at,
            listing.title,
            listing.url,
            listing.price_eur_month,
            listing.price_formatted,
            listing.typology,
            listing.surface_sqm,
            listing.rooms,
            listing.bathrooms,
            listing.advertiser_label,
            listing.advertiser_name,
            listing.lat,
            listing.lng,
            listing.listing_published_at,
            listing.listing_updated_at,
        )
        for listing in listings
    ]
    before = conn.total_changes
    conn.executemany(UPSERT_SQL, rows)
    conn.commit()
    affected = conn.total_changes - before
    logger.info("Upserted %s listing rows", affected)
    return affected
