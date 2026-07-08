export class IdealistaBrowserError extends Error {}

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

export function isIdealistaHeadedMode(): boolean {
  return process.env.IDEALISTA_BROWSER_HEADED === "1";
}

export interface IdealistaBrowserSession {
  fetchHtml(url: string): Promise<string>;
}

async function createContext(pw: typeof import("playwright")) {
  const headed = isIdealistaHeadedMode();
  const channel = process.platform === "darwin" ? "chrome" : undefined;
  const contextOpts = {
    userAgent: USER_AGENT,
    locale: "it-IT",
    viewport: { width: 1280, height: 900 },
  };

  if (headed) {
    const browser = await pw.chromium.launch({
      headless: false,
      channel,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext(contextOpts);
    return { context, browser };
  }

  const browser = await pw.chromium.launch({
    headless: true,
    channel,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext(contextOpts);
  return { context, browser };
}

function pageHasListings(html: string): boolean {
  return (
    html.includes("adMapMarkers") ||
    html.includes("mapMarkers") ||
    html.includes("/immobile/") ||
    html.includes("latitude")
  );
}

export async function withIdealistaBrowser<T>(
  fn: (session: IdealistaBrowserSession) => Promise<T>,
): Promise<T> {
  const pw = await loadPlaywright();
  if (!pw) {
    throw new IdealistaBrowserError(
      "Playwright non installato. Esegui: npx playwright install chromium",
    );
  }

  const { context, browser } = await createContext(pw);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(STEALTH_INIT);

  try {
    const session: IdealistaBrowserSession = {
      async fetchHtml(url: string): Promise<string> {
        if (!isIdealistaHeadedMode()) {
          const inPage = await page.evaluate(async (targetUrl) => {
            const res = await fetch(targetUrl, { credentials: "include" });
            return { status: res.status, html: await res.text() };
          }, url);

          if (inPage.status === 200 && pageHasListings(inPage.html)) {
            return inPage.html;
          }
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(isIdealistaHeadedMode() ? 5000 : 3000);
        return page.content();
      },
    };

    if (!isIdealistaHeadedMode()) {
      await page.goto("https://www.idealista.it/", {
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
