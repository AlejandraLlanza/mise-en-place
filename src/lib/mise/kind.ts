import type { PlaceData } from "./places.functions";

/** Sources now collect two kinds of place, not just restaurants. */
export type PlaceKind = "restaurant" | "activity";

const FOOD_TYPES = new Set([
  "restaurant",
  "bar",
  "cafe",
  "coffee_shop",
  "bakery",
  "food",
  "meal_takeaway",
  "meal_delivery",
  "ice_cream_shop",
  "wine_bar",
  "pub",
  "sandwich_shop",
  "fine_dining_restaurant",
  "food_court",
]);

const ACTIVITY_TYPES = new Set([
  "museum",
  "art_gallery",
  "park",
  "national_park",
  "tourist_attraction",
  "historical_landmark",
  "historical_place",
  "cultural_landmark",
  "monument",
  "store",
  "book_store",
  "clothing_store",
  "shopping_mall",
  "spa",
  "market",
  "plaza",
  "church",
  "place_of_worship",
  "garden",
  "botanical_garden",
  "zoo",
  "aquarium",
  "performing_arts_theater",
  "concert_hall",
  "night_club",
  "library",
  "observation_deck",
]);

const ACTIVITY_WORDS = [
  "museum",
  "museo",
  "gallery",
  "galería",
  "galeria",
  "exhibition",
  "park",
  "parque",
  "garden",
  "jardín",
  "jardin",
  "market",
  "mercado",
  "bookshop",
  "bookstore",
  "librería",
  "libreria",
  "shop",
  "store",
  "boutique",
  "concept store",
  "spa",
  "temazcal",
  "onsen",
  "hammam",
  "cathedral",
  "church",
  "iglesia",
  "castle",
  "palace",
  "casa ",
  "house museum",
  "walk",
  "walking",
  "stroll",
  "hike",
  "ferry",
  "boat",
  "trajinera",
  "sunset",
  "viewpoint",
  "mirador",
  "ruins",
  "pyramid",
  "gig",
  "live music",
  "concert",
  "show",
  "exhibit",
  "architecture",
  "design",
  "vintage",
  "flea",
];

const FOOD_WORDS = [
  "restaurant",
  "restaurante",
  "taqueria",
  "taquería",
  "taco",
  "bar",
  "cantina",
  "cafe",
  "café",
  "coffee",
  "bakery",
  "panadería",
  "panaderia",
  "pizzeria",
  "trattoria",
  "izakaya",
  "sushi",
  "ramen",
  "bistro",
  "brasserie",
  "wine",
  "cocktail",
  "mezcal",
  "brunch",
  "breakfast",
  "lunch",
  "dinner",
  "tasting menu",
  "eat",
  "comer",
  "dinner at",
  "seafood",
  "marisquería",
];

/** Things that are not a place at all — "take the ferry to Xochimilco". */
const NON_PLACE_RE =
  /^(take|walk|stroll|ride|catch|watch|wander|hike|cycle|bike|explore|spend|do|see the sunset|pasea|camina|toma)\b/i;

export function isNonPlacePhrase(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (NON_PLACE_RE.test(t)) return true;
  return /\b(at sunset|at sunrise|by bike|on foot|the ferry|a picnic)\b/i.test(t);
}

/** Classify from the resolved Google Places types, falling back to wording. */
export function classifyPlace(
  place: PlaceData | null | undefined,
  text = "",
): PlaceKind {
  const types = [place?.primaryType, ...(place?.types ?? [])].filter(
    (t): t is string => Boolean(t),
  );
  if (types.length > 0) {
    if (types.some((t) => FOOD_TYPES.has(t))) return "restaurant";
    if (types.some((t) => ACTIVITY_TYPES.has(t))) return "activity";
  }
  return classifyText(text);
}

/** Best guess before we've resolved anything against Google. */
export function classifyText(text: string): PlaceKind {
  const lower = ` ${text.toLowerCase()} `;
  if (isNonPlacePhrase(text)) return "activity";
  const food = FOOD_WORDS.some((w) => lower.includes(w));
  const activity = ACTIVITY_WORDS.some((w) => lower.includes(w));
  if (activity && !food) return "activity";
  return "restaurant";
}
