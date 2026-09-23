import { searchNearbyPlaces, type PlaceData } from "./places.functions";
import { coordsOf, metersBetween, travel, walkMinutes, type LatLng } from "./geo";
import { hasKnownHours, hoursNote, overlapMinutes } from "./hours";
import { neighborhoodOf } from "./maps";
import { uid } from "./parse";
import { PACE_COUNT, type TravelProfile } from "./travel";
import type { Candidate, Day, Prefs } from "./types";
import { mentionCount } from "./sources";
import { INDOOR_TYPES, isOutdoorPlace } from "./weather";

/* ---------------- interest chips → Google place types ---------------- */

const INTEREST_TYPES: Record<string, string[]> = {
  "art & museums": ["museum", "art_gallery"],
  "architecture & design": ["tourist_attraction", "historical_landmark"],
  markets: ["market"],
  "parks & nature": ["park", "garden"],
  "shopping & concept stores": ["clothing_store", "gift_shop"],
  history: ["historical_landmark", "historical_place"],
  "live music": ["night_club", "performing_arts_theater"],
  "spa & wellness": ["spa"],
  bookshops: ["book_store"],
  "neighbourhood walking": ["park", "plaza"],
};

const DEFAULT_TYPES = ["tourist_attraction", "museum", "park"];

export function typesForInterests(profile: TravelProfile | undefined | null) {
  const out: string[] = [];
  for (const chip of profile?.interests ?? []) {
    for (const t of INTEREST_TYPES[chip] ?? []) if (!out.includes(t)) out.push(t);
  }
  return (out.length ? out : DEFAULT_TYPES).slice(0, 8);
}

/** Low-energy types, preferred for late blocks as a soft tiebreak only. */
const EASY_TYPES = new Set([
  "bar",
  "wine_bar",
  "pub",
  "night_club",
  "park",
  "garden",
  "plaza",
  "performing_arts_theater",
  "book_store",
  "spa",
]);

const HEAVY_TYPES = new Set([
  "museum",
  "art_gallery",
  "zoo",
  "aquarium",
  "national_park",
  "amusement_park",
]);

/* ------------------------- search radius ------------------------- */

const MIN_RADIUS = 800;
const MAX_RADIUS = 3000;

/** Radius follows the day's own spread: dense city, tight circle. */
export function radiusForDay(day: Day, byId: Map<string, Candidate>): number {
  const pts: LatLng[] = [];
  for (const s of day.slots) {
    const c = s.candidateId ? byId.get(s.candidateId) : null;
    const p = coordsOf(c?.place);
    if (p) pts.push(p);
  }
  let spread = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      spread = Math.max(spread, metersBetween(pts[i]!, pts[j]!));
    }
  }
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(spread)));
}

/* ------------------------- nearby cache ------------------------- */

const CACHE_KEY = "mise.nearby.v1";

