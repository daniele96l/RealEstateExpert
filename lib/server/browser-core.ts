import path from "path";
import os from "os";

export class BrowserCoreError extends Error {}

type ChromiumLauncher = {
  launch: (options?: Record<string, unknown>) => Promise<import("playwright").Browser>;
  launchPersistentContext: (
    userDataDir: string,
    options?: Record<string, unknown>,
  ) => Promise<import("playwright").BrowserContext>;
};

export type PlaywrightModule = {
  chromium: ChromiumLauncher;
};

let playwrightModule: PlaywrightModule | null | undefined;
let patchrightModule: PlaywrightModule | null | undefined;

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const BROWSER_PAGE_DELAY_MS = 1500;

export const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--headless=new",
];

export const BROWSER_EXTRA_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "sec-ch-ua": '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

export interface BrowserContextOptions {
  profileDir?: string;
  usePatchright?: boolean;
  proxyServer?: string;
}

export function resolveProfileDir(envKey: string, defaultSubdir?: string): string | undefined {
  const raw = process.env[envKey]?.trim();
  if (raw) return raw.replace(/^~/, process.env.HOME ?? "");
  if (defaultSubdir) return path.join(os.homedir(), defaultSubdir);
  return undefined;
}

export function scraperProxyServer(): string | undefined {
  return process.env.SCRAPER_PROXY_SERVER?.trim() || undefined;
}

export async function loadPlaywright(preferPatchright = false): Promise<PlaywrightModule | null> {
  if (preferPatchright) {
    const patchright = await loadPatchright();
    if (patchright) return patchright;
  }
  if (playwrightModule !== undefined) return playwrightModule;
  try {
    playwrightModule = (await import("playwright")) as unknown as PlaywrightModule;
    return playwrightModule;
  } catch {
    playwrightModule = null;
    return null;
  }
}

async function loadPatchright(): Promise<PlaywrightModule | null> {
  if (patchrightModule !== undefined) return patchrightModule;
  try {
    const mod = await import("patchright");
    patchrightModule = mod as unknown as PlaywrightModule;
    return patchrightModule;
  } catch {
    patchrightModule = null;
    return null;
  }
}

function launchProxy(proxyServer?: string) {
  const server = proxyServer ?? scraperProxyServer();
  return server ? { server } : undefined;
}

function browserChannel(): "chrome" | undefined {
  if (process.env.SCRAPER_BROWSER_CHANNEL?.trim()) {
    const ch = process.env.SCRAPER_BROWSER_CHANNEL.trim();
    return ch === "chrome" ? "chrome" : undefined;
  }
  return process.platform === "darwin" ? "chrome" : undefined;
}

export async function createBrowserSession(
  options: BrowserContextOptions = {},
): Promise<{
  pw: PlaywrightModule;
  context: import("playwright").BrowserContext;
  browser: import("playwright").Browser | null;
  page: import("playwright").Page;
}> {
  const pw = await loadPlaywright(options.usePatchright ?? false);
  if (!pw) {
    throw new BrowserCoreError(
      "Playwright non installato. Esegui: npx playwright install chromium",
    );
  }

  const profileDir = options.profileDir;
  const proxy = launchProxy(options.proxyServer);
  const channel = browserChannel();
  const contextOpts = {
    userAgent: BROWSER_USER_AGENT,
    locale: "it-IT" as const,
    timezoneId: "Europe/Rome",
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: BROWSER_EXTRA_HEADERS,
    proxy,
  };

  let context: import("playwright").BrowserContext;
  let browser: import("playwright").Browser | null = null;

  if (profileDir) {
    context = await pw.chromium.launchPersistentContext(profileDir, {
      headless: true,
      channel,
      args: LAUNCH_ARGS,
      ...contextOpts,
    });
  } else {
    browser = await pw.chromium.launch({
      headless: true,
      channel,
      args: LAUNCH_ARGS,
      proxy,
    });
    context = await browser.newContext(contextOpts);
  }

  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(STEALTH_INIT_SCRIPT);

  return { pw, context, browser, page };
}

export async function closeBrowserSession(session: {
  page: import("playwright").Page;
  context: import("playwright").BrowserContext;
  browser: import("playwright").Browser | null;
}): Promise<void> {
  await session.page.close().catch(() => null);
  await session.context.close();
  if (session.browser) await session.browser.close();
}

export async function warmUpPage(
  page: import("playwright").Page,
  url: string,
  timeoutMs = 60_000,
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
  await page.waitForTimeout(2000);
}

export async function safePageContent(page: import("playwright").Page): Promise<string> {
  try {
    return await page.content();
  } catch {
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => null);
    return page.content();
  }
}

export async function waitForContent(
  page: import("playwright").Page,
  predicate: (html: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const html = await safePageContent(page);
    if (predicate(html)) return html;
    await page.waitForTimeout(1500);
  }
  return safePageContent(page);
}

export function isGenericBlockedHtml(html: string): boolean {
  const lowered = html.toLowerCase();
  return (
    lowered.includes("captcha-delivery.com") ||
    lowered.includes("geo.captcha") ||
    lowered.includes("datadome") ||
    (html.length < 4000 && lowered.includes("dd={"))
  );
}

export async function browserPageDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, BROWSER_PAGE_DELAY_MS));
}
