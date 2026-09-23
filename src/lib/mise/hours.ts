import type { PlaceData } from "./places.functions";
import { weekdayOfDate } from "./tz";

const WEEKDAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** Destination-local weekday — never derived from the browser clock. */
function weekdayOf(date: string): number | null {
  return weekdayOfDate(date);
}

const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};

/** True when Google's regular hours say the place is shut all day. */
export function isClosedOn(place: PlaceData | null | undefined, date: string): boolean {
  if (!place?.periods || place.periods.length === 0) return false;
  const day = weekdayOf(date);
  if (day == null) return false;
  return !place.periods.some((p) => p.openDay === day);
}

export function closedDayNote(
  place: PlaceData | null | undefined,
  date: string,
): string | null {
  if (!isClosedOn(place, date)) return null;
  const day = weekdayOf(date);
  return `${place?.name || "This place"} is closed ${WEEKDAYS[day ?? 0]}.`;
}

/** True when the place has hours and none of them cover the slot time. */
export function isClosedAt(
  place: PlaceData | null | undefined,
  date: string,
  time: string,
): boolean {
  if (!place?.periods || place.periods.length === 0) return false;
  const day = weekdayOf(date);
  if (day == null) return false;
  const t = toMin(time);
  return !place.periods.some((p) => {
    if (p.openDay !== day) return false;
    const open = toMin(p.openTime);
    if (!p.closeTime) return true;
    const close = toMin(p.closeTime);
    if (p.closeDay !== null && p.closeDay !== p.openDay) return t >= open; // runs past midnight
    return t >= open && t <= close;
  });
}

export function hoursNote(
  place: PlaceData | null | undefined,
  date: string,
): string | null {
  if (!place?.weekdayDescriptions) return null;
  const day = weekdayOf(date);
  if (day == null) return null;
  // Google lists Monday first.
  const idx = (day + 6) % 7;
  return place.weekdayDescriptions[idx] ?? null;
}

/**
 * Minute ranges the place is open on this date, in destination-local minutes
 * from midnight. Overnight periods are clipped at 24:00 for that day.
 */
export function openRangesOn(
  place: PlaceData | null | undefined,
  date: string,
): Array<[number, number]> {
  if (!place?.periods || place.periods.length === 0) return [];
  const day = weekdayOf(date);
  if (day == null) return [];
  const ranges: Array<[number, number]> = [];
  for (const p of place.periods) {
    if (p.openDay !== day) continue;
    const open = toMin(p.openTime);
    if (!p.closeTime) {
      ranges.push([open, 24 * 60]); // open around the clock
      continue;
    }
    const close = toMin(p.closeTime);
    const overnight = p.closeDay !== null && p.closeDay !== p.openDay;
    ranges.push([open, overnight || close < open ? 24 * 60 : close]);
  }
  return ranges;
}

/** How many minutes of this window the place is actually open for. */
export function overlapMinutes(
  place: PlaceData | null | undefined,
  date: string,
  start: string,
  end: string,
): number {
  const ranges = openRangesOn(place, date);
  if (ranges.length === 0) return 0;
  const s = toMin(start);
  const e = toMin(end);
  return ranges.reduce(
    (best, [a, b]) => Math.max(best, Math.min(e, b) - Math.max(s, a)),
    0,
  );
}

/** True when Google knows this place's hours. Unknown hours are not "closed". */
export function hasKnownHours(place: PlaceData | null | undefined): boolean {
  return !!place?.periods && place.periods.length > 0;
}
