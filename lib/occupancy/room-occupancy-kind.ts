/**
 * Classifies room-rental ads from description text:
 * - private_room: whole room for one tenant (solo / soukromý pokoj)
 * - shared_bed: bed or spot inside a multi-occupant room
 * - unknown: not enough signal
 */

export type RoomOccupancyKind = "private_room" | "shared_bed" | "unknown";

export type RoomOccupancyKindFilter = "all" | RoomOccupancyKind;

function normalizeDescription(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00ad/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Strong: renting a bed / spot, not the whole room. */
const SHARED_BED_PATTERNS: RegExp[] = [
  /luzko ve sdilen/,
  /luzko ve .{0,40}pokoji/,
  /luzko v .{0,40}pokoji/,
  /pronajem luzka/,
  /pronajem luzek/,
  /nabizime luzko/,
  /nabizime luzka/,
  /volne misto v pokoji/,
  /misto v pokoji/,
  /jednotliveho luzka/,
  /jednotlive luzko/,
  /pro 1 osobu v pokoji pro/,
  /pro jednu osobu v pokoji pro/,
  /sdilen[ey]m? (dvojluzkov|dvouluzkov|triluzkov|ctyrluzkov)/,
  /posto letto/,
  /posto\s*letto/,
  /bed in (a )?shared/,
  /shared bed/,
  /spot in (a )?(shared )?room/,
];

/** Strong: whole private room. */
const PRIVATE_ROOM_PATTERNS: RegExp[] = [
  /soukrom(y|eho|y) pokoj/,
  /soukrom(y|eho) pokoje/,
  /jednoluzkov(y|eho) pokoj/,
  /jednoluzkov(y|eho) pokoje/,
  /samostatn(y|eho) pokoj/,
  /samostatn(y|eho) pokoje/,
  /vlastni pokoj/,
  /private room/,
  /single room/,
  /camera singola/,
  /stanza singola/,
  /camera privata/,
  /stanza privata/,
];

/** Soft shared: multi-bed room wording without "renting the room as a whole". */
const SOFT_SHARED_PATTERNS: RegExp[] = [
  /\bluzko\b/,
  /volne misto/,
  /misto pro (slecn|student)/,
  /pokoj(e)? se (dvema|tremi|ctyrmi) luzk/,
  /sdilen(y|em) pokoj/,
];

/** Soft private: renting a (possibly double) room as a unit. */
const SOFT_PRIVATE_PATTERNS: RegExp[] = [
  /pronajem (dvojluzkov|dvouluzkov|jednoluzkov)/,
  /pronajem .{0,24}(dvojluzkov|dvouluzkov|jednoluzkov)/,
  /(dvojluzkov|dvouluzkov|jednoluzkov)\w* pokoj/,
  /nepruchozi pokoj/,
  /nabizim .{0,40}pokoj/,
  /nabizime .{0,40}pokoj/,
  /k pronajmu .{0,40}pokoj/,
  /pronajem pokoje?\b/,
  /volny pokoj/,
  /posledni volny pokoj/,
  /sdilene bydleni/,
];

export function parseRoomOccupancyKind(
  description: string | null | undefined,
): RoomOccupancyKind {
  if (!description?.trim()) return "unknown";
  const text = normalizeDescription(description);
  if (!text) return "unknown";

  let shared = 0;
  let privateScore = 0;

  for (const pattern of SHARED_BED_PATTERNS) {
    if (pattern.test(text)) shared += 3;
  }
  for (const pattern of PRIVATE_ROOM_PATTERNS) {
    if (pattern.test(text)) privateScore += 3;
  }
  for (const pattern of SOFT_SHARED_PATTERNS) {
    if (pattern.test(text)) shared += 1;
  }
  for (const pattern of SOFT_PRIVATE_PATTERNS) {
    if (pattern.test(text)) privateScore += 1;
  }

  // "sdileny byt" alone means shared flat, not necessarily shared bedroom.
  if (/\bsdilen(y|em) byt/.test(text) && privateScore === 0 && shared === 0) {
    privateScore += 1;
  }

  if (shared === 0 && privateScore === 0) return "unknown";
  if (shared > privateScore) return "shared_bed";
  if (privateScore > shared) return "private_room";
  // Tie: prefer shared when luzko/misto present, else private.
  if (/\bluzk|\bmisto v pokoji|\bvolne misto/.test(text)) return "shared_bed";
  return "private_room";
}
