import { lookupPlaces } from "./placeCache";
import { neighborhoodOf } from "./maps";
import { uid } from "./parse";
import type { Candidate, MealType, Prefs } from "./types";

/** Search phrasing for each vibe chip, so Google understands the mood. */
const CHIP_TERM: Record<string, string> = {
  "natural wine bar": "natural wine bar",
  "chef's counter": "chef's counter tasting",
  "tasting menu": "tasting menu restaurant",
  "hole in the wall": "hole in the wall local eatery",
  "market stall": "food market stall",
  rooftop: "rooftop restaurant",
  "date night": "romantic restaurant",
  "long boozy lunch": "long lunch wine restaurant",
  "low-key breakfast": "casual breakfast spot",
  "loud and social": "lively buzzy restaurant",
  "quiet and refined": "quiet refined restaurant",
  "local institution": "classic institution restaurant",
  "new opening": "new restaurant",
  "great cocktails": "cocktail bar",
  "vegetarian-friendly": "vegetarian restaurant",
  "outdoor seating": "restaurant with terrace",
};

const MEAL_TERM: Record<MealType, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  drinks: "cocktail bar",
};

const PRICE_TERM: Record<number, string> = {
  1: "cheap",
  2: "affordable",
  3: "upscale",
  4: "fine dining",
};

export interface SuggestArgs {
  city: string;
  prefs: Prefs;
  meal: MealType;
  neighborhood?: string;
  /** Names / place ids already in the trip, so we don't suggest duplicates. */
  existingPlaceIds: Set<string>;
  existingNames: Set<string>;
}

/**
 * Ask Google for places that match the traveller's chips, price range and
 * the meal being filled. Everything comes back through the cached lookup.
 */
export async function suggestPlaces(args: SuggestArgs): Promise<Candidate[]> {
  const { city, prefs, meal, neighborhood } = args;
  const chips = prefs.chips.length ? prefs.chips.slice(0, 3) : [];
  const priceHint = PRICE_TERM[Math.round((prefs.priceMin + prefs.priceMax) / 2)] ?? "";

  const queries = (chips.length ? chips : ["__none__"]).map((chip) => {
    const parts = [
      CHIP_TERM[chip] ?? chip.replace("__none__", ""),
      MEAL_TERM[meal],
      priceHint,
      neighborhood,
    ].filter(Boolean);
    return { chip: chip === "__none__" ? null : chip, query: parts.join(" ") };
  });

  const out: Candidate[] = [];
  const seen = new Set(args.existingPlaceIds);
  const seenNames = new Set([...args.existingNames].map((n) => n.toLowerCase()));

  for (const { chip, query } of queries) {
    let hits;
    try {
      hits = await lookupPlaces(query, city, 5);
    } catch {
      continue;
    }
    for (const place of hits) {
      const key = place.name.toLowerCase();
      if (!place.name || seen.has(place.id) || seenNames.has(key)) continue;
      seen.add(place.id);
      seenNames.add(key);
      out.push({
        id: uid(),
        name: place.name,
        address: place.address,
        place,
        neighborhood: neighborhoodOf(place, city),
        price: place.priceLevel ?? Math.round((prefs.priceMin + prefs.priceMax) / 2),
        tags: chip ? [chip] : [],
        meals: [meal],
        cuisine: "",
        source: "suggested by Mise",
        via: "Google, matched to your vibe",
        notes: "",
        include: true,
        booking: "Not booked",
        confirmation: "",
      });
    }
  }
  return out;
}
