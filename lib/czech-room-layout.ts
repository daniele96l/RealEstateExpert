import type { MapListing } from "./types";

export const CZ_ROOM_LAYOUT_OPTIONS: { value: string; label: string }[] = [
  { value: "1+kk", label: "1+kk" },
  { value: "1+1", label: "1+1" },
  { value: "2+kk", label: "2+kk" },
  { value: "2+1", label: "2+1" },
  { value: "3+kk", label: "3+kk" },
  { value: "3+1", label: "3+1" },
  { value: "4+kk", label: "4+kk" },
  { value: "4+1", label: "4+1" },
  { value: "5+", label: "5+" },
];

export function czechRoomLayoutFromListing(listing: Pick<MapListing, "title" | "url">): string | null {
  const titleMatch = listing.title.match(/bytu\s+(\d+\+(?:kk|\d+))/i);
  if (titleMatch) return titleMatch[1].toLowerCase().replace(/\s/g, "");

  const urlMatch = listing.url.match(/\/byt\/([^/?#]+)/);
  if (urlMatch) {
    const seg = decodeURIComponent(urlMatch[1]).toLowerCase();
    if (/^\d+\+(?:kk|\d+)$/.test(seg)) return seg;
  }
  return null;
}

export function matchesCzechRoomLayout(
  listing: Pick<MapListing, "title" | "url">,
  filter: string | null,
): boolean {
  if (filter == null) return true;
  const layout = czechRoomLayoutFromListing(listing);
  if (!layout) return false;
  if (filter === "5+") {
    const m = layout.match(/^(\d+)/);
    return m != null && parseInt(m[1], 10) >= 5;
  }
  return layout === filter;
}
