import { CUISINE_KEYWORDS, VIBE_KEYWORDS } from "./data";
import type { PlaceData } from "./places.functions";
import type { Candidate } from "./types";

export interface TasteProfile {
  count: number;
  priceMin: number;
  priceMax: number;
  priceAvg: number;
  cuisines: string[];
  casualShare: number; // 0 = always formal, 1 = always casual
  ratingAvg: number | null;
  ratingFloor: number | null;
}

/** Best-guess cuisine for a resolved place, read off its name and address. */
export function cuisineOfPlace(place: PlaceData): string {
  const hay = `${place.name} ${place.address}`.toLowerCase();
  for (const [phrase, cuisine] of CUISINE_KEYWORDS) {
    if (hay.includes(phrase)) return cuisine;
  }
  return "";
}

/** Turn a handful of home-city favourites into a taste fingerprint. */
export function deriveTaste(places: PlaceData[]): TasteProfile | null {
  const list = places.filter(Boolean);
  if (list.length === 0) return null;

  const prices = list
    .map((p) => p.priceLevel)
    .filter((p): p is number => typeof p === "number");
  const ratings = list
    .map((p) => p.rating)
    .filter((r): r is number => typeof r === "number");

  const priceAvg = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : 2;
  const casual = prices.filter((p) => p <= 2).length;

  const cuisines: string[] = [];
  for (const p of list) {
    const c = cuisineOfPlace(p);
    if (c && !cuisines.includes(c)) cuisines.push(c);
  }

  const ratingAvg = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;

  return {
    count: list.length,
    priceMin: prices.length ? Math.min(...prices) : 1,
    priceMax: prices.length ? Math.max(...prices) : 4,
    priceAvg,
    cuisines: cuisines.slice(0, 4),
    casualShare: prices.length ? casual / prices.length : 0.5,
    ratingAvg,
    ratingFloor: ratingAvg != null ? Math.round((ratingAvg - 0.2) * 10) / 10 : null,
  };
}

function priceWords(avg: number): string {
  if (avg <= 1.4) return "budget";
  if (avg <= 2.2) return "mid-range";
  if (avg <= 3.1) return "mid-to-high price";
  return "high-end";
}

/** Plain-words read-back of what the app learned. */
export function describeTaste(t: TasteProfile): string {
  const bits: string[] = [priceWords(t.priceAvg)];
  if (t.cuisines.length) bits.push(`${t.cuisines.slice(0, 3).join(" and ")}-led`);
  bits.push(
    t.casualShare >= 0.66
      ? "informal"
      : t.casualShare <= 0.34
        ? "more formal"
        : "a mix of casual and formal",
  );
  if (t.ratingFloor != null) bits.push(`you like places rated ${t.ratingFloor.toFixed(1)}+`);
  return `You lean: ${bits.join(", ")}.`;
}

/** Chips implied by a free-text description of the kind of place wanted. */
export function chipsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const [phrase, chip] of VIBE_KEYWORDS) {
    if (lower.includes(phrase) && !out.includes(chip)) out.push(chip);
  }
  return out;
}

/** 0–12 points of extra vibe match for fitting the home-taste fingerprint. */
export function tasteBonus(c: Candidate, t: TasteProfile | null | undefined): number {
  if (!t) return 0;
  let score = 0;
  const price = c.place?.priceLevel ?? c.price;
  if (price >= t.priceMin && price <= t.priceMax) score += 5;
  else if (Math.abs(price - t.priceAvg) <= 1) score += 2;

  const cuisine = (c.cuisine || (c.place ? cuisineOfPlace(c.place) : "")).toLowerCase();
  if (cuisine && t.cuisines.some((x) => x.toLowerCase() === cuisine)) score += 4;

  const rating = c.place?.rating;
  if (t.ratingFloor != null && rating != null && rating >= t.ratingFloor) score += 3;
  return score;
}
