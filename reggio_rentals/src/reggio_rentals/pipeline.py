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
from reggio_rentals.parser import ParseError, extract_next_data, parse_results
from reggio_rentals.storage import init_db, upsert_listings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunSummary:
    pages_requested: int
    pages_scraped: int
    listings_parsed: int
    rows_upserted: int
    db_path: Path


def _emit_progress(page: int, total: int, listings: int) -> None:
    payload = {"type": "progress", "page": page, "total": total, "listings": listings}
    print(json.dumps(payload), file=sys.stderr, flush=True)


def run(pages: int, db_path: Path) -> RunSummary:
    if pages < 1:
        raise ValueError("pages must be >= 1")

    scraped_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    conn = init_db(db_path)
    total_parsed = 0
    total_upserted = 0
    pages_scraped = 0

    try:
        with BrowserSession() as session:
            page = session.page
            if page is None:
                raise ScrapeError("Browser page was not initialized")

            for page_num in range(1, pages + 1):
                url = config.search_url(page_num)
                logger.info("Fetching page %s/%s: %s", page_num, pages, url)
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