function readCache(): Record<string, PlaceData[]> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(store: Record<string, PlaceData[]>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Nearby search, cached by rounded location + radius + types. Billed per call. */
export async function nearbyCached(
  at: LatLng,
  radius: number,
  includedTypes: string[],
): Promise<PlaceData[]> {
  const key = [
    at.lat.toFixed(3),
    at.lng.toFixed(3),
    Math.round(radius / 200) * 200,
    includedTypes.join("+"),
  ].join("|");
  const store = readCache();
  const hit = store[key];
  if (hit) return hit;
  const found = await searchNearbyPlaces({
    data: { lat: at.lat, lng: at.lng, radius, includedTypes, limit: 16 },
  });
  store[key] = found;
  writeCache(store);
  return found;
}

/* ------------------------- suggestions ------------------------- */

export interface BlockSuggestion {
  candidate: Candidate;
  /** True when a friend's recommendation — those always win. */
  fromSources: boolean;
  walkMin: number | null;
  hours: string | null;
  why: string;
}

export interface BlockContext {
  date: string;
  start: string;
  end: string;
  /** Where the previous meal was, and what it was called. */
  from: LatLng | null;
  fromName: string;
  city: string;
  prefs: Prefs;
}

const MIN_OVERLAP = 60;

function typeLabel(place: PlaceData | null | undefined): string {
  const t = place?.primaryType ?? place?.types?.[0] ?? "";
  return t ? t.replace(/_/g, " ") : "thing to do";
}

function countLabel(n: number | null | undefined): string {
  if (!n) return "";
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

function matchedInterests(text: string, prefs: Prefs): string[] {
  const lower = text.toLowerCase();
  return (prefs.travel?.interests ?? []).filter((chip) =>
    (INTEREST_TYPES[chip] ?? [])
      .map((t) => t.replace(/_/g, " "))
      .concat(chip.split(" & "))
      .some((word) => lower.includes(word.toLowerCase())),
  );
}

/** A why-line built only from real signals — never invented copy. */
function buildWhy(c: Candidate, travelLine: string | null, prefs: Prefs): string {
  const bits: string[] = [];
  if (travelLine) bits.push(`${travelLine} from ${"the last meal"}`);
  if (c.place?.rating != null) {
    const count = countLabel(c.place.userRatingCount);
    bits.push(`${c.place.rating.toFixed(1)}★${count ? ` (${count})` : ""}`);
  }
  const matches = matchedInterests(
    `${c.name} ${typeLabel(c.place)} ${(c.place?.types ?? []).join(" ")}`,
    prefs,
  );
  if (matches.length) bits.push(`matches: ${matches.join(", ")}`);
  if (c.via && c.source === "friend rec") bits.push(`via ${c.via}`);
  else if (mentionCount(c) > 1) bits.push(`${mentionCount(c)} people said so`);
  return bits.join(" · ");
}

function energyScore(place: PlaceData | null | undefined, startMin: number): number {
  if (startMin < 17 * 60) return 0; // only late blocks get the tiebreak
  const types = new Set(place?.types ?? []);
  let s = 0;
  for (const t of types) {
    if (EASY_TYPES.has(t)) s += 6;
    if (HEAVY_TYPES.has(t)) s -= 6;
  }
  return s;
}

const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Does this place's real opening data cover enough of the block? */
export function fitsBlock(
  place: PlaceData | null | undefined,
  ctx: BlockContext,
): boolean {
  if (!hasKnownHours(place)) return true; // unknown hours is not "closed"
  return overlapMinutes(place, ctx.date, ctx.start, ctx.end) >= MIN_OVERLAP;
}

function toSuggestion(
  candidate: Candidate,
  ctx: BlockContext,
  fromSources: boolean,
): BlockSuggestion {
  const at = coordsOf(candidate.place);
  const trip = at && ctx.from ? travel(ctx.from, at) : null;
  const walk = trip ? trip.minutes : null;
  const why = buildWhy(candidate, trip?.label ?? null, ctx.prefs).replace(
    "the last meal",
    ctx.fromName || "the last meal",
  );
  return {
    candidate,
    fromSources,
    walkMin: walk,
    hours: hoursNote(candidate.place, ctx.date),
    why,
  };
}

export function suggestionCount(prefs: Prefs): number {
  return PACE_COUNT[prefs.travel?.pace ?? "balanced"];
}

/**
 * Two pools, in priority order: what the user's people recommended, then
 * Nearby Search around the block. Opening hours decide what fits.
 */
export async function suggestForBlock(
  ctx: BlockContext,
  pool: Candidate[],
  radius: number,
  taken: Set<string>,
): Promise<BlockSuggestion[]> {
  const want = suggestionCount(ctx.prefs);
  const startMin = toMin(ctx.start);

  const mine = pool
    .filter(
      (c) =>
        c.include &&
        (c.kind ?? "restaurant") === "activity" &&
        !taken.has(c.id) &&
        fitsBlock(c.place, ctx),
    )
    .map((c) => toSuggestion(c, ctx, true))
    .sort((a, b) => {
      const walkA = a.walkMin ?? 99;
      const walkB = b.walkMin ?? 99;
      const energy =
        energyScore(b.candidate.place, startMin) -
        energyScore(a.candidate.place, startMin);
      return energy !== 0 ? energy : walkA - walkB;
    });

  if (mine.length >= want || !ctx.from) return mine.slice(0, Math.max(want, 2));

  let found: PlaceData[] = [];
  try {
    found = await nearbyCached(ctx.from, radius, typesForInterests(ctx.prefs.travel));
  } catch {
    return mine;
  }

  const seen = new Set(
    pool.map((c) => c.place?.id).filter((i): i is string => !!i),
  );
  const nearby: BlockSuggestion[] = [];
  for (const place of found) {
    if (!place.name || seen.has(place.id)) continue;
    if (!fitsBlock(place, ctx)) continue;
    seen.add(place.id);
    nearby.push(
      toSuggestion(
        {
          id: uid(),
          name: place.name,
          kind: "activity",
          address: place.address,
          place,
          neighborhood: neighborhoodOf(place, ctx.city),
          price: place.priceLevel ?? 1,
          tags: [],
          meals: [],
          cuisine: "",
          source: "suggested by Mise",
          via: "Google, near your meals",
          notes: "",
          include: true,
          booking: "Not booked",
          confirmation: "",
        },
        ctx,
        false,
      ),
    );
  }

  nearby.sort((a, b) => {
    const energy =
      energyScore(b.candidate.place, startMin) -
      energyScore(a.candidate.place, startMin);
    if (energy !== 0) return energy;
    const ratingA = a.candidate.place?.rating ?? 0;
    const ratingB = b.candidate.place?.rating ?? 0;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return (a.walkMin ?? 99) - (b.walkMin ?? 99);
  });

  return [...mine, ...nearby].slice(0, Math.max(want, 3));
}

/* ------------------- wet-weather plan B ------------------- */

/**
 * Indoor options for a stop the weather has spoiled: the traveller's own
 * indoor recommendations first, then indoor places around the same spot.
 */
export async function indoorAlternatives(
  ctx: BlockContext,
  pool: Candidate[],
  radius: number,
  taken: Set<string>,
): Promise<BlockSuggestion[]> {
  const want = Math.max(suggestionCount(ctx.prefs), 3);

  const mine = pool
    .filter(
      (c) =>
        c.include &&
        (c.kind ?? "restaurant") === "activity" &&
        !taken.has(c.id) &&
        !c.noPlace &&
        !isOutdoorPlace(c.place, c.name) &&
        fitsBlock(c.place, ctx),
    )
    .map((c) => toSuggestion(c, ctx, true))
    .sort((a, b) => (a.walkMin ?? 99) - (b.walkMin ?? 99));

  if (mine.length >= want || !ctx.from) return mine.slice(0, want);

  let found: PlaceData[] = [];
  try {
    found = await nearbyCached(ctx.from, radius, INDOOR_TYPES);
  } catch {
    return mine;
  }

  const seen = new Set(pool.map((c) => c.place?.id).filter((i): i is string => !!i));
  const nearby: BlockSuggestion[] = [];
  for (const place of found) {
    if (!place.name || seen.has(place.id)) continue;
    if (isOutdoorPlace(place, place.name)) continue;
    if (!fitsBlock(place, ctx)) continue;
    seen.add(place.id);
    nearby.push(
      toSuggestion(
        {
          id: uid(),
          name: place.name,
          kind: "activity",
          address: place.address,
          place,
          neighborhood: neighborhoodOf(place, ctx.city),
          price: place.priceLevel ?? 1,
          tags: [],
          meals: [],
          cuisine: "",
          source: "suggested by Mise",
          via: "Google, indoors near your meals",
          notes: "",
          include: true,
          booking: "Not booked",
          confirmation: "",
        },
        ctx,
        false,
      ),
    );
  }

  nearby.sort(
    (a, b) =>
      (b.candidate.place?.rating ?? 0) - (a.candidate.place?.rating ?? 0) ||
      (a.walkMin ?? 99) - (b.walkMin ?? 99),
  );
  return [...mine, ...nearby].slice(0, want);
}
