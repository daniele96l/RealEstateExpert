import { isImmobiliareCaptchaPage, immobiliareBlockReason } from "./immobiliare-scraper";

export class ImmobiliareBrowserError extends Error {}

let playwrightModule: typeof import("playwright") | null | undefined;

const STEALTH_INIT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
`;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function loadPlaywright(): Promise<typeof import("playwright") | null> {
  if (playwrightModule !== undefined) return playwrightModule;
  try {
    playwrightModule = await import("playwright");
    return playwrightModule;
  } catch {
    playwrightModule = null;
    return null;
  }
}

export async function isPlaywrightAvailable(): Promise<boolean> {
  const pw = await loadPlaywright();
  return pw != null;
}

function userDataDir(): string | undefined {
  const raw = process.env.IMMOBILIARE_BROWSER_PROFILE?.trim();
  if (!raw) return undefined;
  return raw.replace(/^~/, process.env.HOME ?? "");
}

export function isHeadedMode(): boolean {
  return process.env.IMMOBILIARE_BROWSER_HEADED === "1";
}

export interface ImmobiliareBrowserSession {
  fetchHtml(url: string): Promise<string>;
  fetchJson(url: string): Promise<unknown>;
  page: import("playwright").Page;
}

async function safePageContent(page: import("playwright").Page): Promise<string> {
  try {
    return await page.content();
  } catch {
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => null);
    return page.content();
  }
}

async function waitForNextData(page: import("playwright").Page, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let captchaMsgShown = false;

  while (Date.now() < deadline) {
    const html = await safePageContent(page);
    if (html.includes("__NEXT_DATA__") && !isImmobiliareCaptchaPage(html)) {
      return html;
    }
    if (isImmobiliareCaptchaPage(html) && isHeadedMode()) {
      if (!captchaMsgShown) {
        captchaMsgShown = true;
        process.stderr.write(
          "\n>>> Browser aperto — risolvi il captcha/checkbox nella finestra Chrome, poi attendi…\n\n",
        );
        await page.bringToFront().catch(() => null);
      }
    }
    await page.waitForTimeout(1500);
  }
  return safePageContent(page);
}

async function createContext(
  pw: typeof import("playwright"),
  forceHeaded?: boolean,
): Promise<{
  context: import("playwright").BrowserContext;
  browser: import("playwright").Browser | null;
}> {
  const profileDir = userDataDir();
  const headed = forceHeaded ?? isHeadedMode();
  const contextOpts = {
    locale: "it-IT" as const,
    userAgent: USER_AGENT,
    viewport: headed ? null : { width: 1280, height: 800 },
    extraHTTPHeaders: { "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" },
  };

  // Headed + persistent profile: use bundled Chromium (channel:chrome conflicts with profile)
  const channel = headed ? undefined : process.env.IMMOBILIARE_BROWSER_CHANNEL?.trim() || undefined;

  if (profileDir) {
    const context = await pw.chromium.launchPersistentContext(profileDir, {
      headless: !headed,
      channel,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
      ...contextOpts,
    });
    return { context, browser: null };
  }

  const browser = await pw.chromium.launch({
    headless: !headed,
    channel,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext(contextOpts);
  return { context, browser };
}

export async function withImmobiliareBrowser<T>(
  fn: (session: ImmobiliareBrowserSession) => Promise<T>,
): Promise<T> {
  const pw = await loadPlaywright();
  if (!pw) {
    throw new ImmobiliareBrowserError(
      "Playwright non installato. Esegui: npm install && npx playwright install chromium",
    );
  }

  const { context, browser } = await createContext(pw);
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  await page.addInitScript(STEALTH_INIT);

  try {
    const session: ImmobiliareBrowserSession = {
      page,

      async fetchHtml(url: string): Promise<string> {
        // Headed: always navigate visibly so the user can see/solve captcha
        if (!isHeadedMode()) {
          const inPage = await page.evaluate(async (targetUrl) => {
            const res = await fetch(targetUrl, { credentials: "include" });
            return { status: res.status, html: await res.text() };
          }, url);

          if (inPage.status === 200 && inPage.html.includes("__NEXT_DATA__")) {
            return inPage.html;
          }
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.bringToFront().catch(() => null);

        const waitMs = isHeadedMode() ? 180_000 : 45_000;
        const html = await waitForNextData(page, waitMs);

        if (isImmobiliareCaptchaPage(html)) {
          const reason = immobiliareBlockReason(html);
          throw new ImmobiliareBrowserError(
            reason ??
              (isHeadedMode()
                ? "Captcha non risolto in tempo. Riprova: risolvi il checkbox nella finestra del browser e attendi."
                : "Immobiliare ha mostrato un captcha. Esegui: npm run immobiliare:captcha"),
          );
        }
        return html;
      },

      async fetchJson(url: string): Promise<unknown> {
        if (!isHeadedMode()) {
          const inPage = await page.evaluate(async (targetUrl) => {
            const res = await fetch(targetUrl, {
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            const text = await res.text();
            try {
              return { status: res.status, data: JSON.parse(text) };
            } catch {
              return { status: res.status, data: null, text: text.slice(0, 200) };
            }
          }, url);

          if (inPage.status === 200 && inPage.data != null) {
            return inPage.data;
          }
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        const text = await page.evaluate(() => document.body?.innerText ?? "");
        try {
          return JSON.parse(text);
        } catch {
          throw new ImmobiliareBrowserError(
            `API Immobiliare non accessibile: ${text.slice(0, 200)}`,
          );
        }
      },
    };

    // Warm up session on homepage (skip in headed — go straight to target pages)
    if (!isHeadedMode()) {
      await page.goto("https://www.immobiliare.it/", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(2000);
    }

    return await fn(session);
  } finally {
    if (!isHeadedMode()) {
      await page.close().catch(() => null);
      await context.close();
      if (browser) await browser.close();
    } else {
      process.stderr.write("Sessione browser salvata. Chiudi la finestra manualmente se vuoi.\n");
      await context.close();
      if (browser) await browser.close();
    }
  }
}

/** Open a visible browser for manual captcha solving. Keeps open until Enter is pressed. */
export async function openBrowserForCaptcha(startUrl?: string): Promise<void> {
  const pw = await loadPlaywright();
  if (!pw) throw new ImmobiliareBrowserError("Playwright non installato");

  const url = startUrl ?? "https://www.immobiliare.it/vendita-case/reggio-calabria/";
  const { context, browser } = await createContext(pw, true);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(STEALTH_INIT);

  process.stderr.write(`\nApertura browser su: ${url}\n`);
  process.stderr.write("Risolvi il captcha/checkbox, poi premi INVIO in questo terminale…\n\n");

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.bringToFront();

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  const html = await safePageContent(page);
  const ok = html.includes("__NEXT_DATA__") && !isImmobiliareCaptchaPage(html);
  if (!ok) {
    const reason = immobiliareBlockReason(html);
    process.stderr.write(`\n${reason ?? "Pagina ancora bloccata."}\n`);
    process.stderr.write(
      "\nSe vedi \"accesso temporaneamente limitato\" nel browser:\n" +
        "  1. NON rilanciare lo scraper per 24–48 ore\n" +
        "  2. Prova immobiliare.it in Safari/Chrome normale (senza Playwright)\n" +
        "  3. Se serve subito: usa i dati Idealista già in cache (reggio_calabria_sale.json)\n",
    );
  } else {
    process.stderr.write("Sessione OK — captcha superato.\n");
  }

  await context.close();
  if (browser) await browser.close();
}

export async function fetchImmobiliareListingHtml(url: string): Promise<string> {
  return withImmobiliareBrowser((session) => session.fetchHtml(url));
}
