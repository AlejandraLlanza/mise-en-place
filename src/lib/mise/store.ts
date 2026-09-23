import type { Trip } from "./types";

const KEY = "mise.trip.v1";

export function loadTrip(): Trip | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Trip;
    if (!parsed?.days || !parsed?.candidates) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTrip(trip: Trip | null) {
  if (typeof window === "undefined") return;
  try {
    if (trip) window.localStorage.setItem(KEY, JSON.stringify(trip));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* quota or private mode — itinerary still works in-memory */
  }
}
