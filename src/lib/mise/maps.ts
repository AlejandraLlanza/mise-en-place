import type { PlaceData } from "./places.functions";
import type { MealType } from "./types";

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsDirectionsUrl(origin: string, destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin,
  )}&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

/** What we hand Google for a place: the real address if we have it, else name + city. */
export function placeQuery(
  name: string,
  address: string | undefined,
  city: string,
): string {
  const a = (address ?? "").trim();
  if (a) return `${name}, ${a}`;
  return `${name}, ${city}`;
}

export function mealFromTime(time: string): MealType {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const mins = h * 60 + m;
  if (mins < 11 * 60) return "breakfast";
  if (mins < 17 * 60) return "lunch";
  if (mins < 22 * 60) return "dinner";
  return "drinks";
}

/**
 * Google's own address components decide the neighbourhood, in the order a
 * traveller would name it: neighbourhood, then sublocality, then ward /
 * district, then the wider administrative area, then the postal district.
 */
const NEIGHBORHOOD_TYPES: string[][] = [
  ["neighborhood"],
  ["sublocality_level_1", "sublocality"],
  ["sublocality_level_2"],
  ["administrative_area_level_3", "ward"],
  ["administrative_area_level_2"],
  ["postal_town"],
];

export function neighborhoodFromComponents(
  place: PlaceData | null | undefined,
  city = "",
): string {
  const comps = place?.components;
  if (!comps || comps.length === 0) return "";
  for (const group of NEIGHBORHOOD_TYPES) {
    for (const c of comps) {
      if (!c.types.some((t) => group.includes(t))) continue;
      const value = (c.longText || c.shortText).trim();
      if (value && !isCityOrCountry(value, city, place?.address ?? "")) return value;
    }
  }
  // Nothing named: the postal district is still more useful than a blank.
  const postal = comps.find((c) => c.types.includes("postal_code"));
  const code = (postal?.longText || postal?.shortText || "").trim();
  return code ? `postal district ${code}` : "";
}

/** The neighbourhood of a resolved place, with free text as the last resort. */
export function neighborhoodOf(
  place: PlaceData | null | undefined,
  city = "",
): string {
  return (
    neighborhoodFromComponents(place, city) ||
    neighborhoodFromAddress(place?.address ?? "", city)
  );
}

/**
 * Fallback for entries Google never resolved: read a district segment out of
 * the free-text address itself ("… , Shimokitazawa, Setagaya …").
 */
export function neighborhoodFromAddress(address: string, city = ""): string {
  if (!address.trim()) return "";
  const district = districtFromAddress(address);
  return isCityOrCountry(district, city, address) ? "" : district;
}

/** The city or country name is not a neighbourhood — better to show nothing. */
function isCityOrCountry(value: string, city: string, address: string): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  const parts = address
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const country = parts[parts.length - 1] ?? "";
  if (v === country) return true;
  for (const token of city.toLowerCase().split(/[,/]/)) {
    const t = token.trim();
    if (t.length > 2 && (v === t || t.includes(v) || v.includes(t))) return true;
  }
  return false;
}

const clean = (p: string) =>
  p
    .replace(/〒\s*[\d-]+/g, "")
    .replace(/\b[A-Z]{0,2}[- ]?\d[\dA-Z-]{2,}\b/gi, "")
    .replace(/^(col\.?|colonia|barrio|distrito)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const isPostcodePart = (p: string) => /〒/.test(p) || /^\s*[\d-]{4,}\s*$/.test(p);

/**
 * Generic fallback: the comma segment sitting next to the street line.
 * Works for "…, Roma Nte., …" (street first) and "Japan, 〒…, Minato City,
 * Minamiaoyama, 2-chōme…" (street last).
 */
export function districtFromAddress(address: string): string {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return "";

  const streetIdx = parts.findIndex((p) => /\d/.test(p) && !isPostcodePart(p));
  if (streetIdx === -1) return clean(parts[1] ?? "");

  const neighbour =
    streetIdx === 0
      ? parts[1]
      : (parts.slice(0, streetIdx).reverse().find((p) => !isPostcodePart(p)) ??
        parts[streetIdx - 1]);

  const picked = clean(neighbour ?? "");
  if (picked.length > 2) return picked;
  return clean(parts[1] ?? "");
}

export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

export const BOOKED_VIA = [
  "Resy",
  "OpenTable",
  "direct",
  "WhatsApp",
  "hotel concierge",
  "other",
] as const;
