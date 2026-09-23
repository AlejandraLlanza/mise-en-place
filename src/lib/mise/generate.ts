import { slotsForCity, type MealTimes } from "./city";
import { coordsOf, walkMinutes, type LatLng } from "./geo";
import { uid } from "./parse";
import { cohesionBonus, scoreCandidate } from "./score";
import { isClosedAt, isClosedOn } from "./hours";
import { interestScore, PACE_COUNT } from "./travel";
import type { Candidate, Day, MealType, Prefs, Slot } from "./types";

export function dateRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out;
  const d = new Date(start);
  let guard = 0;
  while (d <= end && guard < 30) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return out;
}

export function emptyDays(
  startDate: string,
  endDate: string,
  city = "",
  mealTimes?: Partial<MealTimes>,
): Day[] {
  const template = slotsForCity(city, mealTimes);
  return dateRange(startDate, endDate).map((date) => ({
    id: uid(),
    date,
    slots: template.map((t) => ({
      id: uid(),
      meal: t.meal,
      start: t.start,
      end: t.end,
      candidateId: null,
      locked: false,
    })),
  }));
}

function dayCenter(day: Day, byId: Map<string, Candidate>): string[] {
  const counts = new Map<string, number>();
  for (const s of day.slots) {
    const c = s.candidateId ? byId.get(s.candidateId) : null;
    if (c?.neighborhood) counts.set(c.neighborhood, (counts.get(c.neighborhood) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

export function dayCoords(day: Day, byId: Map<string, Candidate>): LatLng[] {
  const out: LatLng[] = [];
  for (const s of day.slots) {
    const c = s.candidateId ? byId.get(s.candidateId) : null;
    const p = coordsOf(c?.place);
    if (p) out.push(p);
  }
  return out;
}

export function dayLabel(day: Day, candidates: Candidate[]): string {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const center = dayCenter(day, byId).slice(0, 2);
  return center.join(" & ");
}

const FILL_ORDER: MealType[] = ["lunch", "dinner", "breakfast", "drinks"];

/** Hard limit between the meals of one day, in walking minutes. */
export const MAX_DAY_WALK_MINUTES = 25;

/** The point the day must orbit: a pinned/booked stop first, else any stop. */
export function dayAnchorPoint(
  day: Day,
  byId: Map<string, Candidate>,
): LatLng | null {
  for (const s of day.slots) {
    const c = s.candidateId ? byId.get(s.candidateId) : null;
    if (!c) continue;
    if (s.locked || c.isAnchor || c.booking === "Booked") {
      const p = coordsOf(c.place);
      if (p) return p;
    }
  }
  return null;
}

export function withinDayRadius(
  place: Candidate["place"],
  ref: LatLng | null,
): boolean {
  const here = coordsOf(place);
  if (!ref || !here) return true; // unknown coordinates can't be judged
  return walkMinutes(here, ref) <= MAX_DAY_WALK_MINUTES;
}

/** How many consecutive hops on this day are too far to walk. */
export function taxiHops(day: Day, candidates: Candidate[]): number {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const pts = dayCoords(day, byId);
  let hops = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a && b && walkMinutes(a, b) > MAX_DAY_WALK_MINUTES) hops++;
  }
  return hops;
}

export function generateDays(
  existingDays: Day[],
  candidates: Candidate[],
  prefs: Prefs,
  opts: { keepBooked?: boolean } = {},
): Day[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const days: Day[] = existingDays.map((d) => ({
    ...d,
    slots: d.slots.map((s) => ({ ...s })),
  }));

  const used = new Set<string>();

  // 1. Keep locked (anchor) and booked slots in place.
  for (const day of days) {
    for (const slot of day.slots) {
      const c = slot.candidateId ? byId.get(slot.candidateId) : null;
      const keep =
        c && (slot.locked || (opts.keepBooked && c.booking === "Booked"));
      if (keep && c) {
        used.add(c.id);
      } else {
        slot.candidateId = null;
        slot.locked = false;
      }
    }
  }

  // 2. Place anchors that are not yet placed.
  const anchors = candidates.filter((c) => c.isAnchor && c.include && !used.has(c.id));
  for (const anchor of anchors) {
    let placed = false;
    const preferredMeal = anchor.anchorMeal ?? anchor.meals[0] ?? "dinner";
    const tryPlace = (day: Day) => {
      const slot =
        day.slots.find((s) => s.meal === preferredMeal && !s.candidateId) ??
        day.slots.find((s) => !s.candidateId && s.meal !== "drinks");
      if (!slot) return false;
      slot.candidateId = anchor.id;
      slot.locked = true;
      if (anchor.anchorTime) slot.start = anchor.anchorTime;
      used.add(anchor.id);
      return true;
    };
    const anchorDayObj = anchor.anchorDay != null ? days[anchor.anchorDay] : undefined;
    if (anchorDayObj) {
      placed = tryPlace(anchorDayObj);
    }
    if (!placed) {
      for (const day of days) {
        if (tryPlace(day)) break;
      }
    }
  }

  // 3. Fill open slots — meal slots only ever take restaurants.
  const pool = candidates.filter(
    (c) => c.include && !c.isAnchor && (c.kind ?? "restaurant") === "restaurant",
  );

  for (const day of days) {
    for (const meal of FILL_ORDER) {
      const slot = day.slots.find((s) => s.meal === meal);
      if (!slot || slot.candidateId) continue;

      const center = dayCenter(day, byId);
      const coords = dayCoords(day, byId);
      const dayCuisines = new Set<string>();
      const dayTags = new Set<string>();
      let bigSpends = 0;
      for (const s of day.slots) {
        const c = s.candidateId ? byId.get(s.candidateId) : null;
        if (!c) continue;
        if (c.cuisine) dayCuisines.add(c.cuisine);
        c.tags.forEach((t) => dayTags.add(t));
        if (c.price >= 4) bigSpends++;
      }

      // Hard anchor for the day: a pinned/booked stop wins, otherwise whatever
      // is already placed. Everything else must sit close to it.
      const ref = dayAnchorPoint(day, byId) ?? coords[0] ?? null;

      const rank = (relaxed: boolean) =>
        pool
          .filter((c) => !used.has(c.id))
          .filter((c) => c.meals.includes(meal))
          // Hard: never place a place that is shut at this slot's time.
          .filter(
            (c) =>
              !isClosedOn(c.place, day.date) &&
              !isClosedAt(c.place, day.date, slot.start),
          )
          // Hard: stay inside the day's radius when we know both coordinates.
          .filter((c) => withinDayRadius(c.place, ref))
          .filter((c) => relaxed || !c.cuisine || !dayCuisines.has(c.cuisine))
          .filter((c) => relaxed || !c.tags.some((t) => dayTags.has(t)))
          .filter((c) => relaxed || !(c.price >= 4 && bigSpends >= 1))
          .map((c) => ({
            c,
            total:
              scoreCandidate(c, prefs, meal).score + cohesionBonus(c, center, coords),
          }))
          .sort((a, b) => b.total - a.total);

      let best = rank(false)[0];
      const optional = meal === "breakfast" || meal === "drinks";
      if (!best && !optional) best = rank(true)[0];
      if (!best) continue;
      if (optional && best.total < 55) continue;

      slot.candidateId = best.c.id;
      used.add(best.c.id);
    }
  }

  // 4. Things to do, as many per day as the pace asks for.
  return planActivities(days, candidates, prefs);
}

/** Spread the "things to do" pool across the days, paced and near the meals. */
export function planActivities(
  days: Day[],
  candidates: Candidate[],
  prefs: Prefs,
): Day[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const perDay = PACE_COUNT[prefs.travel?.pace ?? "balanced"];
  const pool = candidates.filter(
    (c) => c.include && c.kind === "activity" && !c.isAnchor,
  );
  const taken = new Set<string>();

  return days.map((day) => {
    const kept = (day.activityIds ?? []).filter((id) => {
      const c = byId.get(id);
      return c && c.include && c.kind === "activity" && !taken.has(id);
    });
    kept.forEach((id) => taken.add(id));

    const ref = dayAnchorPoint(day, byId) ?? dayCoords(day, byId)[0] ?? null;
    const ranked = pool
      .filter((c) => !taken.has(c.id))
      .filter((c) => !isClosedOn(c.place, day.date))
      .filter((c) => c.noPlace || withinDayRadius(c.place, ref))
      .map((c) => ({
        c,
        total:
          interestScore(prefs.travel, `${c.name} ${c.quote ?? ""} ${c.notes}`) +
          Math.min(20, ((c.mentions?.length ?? 1) - 1) * 10) +
          (c.place?.rating != null ? (c.place.rating - 4) * 10 : 0) +
          (c.noPlace ? -5 : 0),
      }))
      .sort((a, b) => b.total - a.total);

    const picks = [...kept];
    for (const r of ranked) {
      if (picks.length >= perDay) break;
      picks.push(r.c.id);
      taken.add(r.c.id);
    }
    return { ...day, activityIds: picks };
  });
}

export interface OpenBlock {
  afterSlotId: string;
  start: string;
  end: string;
  neighborhood: string;
}

export function openBlocks(day: Day, candidates: Candidate[]): OpenBlock[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const filled = day.slots.filter((s) => s.candidateId);
  const blocks: OpenBlock[] = [];
  for (let i = 0; i < filled.length - 1; i++) {
    const a = filled[i];
    const b = filled[i + 1];
    if (!a || !b) continue;
    const gap = toMinutes(b.start) - toMinutes(a.end);
    if (gap >= 75) {
      const c = byId.get(a.candidateId!);
      blocks.push({
        afterSlotId: a.id,
        start: a.end,
        end: b.start,
        neighborhood: c?.neighborhood || "wherever you land",
      });
    }
  }
  return blocks;
}

function toMinutes(t: string): number {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  let hour = h % 12;
  if (hour === 0) hour = 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatDay(date: string): { weekday: string; short: string } {
  const d = new Date(date + "T12:00:00");
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
    short: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}
