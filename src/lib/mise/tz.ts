import { lookupTimeZone } from "./places.functions";
import type { LatLng } from "./geo";

/**
 * Every opening-hours and slot-time comparison happens in the DESTINATION
 * city's time zone. Trip dates and slot times are already destination-local;
 * these helpers make sure nothing silently falls back to the browser clock.
 */

const KEY = "mise.tz.v1";

type Store = Record<string, string>;

function read(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full — the time zone will just be fetched again */
  }
}

const cacheKey = (city: string, at: LatLng) =>
  `${city.trim().toLowerCase()}|${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;

/** Google's time zone for the trip city. Cached — one lookup per city. */
export async function cityTimeZone(
  city: string,
  at: LatLng | null,
): Promise<string | null> {
  if (!at) return null;
  const store = read();
  const key = cacheKey(city, at);
  const hit = store[key];
  if (hit) return hit;
  try {
    const tz = await lookupTimeZone({ data: { lat: at.lat, lng: at.lng } });
    if (tz) {
      store[key] = tz;
      write(store);
    }
    return tz;
  } catch {
    return null;
  }
}

/** Weekday (0 = Sunday) of a plain yyyy-mm-dd, independent of any clock. */
export function weekdayOfDate(date: string): number | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

/** "Now" where the trip is, not where the browser is. */
export function nowInZone(
  timeZone: string | null | undefined,
): { date: string; minutes: number } {
  const now = new Date();
  if (!timeZone) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(hour) * 60 + Number(get("minute")),
  };
}

/** Is this block already behind us, in the destination's own clock? */
export function isPast(
  date: string,
  endTime: string,
  timeZone: string | null | undefined,
): boolean {
  const now = nowInZone(timeZone);
  if (date < now.date) return true;
  if (date > now.date) return false;
  const [h = 0, m = 0] = endTime.split(":").map(Number);
  return h * 60 + m <= now.minutes;
}
