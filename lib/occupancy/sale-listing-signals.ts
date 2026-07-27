/**
 * Parses sale-listing descriptions (and structured floor) for deal-screening signals:
 * ownership (cooperative vs personal), floor level, coop loan, renovation / building type.
 * CZ + IT (+ light EN) patterns; text is NFKD-normalized without diacritics.
 */

export type SaleOwnershipKind = "cooperative" | "personal" | "unknown";
export type SaleFloorKind = "basement" | "ground" | "upper" | "unknown";
export type SaleConditionKind =
  | "new_build"
  | "renovated"
  | "good"
  | "needs_renovation"
  | "old"
  | "unknown";

export type SaleOwnershipFilter = "all" | SaleOwnershipKind;
export type SaleFloorFilter = "all" | SaleFloorKind;

export interface SaleListingSignals {
  ownership: SaleOwnershipKind;
  floor: SaleFloorKind;
  condition: SaleConditionKind;
  after_renovation: boolean;
  needs_renovation: boolean;
  panel_building: boolean;
  brick_building: boolean;
  has_outdoor: boolean;
  /** Družstevní byt with an aliquot / družstvo loan still attached. */
  coop_loan: boolean;
  new_build: boolean;
}

function normalizeDescription(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00ad/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const COOPERATIVE_PATTERNS: RegExp[] = [
  /druzstevni/,
  /druzstevniho/,
  /druzstevnim/,
  /druzstevni(ho)?\s+podil/,
  /prevod druzstevni/,
  /druzstvo/,
  /\bin cooperativa\b/,
  /proprieta cooperativa/,
  /cooperative ownership/,
  /coop\.?\s*ownership/,
];

const PERSONAL_PATTERNS: RegExp[] = [
  /osobni vlastnictvi/,
  /v osobnim vlastnictvi/,
  /ve vlastnictvi/,
  /\bov\b/,
  /plna vlastnictvi/,
  /piena proprieta/,
  /proprieta piena/,
  /proprieta privata/,
  /full ownership/,
  /freehold/,
];

/** Flat is in the basement — avoid bare "podzemni" (often the building garage level). */
const BASEMENT_PATTERNS: RegExp[] = [
  /\bsuteren\b/,
  /sklepni byt/,
  /sklepni jednot/,
  /byt v (suteren|sklep|podzemi)/,
  /byt .{0,24}(v )?podzemni(m)?\s+podlaz/,
  /seminterrato/,
  /\bcantina\b/,
  /\binterrato\b/,
  /\bbasement\b/,
  /below ground/,
];

const GROUND_PATTERNS: RegExp[] = [
  /\bprizemi\b/,
  /v prizemi/,
  /prizemni/,
  /1\s*\.?\s*nadzemni(m)?\s+podlaz/,
  /piano terra/,
  /pianoterra/,
  /\bpt\b/,
  /ground floor/,
  /ground-floor/,
  /piano rialzato/,
];

const UPPER_PATTERNS: RegExp[] = [
  /\b\d+\s*\.?\s*patr[oe]\b/,
  /\b[2-9]\d*\s*\.?\s*nadzemni(m)?\s+podlaz/,
  /\b\d+\s*np\b/,
  /\b\d+\s*\.?\s*piano\b/,
  /\bpiano\s+\d+\b/,
  /\b\d+(st|nd|rd|th)\s+floor\b/,
  /\bfloor\s+\d+\b/,
  /posledni patr[oe]/,
  /ultimo piano/,
  /attic/,
  /podkrovi/,
  /mansarda/,
];

const AFTER_RENO_PATTERNS: RegExp[] = [
  /po rekonstrukci/,
  /po kompletni rekonstrukci/,
  /zrekonstruovan/,
  /rekonstruovan/,
  /ristrutturat[oa]/,
  /recently renovated/,
  /fully renovated/,
];

const NEEDS_RENO_PATTERNS: RegExp[] = [
  /k rekonstrukci/,
  /pred rekonstrukci/,
  /v puvodnim stavu/,
  /da ristrutturare/,
  /da rifinire/,
  /needs renovation/,
  /to renovate/,
];

const PANEL_PATTERNS: RegExp[] = [/panelak/, /panelov(y|eho|em)/, /panelove(m)? dum/];

const BRICK_PATTERNS: RegExp[] = [
  /cihlov(y|eho|em)/,
  /\bcihla\b/,
  /ciheln(y|eho)/,
  /muratura/,
  /brick (building|house|construction)/,
];

const OUTDOOR_PATTERNS: RegExp[] = [
  /\bbalkon/,
  /\bteras/,
  /\bzahrad/,
  /\bbalcony\b/,
  /\bterrace\b/,
  /\bgarden\b/,
  /\bbalcone\b/,
  /\bterrazz/,
  /\bgiardin/,
];

const COOP_LOAN_PATTERNS: RegExp[] = [
  /alikvotn/,
  /anuitn/,
  /uver .{0,60}druzstv/,
  /druzstv.{0,60}uver/,
  /dlouhodob(y|eho)\s+uver/,
  /mesicni\s+platb.{0,40}druzstv/,
  /splaceni uveru/,
  /prebir[aá].{0,40}uver/,
  /cast(i)? uveru/,
];

const NEW_BUILD_PATTERNS: RegExp[] = [
  /novostavb/,
  /nova vystavba/,
  /developer(sky|ske)/,
  /kolaudac/,
  /newly built/,
  /new build/,
  /new development/,
  /nuova costruzione/,
  /di recente costruzion/,
];

const GOOD_CONDITION_PATTERNS: RegExp[] = [
  /velmi dobr(y|em) stav/,
  /vyborn(y|em) stav/,
  /dobr(y|em) stav/,
  /udrzovan/,
  /ottimo stato/,
  /buono stato/,
  /good condition/,
  /excellent condition/,
];

const OLD_CONDITION_PATTERNS: RegExp[] = [
  /v puvodnim stavu/,
  /puvodni stav/,
  /puvodni dispozice/,
  /starsi byt/,
  /starsi dum/,
  /nezrekonstruovan/,
  /neudrzovan/,
  /\bold condition\b/,
  /stato originale/,
  /anni\s+\d{2,4}/,
];

function scorePatterns(text: string, patterns: RegExp[]): number {
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) score += 1;
  }
  return score;
}

