import {
  isPortalHeadedMode,
  withPortalBrowser,
  type PortalBrowserSession,
} from "./portal-browser";

export class IdealistaBrowserError extends Error {}

export function isIdealistaHeadedMode(): boolean {
  return isPortalHeadedMode();
}

export type IdealistaBrowserSession = PortalBrowserSession;

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
  try {
    return await withPortalBrowser(fn, {
      warmupUrl: isPortalHeadedMode() ? undefined : "https://www.idealista.it/",
      pageHasContent: pageHasListings,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "PortalBrowserError") {
      throw new IdealistaBrowserError(err.message);
    }
    throw err;
  }
}
