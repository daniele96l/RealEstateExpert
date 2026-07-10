import {
  BrowserCoreError,
  browserPageDelay,
  closeBrowserSession,
  createBrowserSession,
  warmUpPage,
} from "./browser-core";

export class PortalBrowserError extends Error {}

export const PORTAL_BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export const PORTAL_PAGE_DELAY_MS = 1500;

export interface PortalBrowserSession {
  fetchHtml(url: string, opts?: { warmup?: string; forceNavigation?: boolean }): Promise<string>;
}

export interface PortalBrowserOptions {
  warmupUrl?: string;
  pageHasContent?: (html: string) => boolean;
}

export async function withPortalBrowser<T>(
  fn: (session: PortalBrowserSession) => Promise<T>,
  options: PortalBrowserOptions = {},
): Promise<T> {
  let session: Awaited<ReturnType<typeof createBrowserSession>>;
  try {
    session = await createBrowserSession();
  } catch (err) {
    if (err instanceof BrowserCoreError) throw new PortalBrowserError(err.message);
    throw err;
  }

  const { page, context, browser } = session;

  try {
    if (options.warmupUrl) {
      await warmUpPage(page, options.warmupUrl);
    }

    const portalSession: PortalBrowserSession = {
      async fetchHtml(url: string, opts?: { warmup?: string; forceNavigation?: boolean }): Promise<string> {
        const warmup = opts?.warmup;
        if (warmup) {
          await warmUpPage(page, warmup);
        }

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

            const hasContent = options.pageHasContent?.(inPage.html) ?? inPage.status === 200;
            if (inPage.status === 200 && hasContent && inPage.html.length > 2000) {
              return inPage.html;
            }
          } catch {
            /* fall through to navigation */
          }
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(3000);
        return page.content();
      },
    };

    return await fn(portalSession);
  } finally {
    await closeBrowserSession({ page, context, browser });
  }
}

export async function portalPageDelay(): Promise<void> {
  await browserPageDelay();
}