function conditionFromStructured(input: {
  condition_status?: string | null;
  condition?: string | null;
  needs_renovation?: boolean | null;
}): SaleConditionKind {
  const status = (input.condition_status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    status === "newdevelopment" ||
    status === "new_development" ||
    status === "newly_built" ||
    status === "newlybuilt"
  ) {
    return "new_build";
  }
  if (status === "almost_new" || status === "almostnew") return "renovated";
  if (status === "good") return "good";
  if (
    status === "torestore" ||
    status === "to_restore" ||
    status === "renew" ||
    status === "needs_renovation"
  ) {
    return "needs_renovation";
  }
  if (status === "ruin") return "old";

  const label = normalizeDescription(input.condition ?? "");
  if (label) {
    if (/novostavb|nuova costruzione|new (build|development)|recente costruzion/.test(label)) {
      return "new_build";
    }
    if (/po rekonstrukci|ristrutturat|renovat|quasi nuov|almost new/.test(label)) {
      return "renovated";
    }
    if (/da ristruttur|k rekonstrukci|to restore|needs renovation/.test(label)) {
      return "needs_renovation";
    }
    if (/puvodni|starsi|ruin|originale|old/.test(label)) return "old";
    if (/dobr|buono|good|ottimo|udrzovan/.test(label)) return "good";
  }

  if (input.needs_renovation === true) return "needs_renovation";
  if (input.needs_renovation === false) return "good";
  return "unknown";
}

function conditionFromText(
  text: string,
  flags: { new_build: boolean; after_renovation: boolean; needs_renovation: boolean },
): SaleConditionKind {
  if (flags.needs_renovation) return "needs_renovation";
  if (flags.new_build) return "new_build";
  if (flags.after_renovation) return "renovated";
  if (scorePatterns(text, OLD_CONDITION_PATTERNS) > 0) return "old";
  if (scorePatterns(text, GOOD_CONDITION_PATTERNS) > 0) return "good";
  return "unknown";
}

