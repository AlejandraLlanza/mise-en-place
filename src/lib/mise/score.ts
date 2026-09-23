import { PARTY_TAG_BOOST, SOURCE_TRUST } from "./data";
import { coordsOf, nearestWalk, WALK_LIMIT_MINUTES, type LatLng } from "./geo";
import { bestTrust, mentionCount, recommenders, TRUST_WEIGHT } from "./sources";
import { tasteBonus } from "./taste";
import type { Candidate, MealType, Prefs } from "./types";

export interface ScoreResult {
  score: number;
  matched: string[];
  reasons: string[];
}

const PRIOR = 4.2;
const PRIOR_WEIGHT = 50;

/** Rating shrunk toward 4.2 by review count, so 5.0 from 3 reviews doesn't win. */
export function confidenceRating(
  rating: number | null | undefined,
  count: number | null | undefined,
): number | null {
  if (rating == null) return null;
  const n = count ?? 0;
  return (rating * n + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
}

export function ratingBonus(c: Candidate): number {
  const adj = confidenceRating(c.place?.rating, c.place?.userRatingCount);
  if (adj == null) return 0;
  return Math.max(0, Math.min(14, (adj - 4.0) * 14));
}

export function scoreCandidate(
  c: Candidate,
  prefs: Prefs,
  meal: MealType | null,
): ScoreResult {
  const matched = c.tags.filter((t) => prefs.chips.includes(t));
  const denom = Math.max(1, Math.min(prefs.chips.length, 3));
  const vibe = Math.min(1, matched.length / denom) * 40;

  const boostTags = PARTY_TAG_BOOST[prefs.party] ?? [];
  const partyBoost = c.tags.some((t) => boostTags.includes(t)) ? 6 : 0;

  let priceDrift = 0;
  if (c.price < prefs.priceMin) priceDrift = prefs.priceMin - c.price;
  if (c.price > prefs.priceMax) priceDrift = c.price - prefs.priceMax;
  const price = Math.max(0, 18 - priceDrift * 8);

  // Source trust: the base type, nudged by the per-source trust dial.
  const trust = Math.max(
    0,
    (SOURCE_TRUST[c.source] ?? 5) + (c.mentions?.length ? TRUST_WEIGHT[bestTrust(c)] : 0),
  );

  // Consensus: a place three friends named should beat a shinier place nobody did.
  const mentions = mentionCount(c);
  const consensus = Math.min(26, (mentions - 1) * 13);

  let mealFit = 8;
  if (meal) mealFit = c.meals.includes(meal) ? 15 : 0;

  const rating = ratingBonus(c);
  const taste = tasteBonus(c, prefs.taste);

  const score = Math.round(
    Math.min(
      100,
      vibe + partyBoost + price + trust + consensus + mealFit + rating + taste,
    ),
  );

  const reasons: string[] = [];
  if (matched.length) reasons.push(`matches: ${matched.join(", ")}`);
  if (mentions > 1) {
    const who = recommenders(c);
    reasons.push(
      `${mentions} people recommended this${who.length ? ` (${who.join(", ")})` : ""}`,
    );
  }
  if (taste >= 7) reasons.push("fits the places you love at home");
  if (priceDrift === 0) reasons.push("in your price range");
  else reasons.push(`${priceDrift > 0 ? "outside" : "under"} your price range`);
  if (c.place?.rating != null) {
    reasons.push(
      `${c.place.rating.toFixed(1)} on Google (${c.place.userRatingCount ?? 0} reviews)`,
    );
  }
  reasons.push(`via ${c.via || c.source}`);

  return { score, matched, reasons };
}

/**
 * Day cohesion. Uses real walking distance when both ends have coordinates,
 * and falls back to the neighborhood string when they don't.
 */
export function cohesionBonus(
  candidate: Candidate,
  center: string[],
  dayCoords: LatLng[] = [],
): number {
  const here = coordsOf(candidate.place);
  const walk = here ? nearestWalk(here, dayCoords) : null;
  if (walk != null) {
    if (walk <= 10) return 18;
    if (walk <= 20) return 12;
    if (walk <= 35) return 5;
    return 0;
  }
  if (!candidate.neighborhood || center.length === 0) return 4;
  if (center.includes(candidate.neighborhood)) return 16;
  return 0;
}

export function proximityNote(
  candidate: Candidate,
  center: string[],
  dayCoords: LatLng[] = [],
): string {
  const here = coordsOf(candidate.place);
  const walk = here ? nearestWalk(here, dayCoords) : null;
  if (walk != null) {
    return walk <= WALK_LIMIT_MINUTES
      ? `${walk} min walk from your other stops`
      : "a taxi or metro ride from the rest of the day";
  }
  if (!candidate.neighborhood) return "neighborhood unknown";
  if (center.includes(candidate.neighborhood))
    return "same neighborhood as the rest of the day";
  return "a taxi or metro ride from the rest of the day";
}
