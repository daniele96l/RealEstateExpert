import { spawn } from "child_process";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { geocodeCity } from "@/lib/server/geocode";
import type { CityListingsCache, MapListing } from "@/lib/types";
import { OCCUPANCY_CITY, OCCUPANCY_MARKET } from "@/lib/occupancy/constants";

const execFileAsync = promisify(execFile);

export class ReggioRentalsScraperError extends Error {}

export interface ReggioRentalsFetchProgress {
  page: number;
  maxPages: number;
  listingsTotal: number;
}

interface ReggioRentalsRow {
  id: number;
  unit_index: number;
  scraped_at: string;
  title: string | null;
  url: string | null;
  price_eur_month: number | null;
  price_formatted: string | null;
  typology: string | null;
  surface_sqm: number | null;
  rooms: number | null;
  bathrooms: number | null;
  advertiser_label: string | null;
  advertiser_name: string | null;
  lat: number | null;
  lng: number | null;
}

interface ReggioRentalsExport {
  fetched_at: string | null;
  listings: ReggioRentalsRow[];
}

function reggioRentalsRoot(): string {
  return path.join(process.cwd(), "reggio_rentals");
}

function scraperDbPath(): string {
  return path.join(reggioRentalsRoot(), "data", "occupancy.sqlite");
}

function cacheId(row: ReggioRentalsRow): string {
  return row.unit_index === 0 ? `im_${row.id}` : `im_${row.id}_${row.unit_index}`;
}

function mapRow(row: ReggioRentalsRow): MapListing | null {
  if (!row.url || row.price_eur_month == null || row.price_eur_month <= 0) {
    return null;
  }

  return {
    id: cacheId(row),
    title: row.title?.trim() || `Annuncio ${row.id}`,
    price: row.price_eur_month,
    operation: "rent",
    url: row.url,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    sqm: row.surface_sqm,
    rooms: row.rooms,
    address: row.title?.trim() || null,
    property_type: row.typology,
    property_type_label: row.typology,
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

function pythonEnv() {
  const root = reggioRentalsRoot();
  return {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: path.join(root, "src"),
      REGGIO_RENTALS_QUIET: "1",
    },
  };
}

function extractScraperError(stderr: string, exitCode: number | null): string {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    const errorMatch = line.match(/ERROR\s+\S+:\s*(.+)$/);
    if (errorMatch?.[1]) return errorMatch[1];
    if (line.includes("ScrapeError") || line.includes("ParseError")) {
      return line.slice(-240);
    }
  }

  if (exitCode != null) {
    return `reggio_rentals scraper failed (exit ${exitCode})`;
  }
  return "reggio_rentals scraper failed";
}

async function runPythonModule(module: string, args: string[]): Promise<string> {
  const { cwd, env } = pythonEnv();

  try {
    const { stdout, stderr } = await execFileAsync("python3", ["-m", module, ...args], {
      cwd,
      env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
    if (stderr?.trim()) {
      process.stderr.write(stderr);
    }
    return stdout;
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err && typeof err.stderr === "string" ? err.stderr : "";
    const message = stderr
      ? extractScraperError(stderr, null)
      : err instanceof Error
        ? err.message
        : String(err);
    throw new ReggioRentalsScraperError(message || "reggio_rentals scraper failed");
  }
}

async function runScraperWithProgress(
  pages: number,
  dbPath: string,
  onProgress?: (progress: ReggioRentalsFetchProgress) => void,
): Promise<void> {
  const { cwd, env } = pythonEnv();

  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", ["-m", "reggio_rentals", "--pages", String(pages), "--db", dbPath], {
      cwd,
      env,
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as {
            type?: string;
            page?: number;
            total?: number;
            listings?: number;
          };
          if (event.type === "progress" && event.page && event.total) {
            onProgress?.({
              page: event.page,
              maxPages: event.total,
              listingsTotal: event.listings ?? 0,
            });
          }
        } catch {
          // ignore non-json stderr
        }
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new ReggioRentalsScraperError(extractScraperError(stderr, code)));
    });
  });
}

export async function fetchReggioRentalsListings(
  maxPages?: number,
  onProgress?: (progress: ReggioRentalsFetchProgress) => void,
): Promise<CityListingsCache> {
  const pages = Math.min(resolveItalyListingMaxPages(maxPages ?? 10), 10);
  const dbPath = scraperDbPath();

  await runScraperWithProgress(pages, dbPath, onProgress);

  const stdout = await runPythonModule("reggio_rentals.export_db", ["--db", dbPath]);
  const exported = JSON.parse(stdout) as ReggioRentalsExport;
  const listings = exported.listings
    .map(mapRow)
    .filter((listing): listing is MapListing => listing != null);

  if (!listings.length) {
    throw new ReggioRentalsScraperError("Scraper returned no rental listings");
  }

  const centerData = await geocodeCity(OCCUPANCY_CITY, OCCUPANCY_MARKET);
  const withCoords = listings.filter((l) => l.lat !== 0 || l.lng !== 0);
  const avgLat =
    withCoords.length > 0
      ? withCoords.reduce((sum, l) => sum + l.lat, 0) / withCoords.length
      : centerData.lat;
  const avgLng =
    withCoords.length > 0
      ? withCoords.reduce((sum, l) => sum + l.lng, 0) / withCoords.length
      : centerData.lng;

  return {
    city: "reggio_calabria",
    operation: "rent",
    fetched_at: exported.fetched_at || new Date().toISOString(),
    center: {
      lat: centerData.lat || avgLat,
      lng: centerData.lng || avgLng,
      display_name: centerData.display_name ?? OCCUPANCY_CITY,
    },
    listings,
    provider: "reggio_rentals",
  };
}