function parseOwnership(text: string): SaleOwnershipKind {
  const coop = scorePatterns(text, COOPERATIVE_PATTERNS);
  const personal = scorePatterns(text, PERSONAL_PATTERNS);
  if (coop === 0 && personal === 0) return "unknown";
  if (coop > personal) return "cooperative";
  if (personal > coop) return "personal";
  // Tie: cooperative wording usually explicit when both appear (e.g. "převod do OV").
  if (/prevod (do|na) (osobni|ov)/.test(text) || /prevoditeln/.test(text)) return "cooperative";
  return coop >= personal ? "cooperative" : "personal";
}

function parseFloorFromStructured(floor: string | null | undefined): SaleFloorKind {
  if (!floor?.trim()) return "unknown";
  const text = normalizeDescription(floor);
  if (!text) return "unknown";
  if (
    /suteren|sklep|basement|seminterrato|cantina|interrato|^-/.test(text) ||
    text === "-1" ||
    text === "s"
  ) {
    return "basement";
  }
  if (
    /prizemi|piano terra|pianoterra|ground|rialzato|^pt$|^p$|^0$|^parter|^1\.?\s*np/.test(
      text,
    )
  ) {
    return "ground";
  }
  if (
    /^\d+/.test(text) ||
    /patr[oe]|nadzemni|piano|floor|np|podkrovi|mansarda|attic/.test(text)
  ) {
    return "upper";
  }
  return "unknown";
}

function parseFloorFromText(text: string): SaleFloorKind {
  const basement = scorePatterns(text, BASEMENT_PATTERNS);
  const ground = scorePatterns(text, GROUND_PATTERNS);
  const upper = scorePatterns(text, UPPER_PATTERNS);
  if (basement === 0 && ground === 0 && upper === 0) return "unknown";
  if (basement >= ground && basement >= upper) return "basement";
  if (ground >= upper) return "ground";
  return "upper";
}

export function parseSaleListingSignals(input: {
  description?: string | null;
  title?: string | null;
  floor?: string | null;
  garden?: boolean | null;
  terrace?: boolean | null;
  needs_renovation?: boolean | null;
  condition?: string | null;
  condition_status?: string | null;
}): SaleListingSignals {
  const text = normalizeDescription(
    [input.title, input.description].filter((part) => part?.trim()).join(" \n "),
  );

  const structuredFloor = parseFloorFromStructured(input.floor);
  const textFloor = text ? parseFloorFromText(text) : "unknown";
  const floor =
    structuredFloor !== "unknown"
      ? structuredFloor
      : textFloor !== "unknown"
        ? textFloor
        : "unknown";

  const after_renovation = text ? scorePatterns(text, AFTER_RENO_PATTERNS) > 0 : false;
  const needs_renovation =
    input.needs_renovation === true ||
    (text ? scorePatterns(text, NEEDS_RENO_PATTERNS) > 0 : false);
  const new_build = text ? scorePatterns(text, NEW_BUILD_PATTERNS) > 0 : false;

  const has_outdoor =
    input.garden === true ||
    input.terrace === true ||
    (text ? scorePatterns(text, OUTDOOR_PATTERNS) > 0 : false);

  const structuredCondition = conditionFromStructured(input);
  const textCondition = text
    ? conditionFromText(text, {
        new_build,
        after_renovation,
        needs_renovation: needs_renovation && !after_renovation,
      })
    : "unknown";
  const condition =
    structuredCondition !== "unknown"
      ? structuredCondition
      : textCondition !== "unknown"
        ? textCondition
        : "unknown";

  return {
    ownership: text ? parseOwnership(text) : "unknown",
    floor,
    condition,
    after_renovation,
    needs_renovation: needs_renovation && !after_renovation,
    panel_building: text ? scorePatterns(text, PANEL_PATTERNS) > 0 : false,
    brick_building: text ? scorePatterns(text, BRICK_PATTERNS) > 0 : false,
    has_outdoor,
    coop_loan: text ? scorePatterns(text, COOP_LOAN_PATTERNS) > 0 : false,
    new_build,
  };
}
