"""Scrape orchestration."""

from __future__ import annotations

import json
import logging
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from reggio_rentals import config
from reggio_rentals.browser import BrowserSession, ScrapeError, retrying_goto
from reggio_rentals.models import Listing
from reggio_rentals.parser import (
    ParseError,
    enrich_listings_from_details,
    extract_next_data,
    parse_results,
)
from reggio_rentals.storage import init_db, upsert_listings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunSummary:
    pages_requested: int
    pages_scraped: int
    listings_parsed: int
    rows_upserted: int
    db_path: Path


def _emit_progress(
    page: int,
    total: int,
    listings: int,
    *,
    phase: str = "page",
    enrich_done: int = 0,
    enrich_total: int = 0,
) -> None:
    payload: dict[str, int | str] = {
        "type": "progress",
        "page": page,
        "total": total,
        "listings": listings,
        "phase": phase,
    }
    if phase == "enrich":
        payload["enrich_done"] = enrich_done
        payload["enrich_total"] = enrich_total
    print(json.dumps(payload), file=sys.stderr, flush=True)


def run(pages: int, db_path: Path) -> RunSummary:
    if pages < 1:
        raise ValueError("pages must be >= 1")

    scraped_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    conn = init_db(db_path)
    total_parsed = 0
    total_upserted = 0
    pages_scraped = 0
    all_listings: list[Listing] = []

    try:
        with BrowserSession() as session:
            page = session.page
            if page is None:
                raise ScrapeError("Browser page was not initialized")

            for page_num in range(1, pages + 1):
                url = config.search_url(page_num)
                logger.info("Fetching page %s/%s: %s", page_num, pages, url)
                _emit_progress(page_num, pages, total_parsed, phase="fetch")
                try:
                    retrying_goto(page, url)
                except ScrapeError as exc:
                    if pages_scraped > 0 and page_num > 1:
                        logger.info(
                            "Stopping pagination at page %s (%s listings so far): %s",
                            page_num,
                            total_parsed,
                            exc,
                        )
                        break
                    raise

                html = page.content()
                next_data = extract_next_data(html)
                listings = parse_results(next_data, scraped_at)
                if not listings:
                    logger.info("No listings on page %s — stopping pagination", page_num)
                    break

                all_listings.extend(listings)
                rows = upsert_listings(conn, listings)
                total_parsed += len(listings)
                total_upserted += rows
                pages_scraped += 1
                _emit_progress(page_num, pages, total_parsed)
                logger.info(
                    "Page %s parsed %s listings (%s rows upserted)",
                    page_num,
                    len(listings),
                    rows,
                )
                if page_num < pages:
                    time.sleep(config.PAGE_DELAY_SECONDS)

            if all_listings:
                enrich_stats: dict[str, int] = {}
                enriched = enrich_listings_from_details(
                    page,
                    all_listings,
                    on_progress=lambda done, total: _emit_progress(
                        pages,
                        pages,
                        total_parsed,
                        phase="enrich",
                        enrich_done=done,
                        enrich_total=total,
                    ),
                    stats=enrich_stats,
                )
                dates_changed = any(
                    enriched_row.listing_published_at != original.listing_published_at
                    or enriched_row.listing_updated_at != original.listing_updated_at
                    for enriched_row, original in zip(enriched, all_listings, strict=True)
                )
                if dates_changed:
                    detail_rows = upsert_listings(conn, enriched)
                    total_upserted += detail_rows
                    logger.info(
                        "Detail enrichment updated %s listing rows with portal dates",
                        detail_rows,
                    )
    except (ScrapeError, ParseError):
        if pages_scraped > 0:
            logger.warning("Scrape ended early after %s page(s)", pages_scraped)
        else:
            raise
    finally:
        conn.close()

    if pages_scraped == 0:
        raise ScrapeError("No listings scraped")

    return RunSummary(
        pages_requested=pages,
        pages_scraped=pages_scraped,
        listings_parsed=total_parsed,
        rows_upserted=total_upserted,
        db_path=db_path,
    )
