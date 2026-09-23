import { classifyPlace, type PlaceKind } from "./kind";
import { neighborhoodOf } from "./maps";
import {
  lookupLocalName,
  searchRestaurants,
  type PlaceData,
} from "./places.functions";

/** The traveller's own language — Places answers in it where it can. */
export function userLanguage(): string {
  const raw = typeof navigator === "undefined" ? "en" : navigator.language || "en";
  // Google only accepts BCP-47 tags like "en", "en-GB", "pt-BR".
  const match = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2}|-[a-zA-Z]{4}|-\d{3})?/.exec(raw);
  return match ? match[0] : "en";
}

const PLACE_KEY = "mise.places.v1";
const QUERY_KEY = "mise.placeQueries.v1";

type PlaceMap = Record<string, PlaceData>;
type QueryMap = Record<string, string[]>; // normalized query -> place ids

function read<T>(key: string): T {
  if (typeof window === "undefined") return {} as T;
  try {
    return (JSON.parse(window.localStorage.getItem(key) ?? "{}") ?? {}) as T;
  } catch {
    return {} as T;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — cache is best effort */
  }
}

export function getCachedPlace(id: string): PlaceData | null {
  return read<PlaceMap>(PLACE_KEY)[id] ?? null;
}

export function cachePlaces(places: PlaceData[]) {
  if (places.length === 0) return;
  const map = read<PlaceMap>(PLACE_KEY);
  for (const p of places) map[p.id] = p;
  write(PLACE_KEY, map);
}

/**
 * The name in the local language, fetched once per place and cached forever.
 * "Senso-ji / 浅草寺" needs both, and we only ever pay for it once.
 */
export async function withLocalName(place: PlaceData): Promise<PlaceData> {
  const cached = getCachedPlace(place.id);
  if (cached?.localName !== undefined && cached.localName !== null) {
    return { ...place, localName: cached.localName };
  }
  if (cached && "localName" in cached) return { ...place, localName: cached.localName ?? null };
  try {
    const local = await lookupLocalName({ data: { placeId: place.id } });
    const next = { ...place, localName: local ?? null };
    cachePlaces([next]);
    return next;
  } catch {
    const next = { ...place, localName: null };
    cachePlaces([next]);
    return next;
  }
}

const norm = (query: string, city: string) =>
  `${query.trim().toLowerCase()}|${city.trim().toLowerCase()}`;

/** Cached Places text search. Never re-fetches a query we've already run. */
export async function lookupPlaces(
  query: string,
  city: string,
  limit = 6,
  kind: "restaurant" | "activity" | "any" = "restaurant",
): Promise<PlaceData[]> {
  const key = `${norm(query, city)}|${kind}`;
  const queries = read<QueryMap>(QUERY_KEY);
  const cachedIds = queries[key];
  if (cachedIds) {
    const places = read<PlaceMap>(PLACE_KEY);
    const hits = cachedIds.map((id) => places[id]).filter((p): p is PlaceData => !!p);
    if (hits.length === cachedIds.length) return hits;
  }

  const results = await searchRestaurants({
    data: { query, city, limit, kind, languageCode: userLanguage() },
  });
  cachePlaces(results);
  queries[key] = results.map((r) => r.id);
  write(QUERY_KEY, queries);
  return results;
}

/**
 * Resolve a batch of candidate names to real places, one at a time.
 * Anything already carrying a place, or that Google can't find, is left alone.
 */
export async function resolveCandidates<
  T extends {
    name: string;
    address?: string;
    neighborhood: string;
    price: number;
    place?: PlaceData | null;
    kind?: PlaceKind;
    noPlace?: boolean;
    quote?: string;
  },
>(candidates: T[], city: string): Promise<T[]> {
  const out: T[] = [];
  for (const c of candidates) {
    // Notes like "walk Avenida Ámsterdam at sunset" are never looked up.
    if (c.place || c.noPlace || !c.name.trim()) {
      out.push(c);
      continue;
    }
    try {
      const hits = await lookupPlaces(
        c.name,
        city,
        1,
        // Only bias the query when the text was explicit; otherwise let
        // Google's own types decide whether this is food or a thing to do.
        c.kind === "activity" ? "activity" : "any",
      );
      const hit = hits[0] ? await withLocalName(hits[0]) : undefined;
      out.push(
        hit
          ? {
              ...c,
              place: hit,
              // The Google types are the source of truth for what this is.
              kind: classifyPlace(hit, `${c.name} ${c.quote ?? ""}`),
              address: hit.address,
              neighborhood: c.neighborhood || neighborhoodOf(hit, city),
              price: hit.priceLevel ?? c.price,
            }
          : { ...c, place: null },
      );
    } catch {
      out.push({ ...c, place: null });
    }
  }
  return out;
}
