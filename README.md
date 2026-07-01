# RealEstateExpert

Analizzatore di investimenti immobiliari in Italia — app Next.js con calcoli lato client e annunci Idealista via **RapidAPI** o **ScrapingBee**.

Modella costi di acquisto, mutuo, ristrutturazione, affitto lungo/breve termine, imposte italiane (IMU, cedolare secca) e proietta il flusso di cassa su 20 anni.

**Disclaimer:** Stime indicative. Non costituisce consulenza finanziaria o fiscale.

## Avvio

```bash
cp .env.example .env.local   # inserisci RAPIDAPI_KEY e/o SCRAPINGBEE_API_KEY
npm install
npm run dev
```

Apri http://localhost:3000

Un solo processo — UI, API routes e simulatore sono tutti in Next.js (deployabile su Vercel).

## Mappa annunci per città

1. Nella sezione **Mappa annunci Idealista**, inserisci una città (es. Milano)
2. Scegli **Vendita** o **Affitto**, seleziona **RapidAPI** o **ScrapingBee**, e clicca **Carica**
3. La mappa mostra i marker; clicca un annuncio per precompilare il form di analisi
4. **Aggiorna** forza un nuovo download da Idealista; altrimenti i dati vengono letti da cache JSON locale

I dati vengono salvati in `data/listings/{citta}_{operation}.json`.

## Configurazione API annunci

In `.env.local`:

```env
# RapidAPI Idealista17 (consigliato)
RAPIDAPI_KEY=your_rapidapi_key_here
LISTINGS_PROVIDER=rapidapi

# Alternativa: scraping HTML
SCRAPINGBEE_API_KEY=your_key_here
```

- **RapidAPI** — [Idealista17](https://rapidapi.com/happyendpoint/api/idealista17): usa `smart-search` + `property-search-by-url`
- **ScrapingBee** — scraping diretto di idealista.it (~5 crediti per città)

Le chiavi restano server-side (mai esposte al browser).

## Stack

- **Next.js 15** — UI + API routes
- **RapidAPI Idealista17** / **ScrapingBee** — annunci Idealista
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
  server/                     # RapidAPI, ScrapingBee, geocoding
  api.ts                      # Client fetch verso /api/*
data/listings/                # Cache JSON (gitignored)
```

## Deploy (Vercel)

```bash
npm run build
vercel --prod
```

Imposta le variabili d'ambiente `RAPIDAPI_KEY`, `SCRAPINGBEE_API_KEY` e `LISTINGS_PROVIDER` nel dashboard Vercel.

## Assunzioni (v1)

- IMU semplificata: `valore_catastale × aliquota_imu`
- Imposta di registro: 2% prima casa / 9% investimento
- Cedolare secca: 21% lungo termine, 26% breve termine
- Ammortamento francese per il mutuo
- Tutte le aliquote sono parametri modificabili
