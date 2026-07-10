# RealEstateExpert

Analizzatore di investimenti immobiliari in Italia — app Next.js con calcoli lato client e annunci da **scraping diretto** (Playwright).

Modella costi di acquisto, mutuo, ristrutturazione, affitto lungo/breve termine, imposte italiane (IMU, cedolare secca) e proietta il flusso di cassa su 20 anni.

**Disclaimer:** Stime indicative. Non costituisce consulenza finanziaria o fiscale.

## Avvio

```bash
cp .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

Apri http://localhost:3000

Un solo processo — UI, API routes e simulatore sono tutti in Next.js (deployabile su Vercel).

## Mappa annunci per città

1. Nella sezione **Mappa annunci**, inserisci una città (es. Milano)
2. Scegli **Vendita** o **Affitto** e clicca **Carica** (o usa l'importazione batch)
3. La mappa mostra i marker; clicca un annuncio per precompilare il form di analisi
4. **Aggiorna** forza un nuovo download; altrimenti i dati vengono letti da cache JSON locale

I dati vengono salvati in `data/listings/{citta}_{operation}.json`.

## Fonti dati (scraping)

- **Idealista** — Playwright su idealista.it
- **Immobiliare.it** — Playwright / scraper Python per occupancy
- **Casa.it / Subito.it** — scraper Playwright (occupancy Reggio Calabria)
- **Sreality.cz** — API pubblica (mercato Brno)

Nessuna chiave RapidAPI, ScrapingBee o RealtyAPI richiesta.

```bash
npm run scrape:idealista:city -- "Reggio Calabria"
npm run scrape:test-portals
```

## Stack

- **Next.js 15** — UI + API routes
- **Playwright** — scraping portali immobiliari
- **Leaflet** — mappa annunci
- **Recharts** — grafici flusso di cassa

## Struttura

```
app/
  page.tsx                    # Pagina principale
  api/listings/               # API routes (fetch + cache)
components/                   # Form, mappa, grafici
lib/
  engine/                     # Simulatore (client-side)
  server/                     # scrapers, geocoding
  api.ts                      # Client fetch verso /api/*
data/listings/                # Cache JSON (gitignored)
```

## Deploy (Vercel)

```bash
npm run build
vercel --prod
```

Playwright su Vercel richiede configurazione runtime adeguata; in locale usa `npm run dev`.

## Assunzioni (v1)

- IMU semplificata: `valore_catastale × aliquota_imu`
- Imposta di registro: 2% prima casa / 9% investimento
- Cedolare secca: 21% lungo termine, 26% breve termine
- Ammortamento francese per il mutuo
- Tutte le aliquote sono parametri modificabili
