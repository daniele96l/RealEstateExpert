import { isImmobiliareCaptchaPage, immobiliareBlockReason } from "./immobiliare-scraper";
import {
  BrowserCoreError,
  closeBrowserSession,
  createBrowserSession,
  resolveProfileDir,
  safePageContent,
  waitForContent,
  warmUpPage,
} from "./browser-core";

export class ImmobiliareBrowserError extends Error {}

export async function isPlaywrightAvailable(): Promise<boolean> {
  try {
    const session = await createBrowserSession();
    await closeBrowserSession(session);
    return true;
  } catch {
    return false;
  }
}

export interface ImmobiliareBrowserSession {
  fetchHtml(url: string): Promise<string>;
  fetchJson(url: string): Promise<unknown>;
  page: import("playwright").Page;
}

export async function withImmobiliareBrowser<T>(
  fn: (session: ImmobiliareBrowserSession) => Promise<T>,
): Promise<T> {
  const profile = resolveProfileDir("IMMOBILIARE_BROWSER_PROFILE");
  const attempts = [
    { usePatchright: true, profileDir: profile },
    { usePatchright: true },
    { usePatchright: false, profileDir: profile },
    { usePatchright: false },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    let session: Awaited<ReturnType<typeof createBrowserSession>> | null = null;
    try {
      session = await createBrowserSession(attempt);
    } catch (err) {
      lastError = err;
      continue;
    }

    const { page, context, browser } = session;

    try {
      await warmUpPage(page, "https://www.immobiliare.it/");

      const immobiliareSession: ImmobiliareBrowserSession = {
        page,

        async fetchHtml(url: string): Promise<string> {
        try {
          const inPage = await page.evaluate(async (targetUrl) => {
            try {
              const res = await fetch(targetUrl, { credentials: "include" });
              return { status: res.status, html: await res.text() };
            } catch {
              return { status: 0, html: "" };
            }
          }, url);

          if (inPage.status === 200 && inPage.html.includes("__NEXT_DATA__")) {
            return inPage.html;
          }
        } catch {
          /* fall through to navigation */
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        const html = await waitForContent(
          page,
          (content) =>
            (content.includes("__NEXT_DATA__") || content.includes("Prezzo medio")) &&
            !isImmobiliareCaptchaPage(content),
          45_000,
        );

        if (isImmobiliareCaptchaPage(html)) {
          const reason = immobiliareBlockReason(html);
          throw new ImmobiliareBrowserError(
            reason ?? "Immobiliare ha mostrato un captcha. Attendi 24–48h o usa SCRAPER_PROXY_SERVER.",
          );
        }
        return html;
      },

      async fetchJson(url: string): Promise<unknown> {
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

      return await fn(immobiliareSession);
    } catch (err) {
      lastError = err;
      continue;
    } finally {
      await closeBrowserSession({ page, context, browser });
    }
  }

  if (lastError instanceof BrowserCoreError) {
    throw new ImmobiliareBrowserError(lastError.message);
  }
  if (lastError instanceof Error) throw lastError;
  throw new ImmobiliareBrowserError("Immobiliare non accessibile in headless.");
}

export async function fetchImmobiliareListingHtml(url: string): Promise<string> {
  return withImmobiliareBrowser((session) => session.fetchHtml(url));
}
