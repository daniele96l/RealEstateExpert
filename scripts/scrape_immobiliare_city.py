#!/usr/bin/env python3
"""Scrape Immobiliare.it city listings via curl_cffi (TLS impersonation)."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

try:
    from curl_cffi import requests
except ImportError:
    print("Install: pip install curl_cffi", file=sys.stderr)
    sys.exit(1)

BASE = "https://www.immobiliare.it"
IMPERSONATE = "chrome120"


def city_slug_from_name(city: str) -> str:
    import unicodedata
    slug = unicodedata.normalize("NFKD", city).encode("ascii", "ignore").decode().lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug).strip("_")
    return slug or "import"


def session():
    s = requests.Session(impersonate=IMPERSONATE)
    s.headers.update({
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        "Referer": f"{BASE}/",
    })
    return s


def resolve_location(s, city: str) -> dict:
    r = s.get(f"{BASE}/api-next/geography/autocomplete/", params={"query": city})
    r.raise_for_status()
    items = r.json()
    if not items:
        raise RuntimeError(f"Città non trovata: {city}")
    comune = next((i for i in items if i.get("type") == 2), items[0])
    parents = comune.get("parents") or []
    region = next((p for p in parents if p.get("type") == 0), {})
    province = next((p for p in parents if p.get("type") == 1), {})
    keyurl = comune.get("keyurl") or ""
    city_slug = keyurl.replace("_", "-").lower()
    return {
        "idComune": str(comune["id"]),
        "idProvincia": str(province.get("id", "")),
        "fkRegione": str(region.get("id", "")),
        "city_slug": city_slug,
        "label": comune.get("label", city),
        "center": comune.get("center") or {},
    }


def build_api_url(loc: dict, operation: str, page: int) -> str:
    contract = "2" if operation == "rent" else "1"
    path_segment = "affitto-case" if operation == "rent" else "vendita-case"
    path = f"/{path_segment}/{loc['city_slug']}/"
    params = {
        "fkRegione": loc["fkRegione"],
        "idProvincia": loc["idProvincia"],
        "idComune": loc["idComune"],
        "idNazione": "IT",
        "idContratto": contract,
        "idCategoria": "1",
        "criterio": "dataModifica",
        "ordine": "desc",
        "__lang": "it",
        "pag": str(page),
        "paramsCount": "5",
        "path": path,
    }
    return f"{BASE}/api-next/search-list/real-estates/?{urlencode(params)}"


def build_search_page_url(loc: dict, operation: str, page: int) -> str:
    contract = "2" if operation == "rent" else "1"
    path_segment = "affitto-case" if operation == "rent" else "vendita-case"
    params = {
        "idContratto": contract,
        "idCategoria": "1",
        "fkRegione": loc["fkRegione"],
        "idProvincia": loc["idProvincia"],
        "idComune": loc["idComune"],
        "idNazione": "IT",
        "__lang": "it",
        "pag": str(page),
        "criterio": "dataModifica",
        "ordine": "desc",
    }
    return f"{BASE}/{path_segment}/{loc['city_slug']}/?{urlencode(params)}" if page > 1 else f"{BASE}/{path_segment}/{loc['city_slug']}/"


def extract_next_data(html: str):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
    if not m:
        return None
    return json.loads(m.group(1))


def find_results(node):
    if isinstance(node, dict):
        if isinstance(node.get("results"), list) and node["results"]:
            first = node["results"][0]
            if isinstance(first, dict) and "realEstate" in first:
                return node["results"]
        for v in node.values():
            found = find_results(v)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = find_results(item)
            if found:
                return found
    return None


ITALIAN_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")


def _iso_date_from_parts(year: int, month: int, day: int) -> str | None:
    if year < 1970 or year > 2100 or month < 1 or month > 12 or day < 1 or day > 31:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def _normalize_unix_timestamp(value) -> str | None:
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    from datetime import UTC, datetime

    seconds = value / 1000 if value > 1e12 else value
    return datetime.fromtimestamp(seconds, tz=UTC).date().isoformat()


def _parse_italian_date_string(value) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    match = ITALIAN_DATE_RE.search(value)
    if not match:
        return None
    day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    return _iso_date_from_parts(year, month, day)


def _extract_listing_dates(real_estate: dict, property_row: dict) -> tuple[str | None, str | None]:
    sources = [real_estate, property_row]
    published = None
    updated = None

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
            label = _parse_italian_date_string(source.get("lastUpdate"))
            if label:
                updated = label
                break
            for value in source.values():
                if isinstance(value, str) and "aggiornato" in value.lower():
                    label = _parse_italian_date_string(value)
                    if label:
                        updated = label
                        break
            if updated:
                break

    return published, updated


def map_result(item: dict, operation: str) -> dict | None:
    re = item.get("realEstate") or item
    lid = str(re.get("id", ""))
    if not lid:
        return None
    price_obj = re.get("price") or {}
    price = price_obj.get("value") if isinstance(price_obj, dict) else price_obj
    if not price:
        return None
    props = (re.get("properties") or [{}])[0]
    loc = props.get("location") or {}
    seo = item.get("seo") or {}
    url = seo.get("url") or f"{BASE}/annunci/{lid}/"
    if url.startswith("/"):
        url = BASE + url
    sqm_raw = props.get("surface") or props.get("surface_value")
    sqm = None
    if sqm_raw:
        m = re.search(r"(\d+)", str(sqm_raw))
        sqm = int(m.group(1)) if m else None
    listing_published_at, listing_updated_at = _extract_listing_dates(re, props)
    return {
        "id": f"im_{lid}",
        "title": str(re.get("title", f"Annuncio {lid}"))[:200],
        "price": int(price),
        "operation": operation,
        "url": url,
        "lat": float(loc.get("latitude") or 0),
        "lng": float(loc.get("longitude") or 0),
        "sqm": sqm,
        "rooms": props.get("rooms"),
        "address": loc.get("address") or re.get("title"),
        "property_type": (re.get("typology") or {}).get("name") if isinstance(re.get("typology"), dict) else re.get("typology"),
        "property_type_label": (re.get("typology") or {}).get("name") if isinstance(re.get("typology"), dict) else None,
        "condition_status": None,
        "condition": None,
        "needs_renovation": None,
        "listing_published_at": listing_published_at,
        "listing_updated_at": listing_updated_at,
    }


def fetch_page(s, loc: dict, operation: str, page: int) -> tuple[list, int]:
    # API first
    api_url = build_api_url(loc, operation, page)
    r = s.get(api_url, headers={"Accept": "application/json"})
    if r.status_code == 200:
        data = r.json()
        results = find_results(data) or []
        max_pages = int(data.get("maxPages") or 1)
        listings = [x for x in (map_result(i, operation) for i in results) if x]
        return listings, max_pages

    # HTML fallback
    page_url = build_search_page_url(loc, operation, page)
    r = s.get(page_url, headers={"Accept": "text/html"})
    if "captcha-delivery" in r.text and "__NEXT_DATA__" not in r.text:
        raise RuntimeError(
            "DataDome captcha — attendi 24–48h, imposta SCRAPER_PROXY_SERVER, "
            "oppure usa npm run scrape:immobiliare:city (Playwright headless)"
        )
    data = extract_next_data(r.text)
    if not data:
        raise RuntimeError(f"Nessun dato in pagina {page_url} (status {r.status_code})")
    results = find_results(data) or []
    root = data.get("props", {}).get("pageProps", data)
    max_pages = int(root.get("maxPages") or 1) if isinstance(root, dict) else 1
    listings = [x for x in (map_result(i, operation) for i in results) if x]
    return listings, max_pages


def scrape_city(city: str, operation: str, max_pages: int = 50) -> dict:
    s = session()
    loc = resolve_location(s, city)
    print(f"  {operation}: {loc['label']} (comune={loc['idComune']})", file=sys.stderr)

    all_listings: dict[str, dict] = {}
    page = 1
    total_pages = 1
    while page <= total_pages and page <= max_pages:
        listings, total_pages = fetch_page(s, loc, operation, page)
        for l in listings:
            all_listings[l["id"]] = l
        print(f"    pag {page}/{total_pages}: +{len(listings)} (totale {len(all_listings)})", file=sys.stderr)
        if not listings:
            break
        page += 1
        time.sleep(0.8)

    center = loc.get("center") or {}

    return {
        "city": city_slug_from_name(city),
        "operation": operation,
        "fetched_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "center": {
            "lat": center.get("lat", 0),
            "lng": center.get("lng", 0),
            "display_name": loc["label"],
        },
        "listings": list(all_listings.values()),
        "provider": "direct",
    }


def merge_cache(path: Path, incoming: dict) -> dict:
    if path.exists():
        existing = json.loads(path.read_text())
        by_id = {l["id"]: l for l in existing.get("listings", [])}
        for l in incoming["listings"]:
            by_id[l["id"]] = l
        incoming["listings"] = list(by_id.values())
    return incoming


def main():
    args = sys.argv[1:]
    city = "reggio calabria"
    max_pages = 50
    sale = True
    rent = True
    for a in args:
        if a.startswith("--max-pages="):
            max_pages = int(a.split("=")[1])
        elif a == "--sale-only":
            rent = False
        elif a == "--rent-only":
            sale = False
        elif not a.startswith("--"):
            city = a

    out_dir = Path(__file__).resolve().parent.parent / "data" / "listings"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Scraping Immobiliare: {city}", file=sys.stderr)
    summary = {"city": city, "sale": 0, "rent": 0}

    if sale:
        data = scrape_city(city, "sale", max_pages)
        data = merge_cache(out_dir / f"{data['city']}_sale.json", data)
        (out_dir / f"{data['city']}_sale.json").write_text(json.dumps(data, indent=2, ensure_ascii=False))
        summary["sale"] = len(data["listings"])

    if rent:
        data = scrape_city(city, "rent", max_pages)
        data = merge_cache(out_dir / f"{data['city']}_rent.json", data)
        (out_dir / f"{data['city']}_rent.json").write_text(json.dumps(data, indent=2, ensure_ascii=False))
        summary["rent"] = len(data["listings"])

    print(json.dumps(summary))


if __name__ == "__main__":
    main()
