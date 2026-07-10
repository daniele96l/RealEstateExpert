import {
  BrowserCoreError,
  closeBrowserSession,
  createBrowserSession,
  isGenericBlockedHtml,
  resolveProfileDir,
  safePageContent,
  scraperProxyServer,
  waitForContent,
  warmUpPage,
} from "./browser-core";
import { parseListingCards, parseMapSearchHtml } from "./idealista-search";

export class IdealistaBrowserError extends Error {}

export function isIdealistaCaptchaPage(html: string): boolean {
  return isGenericBlockedHtml(html);
}

function pageHasListings(html: string): boolean {
  return (
    html.includes("adMapMarkers") ||
    html.includes("mapMarkers") ||
    html.includes("item-info-container") ||
    html.includes("/immobile/") ||
    (html.includes("latitude") && html.includes("price"))
  );
}

function parseListingsFromBody(html: string, operation: "sale" | "rent"): boolean {
  if (!html || isIdealistaCaptchaPage(html)) return false;
  const markers = parseMapSearchHtml(html, operation);
  if (markers.length) return true;
  return parseListingCards(html, operation).length > 0;
}

export type IdealistaBrowserSession = {
  fetchHtml(url: string, opts?: { warmup?: string; forceNavigation?: boolean }): Promise<string>;
};

type BrowserSession = Awaited<ReturnType<typeof createBrowserSession>>;

async function tryFetchHtml(
  session: BrowserSession,
  url: string,
  operation: "sale" | "rent",
  opts?: { warmup?: string; forceNavigation?: boolean },
): Promise<string | null> {
  const { page } = session;
  const capturedBodies: string[] = [];

  const onResponse = async (response: import("playwright").Response) => {
    try {
      const resUrl = response.url();
      if (!resUrl.includes("idealista")) return;
      if (response.status() !== 200) return;
      const body = await response.text();
      if (
        body.includes("adMapMarkers") ||
        body.includes("mapMarkers") ||
        body.includes("/immobile/") ||
        (body.includes("latitude") && body.includes("price"))
      ) {
        capturedBodies.push(body);
      }
    } catch {
      /* ignore */
    }
  };

  page.on("response", onResponse);

  try {
    const warmup = opts?.warmup;
    if (warmup) await warmUpPage(page, warmup);

    if (!opts?.forceNavigation) {
      try {
        const inPage = await page.evaluate(async (targetUrl) => {
          try {
            const res = await fetch(targetUrl, { credentials: "include" });
            return { status: res.status, html: await res.text() };
          } catch {
            return { status: 0, html: "" };
          }
        }, url);

        if (
          inPage.status === 200 &&
          parseListingsFromBody(inPage.html, operation) &&
          !isIdealistaCaptchaPage(inPage.html)
        ) {
          return inPage.html;
        }
      } catch {
        /* fall through to navigation */
      }
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const html = await waitForContent(
      page,
      (content) => pageHasListings(content) && !isIdealistaCaptchaPage(content),
      45_000,
    );

    if (pageHasListings(html) && !isIdealistaCaptchaPage(html)) {
      return html;
    }

    for (const body of capturedBodies) {
      if (parseListingsFromBody(body, operation)) {
        return body.length > html.length ? body : html;
      }
    }

    for (const body of capturedBodies) {
      const wrapped = `<html><body><script>${body}</script></body></html>`;
      if (parseListingsFromBody(wrapped, operation)) return wrapped;
    }

    return null;
  } finally {
    page.off("response", onResponse);
  }
}

interface IdealistaBrowserAttempt {
  usePatchright: boolean;
  profileDir?: string;
  proxyServer?: string;
}

function buildAttempts(): IdealistaBrowserAttempt[] {
  const profile = resolveProfileDir("IDEALISTA_BROWSER_PROFILE", ".idealista-browser");
  const proxy = scraperProxyServer();
  const attempts: IdealistaBrowserAttempt[] = [
    { usePatchright: true },
    { usePatchright: false },
    { usePatchright: true, profileDir: profile },
    { usePatchright: false, profileDir: profile },
  ];
  if (proxy) {
    attempts.push({ usePatchright: true, proxyServer: proxy });
  }
  return attempts;
}

export async function withIdealistaBrowser<T>(
  fn: (session: IdealistaBrowserSession) => Promise<T>,
  operation: "sale" | "rent" = "rent",
): Promise<T> {
  let lastError: unknown;

  for (const attempt of buildAttempts()) {
    let session: BrowserSession | null = null;
    try {
      session = await createBrowserSession({
        usePatchright: attempt.usePatchright,
        profileDir: attempt.profileDir,
        proxyServer: attempt.proxyServer,
      });

      await warmUpPage(session.page, "https://www.idealista.it/");

      const idealistaSession: IdealistaBrowserSession = {
        fetchHtml: async (url, opts) => {
          const html = await tryFetchHtml(session!, url, operation, opts);
          if (!html) {
            throw new IdealistaBrowserError(
              "Idealista bloccato (DataDome). Prova SCRAPER_PROXY_SERVER o attendi 24h.",
            );
          }
          return html;
        },
      };

      return await fn(idealistaSession);
    } catch (err) {
      lastError = err;
      continue;
    } finally {
      if (session) await closeBrowserSession(session);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new IdealistaBrowserError(
    "Idealista non accessibile in headless. Imposta SCRAPER_PROXY_SERVER o riprova più tardi.",
  );
}

export async function fetchIdealistaPageHtml(
  url: string,
  operation: "sale" | "rent" = "rent",
  opts?: { forceNavigation?: boolean },
): Promise<string> {
  return withIdealistaBrowser(
    async (session) => session.fetchHtml(url, { forceNavigation: opts?.forceNavigation }),
    operation,
  );
}
