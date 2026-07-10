export class PortalBrowserError extends Error {}

let playwrightModule: typeof import("playwright") | null | undefined;

const STEALTH_INIT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
`;

export const PORTAL_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const PORTAL_PAGE_DELAY_MS = 1500;

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

export function isPortalHeadedMode(): boolean {
  return process.env.PORTAL_BROWSER_HEADED === "1" || process.env.IDEALISTA_BROWSER_HEADED === "1";
}

export interface PortalBrowserSession {
  fetchHtml(url: string, opts?: { warmup?: string; forceNavigation?: boolean }): Promise<string>;
}

export interface PortalBrowserOptions {
  warmupUrl?: string;
  /** Custom check that HTML contains expected listing data. */
  pageHasContent?: (html: string) => boolean;
}

async function createContext(pw: typeof import("playwright")) {
  const headed = isPortalHeadedMode();
  const channel = process.platform === "darwin" ? "chrome" : undefined;
  const contextOpts = {
    userAgent: PORTAL_BROWSER_USER_AGENT,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: 1366, height: 900 },
  };

  const browser = await pw.chromium.launch({
    headless: !headed,
    channel,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext(contextOpts);
  return { context, browser };
}

export async function withPortalBrowser<T>(
  fn: (session: PortalBrowserSession) => Promise<T>,
  options: PortalBrowserOptions = {},
): Promise<T> {
  const pw = await loadPlaywright();
  if (!pw) {
    throw new PortalBrowserError(
      "Playwright non installato. Esegui: npx playwright install chromium",
    );
  }

  const { context, browser } = await createContext(pw);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(STEALTH_INIT);

  try {
    const session: PortalBrowserSession = {
      async fetchHtml(url: string, opts?: { warmup?: string; forceNavigation?: boolean }): Promise<string> {
        const warmup = opts?.warmup;
        if (warmup && !isPortalHeadedMode()) {
          await page.goto(warmup, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await page.waitForTimeout(2000);
        }

        if (!opts?.forceNavigation && !isPortalHeadedMode()) {
          const inPage = await page.evaluate(async (targetUrl) => {
            const res = await fetch(targetUrl, { credentials: "include" });
            return { status: res.status, html: await res.text() };
          }, url);

          const hasContent = options.pageHasContent?.(inPage.html) ?? inPage.status === 200;
          if (inPage.status === 200 && hasContent && inPage.html.length > 2000) {
            return inPage.html;
          }
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(isPortalHeadedMode() ? 5000 : 3000);
        return page.content();
      },
    };

    if (options.warmupUrl && !isPortalHeadedMode()) {
      await page.goto(options.warmupUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(2000);
    }

    return await fn(session);
  } finally {
    await page.close().catch(() => null);
    await context.close();
    if (browser) await browser.close();
  }
}

export async function portalPageDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, PORTAL_PAGE_DELAY_MS));
}
