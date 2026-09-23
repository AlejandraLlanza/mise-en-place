import type { PlaceData } from "./places.functions";

export interface LatLng {
  lat: number;
  lng: number;
}

export function coordsOf(place: PlaceData | null | undefined): LatLng | null {
  if (!place || place.lat == null || place.lng == null) return null;
  return { lat: place.lat, lng: place.lng };
}

/** Straight-line metres between two points. */
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Street-network detour factor, at a normal city walking pace. */
export function walkMinutes(a: LatLng, b: LatLng): number {
  const meters = metersBetween(a, b) * 1.35;
  return Math.max(1, Math.round(meters / 80));
}

/** Beyond this many minutes on foot, a traveller takes a taxi or the metro. */
export const WALK_LIMIT_MINUTES = 20;

/** Door-to-door minutes by car / transit, city traffic, including waiting. */
export function rideMinutes(a: LatLng, b: LatLng): number {
  const meters = metersBetween(a, b) * 1.3;
  return Math.max(5, Math.round(meters / 300) + 4);
}

export interface Travel {
  mode: "walk" | "ride";
  minutes: number;
  label: string;
}

/** Distance always expressed as time — never as kilometres. */
export function travel(a: LatLng, b: LatLng): Travel {
  const walk = walkMinutes(a, b);
  if (walk <= WALK_LIMIT_MINUTES) {
    return { mode: "walk", minutes: walk, label: `${walk} min walk` };
  }
  const ride = rideMinutes(a, b);
  return { mode: "ride", minutes: ride, label: `${ride} min by taxi or transit` };
}

export function travelLabel(a: LatLng, b: LatLng): string {
  return travel(a, b).label;
}

/** Shortest walk from a point to any of the day's existing stops. */
export function nearestWalk(point: LatLng, others: LatLng[]): number | null {
  if (others.length === 0) return null;
  return Math.min(...others.map((o) => walkMinutes(point, o)));
}
