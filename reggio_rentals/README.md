# Reggio Rentals Scraper

Python CLI scraper for **Immobiliare.it** rental listings in **Reggio Calabria**.

Listing data is server-rendered in a single `__NEXT_DATA__` JSON block on each search results page. No XHR waits or scroll-to-load are required.

## Install

```bash
cd reggio_rentals
pip install -e ".[dev]"
playwright install chromium
```

Or:

```bash
make install
```

## Run

```bash
python -m reggio_rentals --pages 5 --db ./data/rentals.sqlite
```

| Flag | Default | Description |
|------|---------|-------------|
| `--pages` | `5` | Number of search pages to scrape (1-indexed pagination) |
| `--db` | `reggio_rentals/data/rentals.sqlite` | SQLite output path |
| `--verbose` | off | Enable debug logging |

Example:

```bash
make scrape
python -m reggio_rentals --pages 2 --verbose
```

## Output schema

SQLite table `listings` (primary key: `id`, `unit_index`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Immobiliare listing id |
| `unit_index` | INTEGER | `0` for single-unit; `0..n-1` when `properties[]` has multiple units |
| `scraped_at` | TEXT | ISO-8601 UTC timestamp |
| `title` | TEXT | Listing title |
| `url` | TEXT | Canonical annuncio URL |
| `price_eur_month` | INTEGER | Monthly rent in EUR |
| `price_formatted` | TEXT | e.g. `€ 400/mese` |
| `typology` | TEXT | e.g. `Appartamento` |
| `surface_sqm` | INTEGER | First integer parsed from surface string |
| `rooms` | INTEGER | |
| `bathrooms` | INTEGER | |
| `advertiser_label` | TEXT | `privato` / `agenzia` |
| `advertiser_name` | TEXT | Agency display name when present |

Rows are upserted with `INSERT OR REPLACE`.

## Anti-bot notes

Immobiliare.it is protected by **DataDome**. Naive HTTP clients often receive **403**.

This scraper uses **headless Chromium** (Playwright) with:

- Italian locale and `Europe/Rome` timezone
- Realistic Chrome 124 user agent (identifies the project: `reggio-rentals/0.1 (+contact)`)
- `sec-fetch-*` and `sec-ch-ua` headers
- `navigator.webdriver` patch and `window.chrome.runtime` stub
- Homepage **warm-up** before the first search request
- **Retries** with linear backoff (2s, 4s, 6s) and re-warm-up on 403/timeout
- **1.5s delay** between page requests (single concurrent page)

If blocked, retry later or run with a residential IP. Captcha images behind `phoneUrl` are **not** decoded.

## Tests

```bash
make test
```

Parser tests use a small synthetic `tests/fixtures/next_data_page1.json` fixture (single-unit + multi-unit listing).

## Scaling beyond ~500 pages/day

For higher volume (multi-city, weekly runs):

1. Add **residential proxies** — wire `PROXY_SERVER` in [`src/reggio_rentals/config.py`](src/reggio_rentals/config.py) (future `--proxy` CLI flag).
2. Rotate **user agents** per run.
3. Keep **low concurrency** (1 page at a time) unless you operate your own proxy pool.

Retrofitting proxies later is cheaper if you keep browser setup centralized in `browser.py`.

## Data path

Primary JSON path on each results page:

`__NEXT_DATA__.props.pageProps.dehydratedState.queries[0].state.data.results[]`

Pagination: `https://www.immobiliare.it/affitto-case/reggio-calabria/?pag=N` (25 results/page).
