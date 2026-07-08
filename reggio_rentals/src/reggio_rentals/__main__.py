"""CLI entry point."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from reggio_rentals.browser import ScrapeError
from reggio_rentals.parser import ParseError
from reggio_rentals.pipeline import run

DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "rentals.sqlite"


def _configure_logging(verbose: bool) -> None:
    quiet = os.environ.get("REGGIO_RENTALS_QUIET") == "1"
    if quiet and not verbose:
        level = logging.WARNING
    else:
        level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scrape Immobiliare.it rentals in Reggio Calabria",
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=5,
        help="Number of result pages to scrape (default: 5)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help=f"SQLite database path (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _configure_logging(args.verbose)

    try:
        summary = run(pages=args.pages, db_path=args.db)
    except (ScrapeError, ParseError, ValueError) as exc:
        logging.getLogger(__name__).error("%s", exc)
        return 1

    logging.getLogger(__name__).info(
        "Done: %s pages, %s listings parsed, %s rows upserted -> %s",
        summary.pages_scraped,
        summary.listings_parsed,
        summary.rows_upserted,
        summary.db_path,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
