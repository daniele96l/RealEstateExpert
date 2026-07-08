"""Playwright browser helpers with anti-bot hardening."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from playwright.sync_api import BrowserContext, Page, Playwright, sync_playwright

from reggio_rentals import config

if TYPE_CHECKING:
    from collections.abc import Iterator

logger = logging.getLogger(__name__)

STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || {};
window.chrome.runtime = window.chrome.runtime || {};
"""


class ScrapeError(Exception):
    """Fatal browser/navigation failure after retries."""


def is_blocked_page(html: str) -> bool:
    lowered = html.lower()
    if "__next_data__" not in lowered:
        return True
    markers = ("captcha-delivery", "datadome", "geo.captcha-delivery.com")
    return any(marker in lowered for marker in markers)


def build_context(playwright: Playwright) -> BrowserContext:
    launch_kwargs: dict = {"headless": True}
    if config.PROXY_SERVER:
        launch_kwargs["proxy"] = {"server": config.PROXY_SERVER}

    browser = playwright.chromium.launch(**launch_kwargs)
    context = browser.new_context(
        user_agent=config.USER_AGENT,
        viewport=config.VIEWPORT,
        locale=config.LOCALE,
        timezone_id=config.TIMEZONE_ID,
        extra_http_headers=config.EXTRA_HEADERS,
    )
    context.add_init_script(STEALTH_INIT_SCRIPT)
    return context


def warm_up(page: Page) -> None:
    logger.info("Warming up browser session at %s", config.BASE_URL)
    page.goto(config.BASE_URL, wait_until="domcontentloaded", timeout=30_000)
    try:
        page.wait_for_load_state("networkidle", timeout=config.WARMUP_NETWORKIDLE_TIMEOUT_MS)
    except Exception:
        logger.debug("Warm-up networkidle timed out; continuing")


def _soft_networkidle(page: Page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=config.GOTO_NETWORKIDLE_TIMEOUT_MS)
    except Exception:
        logger.debug("networkidle timeout on %s; continuing", page.url)


def retrying_goto(page: Page, url: str, max_retries: int = config.MAX_RETRIES) -> Page:
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            status = response.status if response is not None else 0

            if status == 200:
                _soft_networkidle(page)
                html = page.content()
                if is_blocked_page(html):
                    raise ScrapeError("Blocked page detected (missing __NEXT_DATA__ or captcha)")
                return page

            if status in (403, 429):
                raise ScrapeError(f"HTTP {status}")

            raise ScrapeError(f"Unexpected HTTP status {status}")

        except Exception as exc:
            last_error = exc
            if attempt >= max_retries:
                break
            backoff = attempt * 2
            logger.warning(
                "Navigation failed for %s (attempt %s/%s): %s — retrying in %ss",
                url,
                attempt,
                max_retries,
                exc,
                backoff,
            )
            time.sleep(backoff)
            warm_up(page)

    raise ScrapeError(f"Failed to load {url} after {max_retries} attempts") from last_error


class BrowserSession:
    """Owns Playwright lifecycle for a single scrape run."""

    def __init__(self) -> None:
        self._playwright_cm: Iterator[Playwright] | None = None
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None

    def __enter__(self) -> BrowserSession:
        self._playwright_cm = sync_playwright()
        self.playwright = self._playwright_cm.__enter__()
        self.context = build_context(self.playwright)
        self.page = self.context.new_page()
        warm_up(self.page)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self.context is not None:
            browser = self.context.browser
            self.context.close()
            if browser is not None:
                browser.close()
        if self._playwright_cm is not None:
            self._playwright_cm.__exit__(exc_type, exc, tb)
