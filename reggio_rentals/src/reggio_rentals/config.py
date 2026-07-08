"""Scraper configuration constants."""

from __future__ import annotations

BASE_URL = "https://www.immobiliare.it"
SEARCH_PATH = "/affitto-case/reggio-calabria/"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36 "
    "reggio-rentals/0.1 (+contact)"
)

EXTRA_HEADERS: dict[str, str] = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.7",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
}

VIEWPORT = {"width": 1366, "height": 900}
LOCALE = "it-IT"
TIMEZONE_ID = "Europe/Rome"

PAGE_DELAY_SECONDS = 1.5
WARMUP_NETWORKIDLE_TIMEOUT_MS = 6_000
GOTO_NETWORKIDLE_TIMEOUT_MS = 8_000
MAX_RETRIES = 3

# Future hook for residential proxies (not implemented in v0.1).
PROXY_SERVER: str | None = None


def search_url(page: int) -> str:
    """Build paginated search URL (1-indexed)."""
    if page <= 1:
        return f"{BASE_URL}{SEARCH_PATH}"
    return f"{BASE_URL}{SEARCH_PATH}?pag={page}"
