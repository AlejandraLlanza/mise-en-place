import { useEffect, useMemo, useRef, useState } from "react";
import { suggestPlaces } from "@/lib/mise/suggest";
import { SourcesInbox } from "@/components/mise/SourcesInbox";
import { Triage } from "@/components/mise/Triage";
import { resolveCandidates } from "@/lib/mise/placeCache";
import {
  extractFromSource,
  mentionCount,
  mergeCandidates,
  mergeKey,
  type Source,
} from "@/lib/mise/sources";
import { MEAL_LABEL } from "@/lib/mise/data";
import {
  dayCoords,
  dayLabel,
  formatDay,
  formatTime,
  generateDays,
  openBlocks,
  taxiHops,
  withinDayRadius,
  dayAnchorPoint,
} from "@/lib/mise/generate";
import { coordsOf, travelLabel } from "@/lib/mise/geo";
import { BlockPlanner } from "@/components/mise/BlockPlanner";
import { radiusForDay } from "@/lib/mise/blocks";
import { cityTimeZone } from "@/lib/mise/tz";
import { closedDayNote, hoursNote, isClosedAt } from "@/lib/mise/hours";
import {
  mapsDirectionsUrl,
  mapsSearchUrl,
  neighborhoodOf,
  placeQuery,
} from "@/lib/mise/maps";
import { cohesionBonus, proximityNote, scoreCandidate } from "@/lib/mise/score";
import { WeatherPlanB } from "@/components/mise/WeatherPlanB";
import {
  dayLine,
  partsOfDay,

  isOutdoorPlace,
  tripSummary,
  usesFahrenheit,
  warnFor,
  weatherForTrip,
  wetWalk,
  type WeatherMap,
} from "@/lib/mise/weather";
import type { BookingStatus, Candidate, Trip } from "@/lib/mise/types";

const BOOKING_STATES: BookingStatus[] = ["Not booked", "Need to book", "Booked"];

/** Neighbourhood as Google knows it — never an empty "neighbourhood?" slug. */
function hoodOf(c: Candidate, city: string): string {
  return c.neighborhood || neighborhoodOf(c.place, city) || "district not listed";
}

/** "Senso-ji / 浅草寺" — the traveller's name, plus the local one when it differs. */
function displayName(c: Candidate): string {
  const google = c.place?.name?.trim();
  const local = c.place?.localName?.trim();
  // Only when Google's own name really differs in the local language.
  if (!local || !google || local === google) return c.name;
  if (local === c.name.trim()) return c.name;
  return `${c.name} / ${local}`;
}

interface SlotRef {
  dayId: string;
  slotId: string;
}

export function Itinerary({
  trip,
  setTrip,
  onStartOver,
}: {
  trip: Trip;
  setTrip: (t: Trip) => void;
  onStartOver: () => void;
}) {
  const [dragging, setDragging] = useState<SlotRef | null>(null);
  const [swapFor, setSwapFor] = useState<SlotRef | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState<Candidate[] | null>(null);
  const [resolved, setResolved] = useState<Candidate[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherMap>({});
  const [fahrenheit, setFahrenheit] = useState(false);
  const [planB, setPlanB] = useState<{
    dayId: string;
    candidateId: string;
    ctx: import("@/lib/mise/blocks").BlockContext;
    warning: string;
    radius: number;
  } | null>(null);
  const autoFetched = useRef<Set<string>>(new Set());
  const askedWeather = useRef<string>("");

  const byId = useMemo(
    () => new Map(trip.candidates.map((c) => [c.id, c])),
    [trip.candidates],
  );

  const placedIds = useMemo(() => {
    const s = new Set<string>();
    trip.days.forEach((d) =>
      d.slots.forEach((sl) => sl.candidateId && s.add(sl.candidateId)),
    );
    return s;
  }, [trip.days]);

  /** Things to do already spoken for, so no block repeats one. */
  const takenActivityIds = useMemo(() => {
    const s = new Set<string>();
    trip.days.forEach((d) => {
      (d.activityIds ?? []).forEach((id) => s.add(id));
      Object.values(d.blockPicks ?? {}).forEach((v) => v !== "free" && s.add(v));
    });
    return s;
  }, [trip.days]);

  /** The destination's own clock — every hours check is done in it. */
  useEffect(() => {
    const point =
      trip.candidates.map((c) => coordsOf(c.place)).find((p) => p) ?? null;
    if (!point) return;
    void cityTimeZone(trip.basics.city, point).then(setTimeZone);
  }, [trip.basics.city, trip.candidates]);

  /** The forecast for the trip city — fetched once, cached for six hours. */
  useEffect(() => {
    const point =
      trip.candidates.map((c) => coordsOf(c.place)).find((p) => p) ?? null;
    if (!point) return;
    const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}|${timeZone ?? ""}`;
    if (askedWeather.current === key) return;
    askedWeather.current = key;
    setFahrenheit(usesFahrenheit(trip.candidates.map((c) => c.place)));
    void weatherForTrip(
      point,
      trip.days.map((d) => d.date),
      timeZone,
    ).then(setWeather);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.candidates, trip.days, timeZone]);

  const updateCandidate = (id: string, patch: Partial<Candidate>) =>
    setTrip({
      ...trip,
      candidates: trip.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });

  const setSlotCandidate = (ref: SlotRef, candidateId: string | null) =>
    setTrip({
      ...trip,
      days: trip.days.map((d) =>
        d.id !== ref.dayId
          ? d
          : {
              ...d,
              slots: d.slots.map((s) =>
                s.id === ref.slotId ? { ...s, candidateId } : s,
              ),
            },
      ),
    });

  const swapSlots = (a: SlotRef, b: SlotRef) => {
    const findSlot = (r: SlotRef) =>
      trip.days.find((d) => d.id === r.dayId)?.slots.find((s) => s.id === r.slotId);
    const sa = findSlot(a);
    const sb = findSlot(b);
    if (!sa || !sb || sa.locked || sb.locked) return;
    const days = trip.days.map((d) => ({
      ...d,
      slots: d.slots.map((s) => {
        if (s.id === sa.id) return { ...s, candidateId: sb.candidateId };
        if (s.id === sb.id) return { ...s, candidateId: sa.candidateId };
        return s;
      }),
    }));
    setTrip({ ...trip, days });
  };

  /** Take a thing to do off one day — the pool keeps it for another. */
  const dropActivity = (dayId: string, id: string) =>
    setTrip({
      ...trip,
      days: trip.days.map((d) =>
        d.id === dayId
          ? { ...d, activityIds: (d.activityIds ?? []).filter((x) => x !== id) }
          : d,
      ),
    });

  /** What the user decided for one open block. */
  const setBlockPick = (dayId: string, blockId: string, value: string | null) =>
    setTrip({
      ...trip,
      days: trip.days.map((d) => {
        if (d.id !== dayId) return d;
        const picks = { ...(d.blockPicks ?? {}) };
        if (value === null) delete picks[blockId];
        else picks[blockId] = value;
        return { ...d, blockPicks: picks };
      }),
    });

  /** Accept a suggestion into a block — keeping it in the candidate pool. */
  const acceptBlock = (dayId: string, blockId: string, c: Candidate) => {
    const known = trip.candidates.some((x) => x.id === c.id);
    setTrip({
      ...trip,
      candidates: known ? trip.candidates : [...trip.candidates, c],
      days: trip.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          activityIds: (d.activityIds ?? []).filter((x) => x !== c.id),
          blockPicks: { ...(d.blockPicks ?? {}), [blockId]: c.id },
        };
      }),
    });
  };

  const regenerate = () =>
    setTrip({
      ...trip,
      days: generateDays(trip.days, trip.candidates, trip.prefs, { keepBooked: true }),
    });

  const removeFromTrip = (candidateId: string) => {
    setTrip({
      ...trip,
      days: trip.days.map((d) => ({
        ...d,
        slots: d.slots.map((s) =>
          s.candidateId === candidateId ? { ...s, candidateId: null, locked: false } : s,
        ),
      })),
    });
    setDetailFor(null);
  };

  const stillToBook = trip.days.flatMap((d) =>
    d.slots
      .filter((s) => s.candidateId && byId.get(s.candidateId)?.booking !== "Booked")
      .map((s) => ({ day: d, slot: s, candidate: byId.get(s.candidateId!)! })),
  );

  const swapSlotObj = swapFor
    ? trip.days
        .find((d) => d.id === swapFor.dayId)
        ?.slots.find((s) => s.id === swapFor.slotId)
    : null;
  const swapDay = swapFor ? trip.days.find((d) => d.id === swapFor.dayId) : null;

  const alternatives = useMemo(() => {
    if (!swapSlotObj || !swapDay) return [];
    const center = swapDay.slots
      .map((s) => (s.candidateId ? byId.get(s.candidateId)?.neighborhood : null))
      .filter((n): n is string => !!n);
    const coords = dayCoords(swapDay, byId);
    const ref = dayAnchorPoint(swapDay, byId) ?? coords[0] ?? null;
    return trip.candidates
      .filter((c) => c.include && !c.isAnchor && !placedIds.has(c.id))
      .filter((c) => (c.kind ?? "restaurant") !== "activity")
      .filter((c) => c.meals.includes(swapSlotObj.meal))
      .map((c) => {
        const s = scoreCandidate(c, trip.prefs, swapSlotObj.meal);
        const shut =
          isClosedAt(c.place, swapDay.date, swapSlotObj.start) ||
          !!closedDayNote(c.place, swapDay.date);
        const far = !withinDayRadius(c.place, ref);
        return {
          c,
          s,
          total: s.score + cohesionBonus(c, center, coords),
          center,
          coords,
          closed: shut
            ? `Closed at ${formatTime(swapSlotObj.start)} on this day`
            : null,
          far,
        };
      })
      // Open, close-by places first; shut ones sink but stay visible, labelled.
      .sort(
        (a, b) =>
          Number(!!a.closed) - Number(!!b.closed) ||
          Number(a.far) - Number(b.far) ||
          b.total - a.total,
      )
      .slice(0, 6);
  }, [swapSlotObj, swapDay, trip.candidates, trip.prefs, placedIds, byId]);

  const existingKeys = () => ({
    existingPlaceIds: new Set(
      trip.candidates.map((c) => c.place?.id).filter((i): i is string => !!i),
    ),
    existingNames: new Set(trip.candidates.map((c) => c.name)),
  });

  /** Ask Google for places matching the vibe chips, for one meal slot. */
  const suggestForSlot = async (ref: SlotRef, silent = false) => {
    const day = trip.days.find((d) => d.id === ref.dayId);
    const slot = day?.slots.find((s) => s.id === ref.slotId);
    if (!day || !slot) return;
    const neighborhood = dayLabel(day, trip.candidates).split(" & ")[0] ?? "";
    setSuggesting(true);
    if (!silent) setSuggestNote(null);
    try {
      const found = await suggestPlaces({
        city: trip.basics.city,
        prefs: trip.prefs,
        meal: slot.meal,
        neighborhood,
        ...existingKeys(),
      });
      if (found.length)
        setTrip({ ...trip, candidates: [...trip.candidates, ...found] });
      else if (!silent) setSuggestNote("Google didn't return anything new for this slot.");
    } catch {
      if (!silent) setSuggestNote("Couldn't reach Google just now. Try again in a moment.");
    } finally {
      setSuggesting(false);
    }
  };

  // When a slot has few options of the traveller's own, quietly top it up.
  useEffect(() => {
    if (!swapFor || !swapSlotObj) return;
    const key = `${swapFor.dayId}:${swapFor.slotId}`;
    if (autoFetched.current.has(key) || alternatives.length >= 3) return;
    autoFetched.current.add(key);
    void suggestForSlot(swapFor, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapFor, swapSlotObj, alternatives.length]);

  /** Fill every empty slot in the trip with vibe-matched Google finds. */
  const suggestForTrip = async () => {
    const meals = new Set(
      trip.days.flatMap((d) =>
        d.slots.filter((s) => !s.candidateId).map((s) => s.meal),
      ),
    );
    if (meals.size === 0) {
      setSuggestNote("No empty slots — swap a meal to see more suggestions.");
      return;
    }
    setSuggesting(true);
    setSuggestNote(null);
    const keys = existingKeys();
    const found: Candidate[] = [];
    for (const meal of meals) {
      try {
        const hits = await suggestPlaces({
          city: trip.basics.city,
          prefs: trip.prefs,
          meal,
          ...keys,
        });
        hits.forEach((h) => {
          keys.existingNames.add(h.name);
          if (h.place) keys.existingPlaceIds.add(h.place.id);
        });
        found.push(...hits);
      } catch {
        /* one meal failing shouldn't stop the rest */
      }
    }
    const candidates = [...trip.candidates, ...found];
    setTrip({
      ...trip,
      candidates,
      days: generateDays(trip.days, candidates, trip.prefs, { keepBooked: true }),
    });
    setSuggesting(false);
    setSuggestNote(
      found.length ? `Added ${found.length} places that match your vibe.` : null,
    );
  };

  const setSources = (updater: (s: Source[]) => Source[]) =>
    setTrip({ ...trip, sources: updater(trip.sources ?? []) });

  /** Re-read the whole inbox, resolve places, then triage what's new. */
  const readSources = async () => {
    setReading(true);
    try {
      const raw = (trip.sources ?? []).flatMap((src) =>
        extractFromSource(src, trip.basics.city),
      );
      const found = mergeCandidates(await resolveCandidates(mergeCandidates(raw), trip.basics.city));
      setResolved(found);
      const known = new Set(trip.candidates.map(mergeKey));
      const fresh = found.filter((c) => !known.has(mergeKey(c)));
      setPending(fresh);
      if (fresh.length === 0) commitSources(found, []);
    } finally {
      setReading(false);
    }
  };

  const commitSources = (all: Candidate[], kept: Candidate[]) => {
    const known = new Set(trip.candidates.map(mergeKey));
    const extraMentions = all.filter((c) => known.has(mergeKey(c)));
    const candidates = mergeCandidates([...trip.candidates, ...extraMentions, ...kept]);
    setTrip({
      ...trip,
      candidates,
      days: generateDays(trip.days, candidates, trip.prefs, { keepBooked: true }),
    });
    setPending(null);
    setResolved([]);
    setSourcesOpen(false);
  };

  const detail = detailFor ? byId.get(detailFor) : null;

  const weatherLine = tripSummary(
    trip.days.map((d) => ({ date: d.date, weekday: formatDay(d.date).weekday })),
    weather,
    fahrenheit,
  );

  /** Things to do have no clock of their own — use the day's own daylight gap. */
  const activityWindow = (day: (typeof trip.days)[number]) => {
    const lunch = day.slots.find((s) => s.meal === "lunch");
    const dinner = day.slots.find((s) => s.meal === "dinner");
    return {
      start: lunch?.end ?? "11:00",
      end: dinner?.start ?? "18:00",
    };
  };

  /** Swap a rained-off thing to do for an indoor one, same day. */
  const swapActivity = (dayId: string, oldId: string, c: Candidate) => {
    const known = trip.candidates.some((x) => x.id === c.id);
    setTrip({
      ...trip,
      candidates: known ? trip.candidates : [...trip.candidates, c],
      days: trip.days.map((d) =>
        d.id !== dayId
          ? d
          : {
              ...d,
              activityIds: (d.activityIds ?? []).map((x) => (x === oldId ? c.id : x)),
            },
      ),
    });
    setPlanB(null);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-x-6 gap-y-3 px-5 py-6">
          <div>
            <p className="label-caps text-primary">Mise</p>
            <h1 className="text-3xl leading-tight">{trip.basics.city}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDay(trip.days[0]?.date ?? "").short} –{" "}
              {formatDay(trip.days[trip.days.length - 1]?.date ?? "").short} ·{" "}
              {trip.days.length} days · party of {trip.basics.partySize}
            </p>
            {Object.keys(weather).length > 0 && (
              <p className="mt-1 text-sm text-olive">
                {weatherLine} ·{" "}
                <button
                  className="underline hover:text-primary"
                  onClick={() => setFahrenheit(!fahrenheit)}
                >
                  {fahrenheit ? "show °C" : "show °F"}
                </button>
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {suggestNote && (
              <span className="text-xs text-muted-foreground">{suggestNote}</span>
            )}
            <button
              className={ghostBtn}
              disabled={suggesting}
              onClick={() => void suggestForTrip()}
            >
              {suggesting ? "Finding places…" : "Suggest places for empty slots"}
            </button>
            <button className={ghostBtn} onClick={() => setSourcesOpen(true)}>
              Sources ({(trip.sources ?? []).length})
            </button>
            <button className={ghostBtn} onClick={regenerate}>
              Regenerate open slots
            </button>
            <button className={ghostBtn} onClick={onStartOver}>
              Start over
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-8 lg:grid-cols-[1fr_18rem]">
        <main className="space-y-12">
          {trip.days.map((day) => {
            const label = dayLabel(day, trip.candidates);
            const blocks = openBlocks(day, trip.candidates);
            const { weekday, short } = formatDay(day.date);
                const hops = taxiHops(day, trip.candidates);
                const radius = radiusForDay(day, byId);
                const wx = weather[day.date];
                const actWindow = activityWindow(day);
            return (
              <section key={day.id}>
                <div className="rule-line flex flex-wrap items-baseline gap-x-3 pt-3">
                  <h2 className="text-2xl">{weekday}</h2>
                  {label && (
                    <span className="label-caps text-primary">· {label}</span>
                  )}
                  <span className="ml-auto label-caps text-muted-foreground">
                    {short}
                  </span>
                </div>
                {wx &&
                  (() => {
                    const parts = partsOfDay(wx, fahrenheit);
                    if (!parts) {
                      return (
                        <p className="mt-1 text-xs text-olive">{dayLine(wx, fahrenheit)}</p>
                      );
                    }
                    return (
                      <div className="mt-1 space-y-0.5 text-xs text-olive sm:flex sm:flex-wrap sm:gap-x-6 sm:space-y-0">
                        {parts.map((p) => (
                          <p key={p.label}>
                            <span className="label-caps text-muted-foreground">{p.label}</span>{" "}
                            {p.text}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                {hops > 1 && (
                  <p className="mt-2 text-xs text-destructive">
                    This day crosses the city {hops} times — swap a meal for
                    something closer to the rest of the day.
                  </p>
                )}


                <div className="mt-4 space-y-3">
                  {day.slots.map((slot, si) => {
                    const c = slot.candidateId ? byId.get(slot.candidateId) : null;
                    const block = blocks.find((b) => b.afterSlotId === slot.id);
                    const nextSlot = day.slots
                      .slice(si + 1)
                      .find((s) => s.candidateId);
                    const nextC = nextSlot?.candidateId
                      ? byId.get(nextSlot.candidateId)
                      : null;
                    return (
                      <div key={slot.id} className="space-y-3">
                        <div
                          onDragOver={(e) => {
                            if (dragging && !slot.locked) e.preventDefault();
                          }}
                          onDrop={() => {
                            if (dragging) swapSlots(dragging, { dayId: day.id, slotId: slot.id });
                            setDragging(null);
                          }}
                          className="grid grid-cols-[5.5rem_1fr] gap-3 sm:grid-cols-[7rem_1fr] sm:gap-5"
                        >
                          <div className="pt-3">
                            <p className="label-caps text-muted-foreground">
                              {MEAL_LABEL[slot.meal]}
                            </p>
                            <p className="mt-0.5 text-sm text-foreground">
                              {formatTime(slot.start)}
                            </p>
                          </div>

                          {c ? (
                            <article
                              draggable={!slot.locked}
                              onDragStart={() =>
                                setDragging({ dayId: day.id, slotId: slot.id })
                              }
                              onDragEnd={() => setDragging(null)}
                              className={`relative overflow-hidden rounded-md p-4 transition-shadow ${
                                slot.locked || c.isAnchor
                                  ? "border-2 border-foreground bg-paper"
                                  : "printed cursor-grab hover:shadow-md"
                              }`}
                            >
                              {(slot.locked || c.isAnchor) && (
                                <span
                                  aria-hidden
                                  className="absolute right-0 top-0 h-6 w-6 bg-primary [clip-path:polygon(100%_0,0_0,100%_100%)]"
                                />
                              )}
                              <div className="flex flex-wrap items-start gap-x-3 gap-y-1 pr-7">
                                <button
                                  className="text-left font-display text-xl leading-snug hover:text-primary"
                                  onClick={() => setDetailFor(c.id)}
                                >
                                  {displayName(c)}
                                </button>
                                <span className="mt-1.5 label-caps text-muted-foreground">
                                  {hoodOf(c, trip.basics.city)} ·{" "}
                                  {"$".repeat(c.price)}
                                </span>
                                <span className="ml-auto">
                                  <BookingPill status={c.booking} />
                                </span>
                              </div>

                              {(slot.locked || c.isAnchor || c.address) && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {c.address || "Address not saved yet"} ·{" "}
                                  <a
                                    className="underline hover:text-primary"
                                    href={
                                      c.place?.googleMapsUri ??
                                      mapsSearchUrl(
                                        placeQuery(c.name, c.address, trip.basics.city),
                                      )
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View map
                                  </a>
                                </p>
                              )}

                              {c.place?.rating != null && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {c.place.rating.toFixed(1)} on Google ·{" "}
                                  {c.place.userRatingCount ?? 0} reviews
                                  {hoursNote(c.place, day.date)
                                    ? ` · ${hoursNote(c.place, day.date)}`
                                    : ""}
                                </p>
                              )}

                              {closedDayNote(c.place, day.date) && (
                                <p className="mt-2 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive">
                                  {closedDayNote(c.place, day.date)}
                                </p>
                              )}

                              {(() => {
                                const w = warnFor({
                                  day: wx,
                                  start: slot.start,
                                  end: slot.end,
                                  outdoor: isOutdoorPlace(c.place, c.name),
                                  name: c.name,
                                });
                                return w ? (
                                  <p className="mt-2 rounded border border-olive/40 px-2 py-1 text-xs text-olive">
                                    {w.text}
                                  </p>
                                ) : null;
                              })()}




                              {mentionCount(c) > 1 && (
                                <p className="mt-2 inline-block rounded-full bg-primary px-2.5 py-0.5 text-[11px] text-primary-foreground">
                                  {mentionCount(c)} people recommended this
                                </p>
                              )}

                              {c.tags.length > 0 && (
                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                  {c.tags.slice(0, 3).map((t) => (
                                    <span
                                      key={t}
                                      className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <span>
                                  {slot.locked || c.isAnchor
                                    ? `Confirmed${c.bookedVia ? ` · booked via ${c.bookedVia}` : ""}${
                                        c.anchorPartySize
                                          ? ` · table for ${c.anchorPartySize}`
                                          : ""
                                      }`
                                    : `via ${c.via || c.source}`}
                                </span>
                                {!slot.locked && (
                                  <button
                                    className="underline hover:text-primary"
                                    onClick={() =>
                                      setSwapFor({ dayId: day.id, slotId: slot.id })
                                    }
                                  >
                                    Swap
                                  </button>
                                )}
                                <button
                                  className="underline hover:text-primary"
                                  onClick={() => setDetailFor(c.id)}
                                >
                                  Details
                                </button>
                              </div>
                            </article>
                          ) : (
                            <button
                              onClick={() =>
                                setSwapFor({ dayId: day.id, slotId: slot.id })
                              }
                              className="rounded-md border border-dashed border-rule px-4 py-3 text-left text-sm text-muted-foreground hover:border-primary hover:text-primary"
                            >
                              Empty {slot.meal} slot — pick something
                            </button>
                          )}
                        </div>

                        {(block || (c && nextC)) && (
                          <div className="grid grid-cols-[5.5rem_1fr] gap-3 sm:grid-cols-[7rem_1fr] sm:gap-5">
                            <div />
                            <div className="space-y-2">
                              {block &&
                                (() => {
                                  const w = warnFor({
                                    day: wx,
                                    start: block.start,
                                    end: block.end,
                                    outdoor: true,
                                    name: "this gap",
                                  });
                                  return w ? (
                                    <p className="text-xs text-olive">
                                      {w.text.replace("this gap is open-air.", "")} Keep
                                      this gap indoors.
                                    </p>
                                  ) : null;
                                })()}
                              {block && (
                                <BlockPlanner
                                  key={`${day.id}-${block.afterSlotId}`}
                                  ctx={{
                                    date: day.date,
                                    start: block.start,
                                    end: block.end,
                                    from: coordsOf(c?.place),
                                    fromName: c?.name ?? "",
                                    city: trip.basics.city,
                                    prefs: trip.prefs,
                                  }}
                                  pool={trip.candidates}
                                  radius={radius}
                                  taken={takenActivityIds}
                                  timeZone={timeZone}
                                  pick={day.blockPicks?.[block.afterSlotId]}
                                  onAccept={(picked) =>
                                    acceptBlock(day.id, block.afterSlotId, picked)
                                  }
                                  onFree={() =>
                                    setBlockPick(day.id, block.afterSlotId, "free")
                                  }
                                  onClear={() =>
                                    setBlockPick(day.id, block.afterSlotId, null)
                                  }
                                />
                              )}
                               {c && nextC && (
                                 <p className="text-xs text-muted-foreground">
                                   Then on to {nextC.name}
                                   {(() => {
                                     const a = coordsOf(c.place);
                                     const b = coordsOf(nextC.place);
                                     if (!a || !b) return "";
                                     const label = travelLabel(a, b);
                                     return wetWalk(wx, nextSlot?.start ?? slot.end) &&
                                       /walk/i.test(label)
                                       ? ` · ${label}, but rain is likely — a taxi may be kinder`
                                       : ` · ${label}`;
                                   })()}{" "}
                                   ·{" "}

                                  <a
                                    className="underline hover:text-primary"
                                    href={mapsDirectionsUrl(
                                      placeQuery(c.name, c.address, trip.basics.city),
                                      placeQuery(
                                        nextC.name,
                                        nextC.address,
                                        trip.basics.city,
                                      ),
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Directions
                                  </a>
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const acts = (day.activityIds ?? [])
                    .map((id) => byId.get(id))
                    .filter((c): c is Candidate => Boolean(c) && c!.include);
                  if (acts.length === 0) return null;
                  return (
                    <div className="mt-5 grid grid-cols-[5.5rem_1fr] gap-3 sm:grid-cols-[7rem_1fr] sm:gap-5">
                      <p className="label-caps pt-3 text-muted-foreground">
                        Things to do
                      </p>
                      <ul className="space-y-2">
                        {acts.map((a) => (
                          <li
                            key={a.id}
                            className="rounded-md border border-border bg-paper px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                              <button
                                className="text-left font-display text-lg leading-snug hover:text-primary"
                                onClick={() => setDetailFor(a.id)}
                              >
                                {displayName(a)}
                              </button>
                              <span className="mt-1 label-caps text-muted-foreground">
                                {a.noPlace
                                  ? "a note, not a pin"
                                  : hoodOf(a, trip.basics.city)}
                              </span>
                              <button
                                className="ml-auto mt-1 text-xs text-muted-foreground underline hover:text-primary"
                                onClick={() => dropActivity(day.id, a.id)}
                              >
                                not this day
                              </button>
                            </div>
                            {a.place?.rating != null && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {a.place.rating.toFixed(1)} on Google ·{" "}
                                {a.place.userRatingCount ?? 0} reviews
                                {closedDayNote(a.place, day.date)
                                  ? ` · ${closedDayNote(a.place, day.date)}`
                                  : ""}
                              </p>
                            )}
                            {!a.noPlace && (
                              <p className="mt-1 text-xs">
                                <a
                                  className="underline hover:text-primary"
                                  href={
                                    a.place?.googleMapsUri ??
                                    mapsSearchUrl(
                                      placeQuery(a.name, a.address, trip.basics.city),
                                    )
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View map
                                </a>
                              </p>
                            )}
                            {(() => {
                              const w = warnFor({
                                day: wx,
                                start: actWindow.start,
                                end: actWindow.end,
                                outdoor: isOutdoorPlace(a.place, a.name) || !!a.noPlace,
                                name: a.name,
                              });
                              if (!w) return null;
                              return (
                                <p className="mt-2 rounded border border-olive/40 px-2 py-1 text-xs text-olive">
                                  {w.text}
                                  {w.planB && (
                                    <button
                                      className="ml-2 underline hover:text-primary"
                                      onClick={() =>
                                        setPlanB({
                                          dayId: day.id,
                                          candidateId: a.id,
                                          warning: w.text,
                                          radius,
                                          ctx: {
                                            date: day.date,
                                            start: actWindow.start,
                                            end: actWindow.end,
                                            from:
                                              coordsOf(a.place) ??
                                              dayCoords(day, byId)[0] ??
                                              null,
                                            fromName: a.name,
                                            city: trip.basics.city,
                                            prefs: trip.prefs,
                                          },
                                        })
                                      }
                                    >
                                      Show me a plan B
                                    </button>
                                  )}
                                </p>
                              );
                            })()}
                            {a.quote && (
                              <p className="mt-2 border-l-2 border-primary pl-2 text-xs italic text-muted-foreground">
                                {a.quote}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </section>
            );
          })}
        </main>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="printed rounded-md p-5">
            <h3 className="text-lg">Still to book</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {stillToBook.length} places to chase, in trip order.
            </p>
            <ul className="mt-4 space-y-3">
              {stillToBook.map(({ day, slot, candidate }) => (
                <li key={slot.id} className="border-t border-border pt-3">
                  <button
                    className="text-left font-display text-base hover:text-primary"
                    onClick={() => setDetailFor(candidate.id)}
                  >
                    {candidate.name}
                  </button>
                  <p className="label-caps mt-1 text-muted-foreground">
                    {formatDay(day.date).weekday.slice(0, 3)} ·{" "}
                    {MEAL_LABEL[slot.meal]} · {formatTime(slot.start)}
                  </p>
                  <div className="mt-1.5">
                    <BookingPill status={candidate.booking} />
                  </div>
                </li>
              ))}
              {stillToBook.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Everything's booked. Enjoy.
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      {swapFor && swapSlotObj && (
        <Overlay onClose={() => setSwapFor(null)}>
          <h3 className="text-2xl">
            Alternatives for {MEAL_LABEL[swapSlotObj.meal].toLowerCase()}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked for this slot on this day — your own list first, then places
            Google found for your vibe.
          </p>
          <button
            className="mt-3 rounded-full border border-rule px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
            disabled={suggesting}
            onClick={() => void suggestForSlot(swapFor)}
          >
            {suggesting ? "Finding places…" : "Suggest more like my vibe"}
          </button>
          {suggestNote && (
            <p className="mt-2 text-xs text-muted-foreground">{suggestNote}</p>
          )}
          <ul className="mt-5 space-y-3">
            {alternatives.map(({ c, s, total, center, coords, closed, far }) => (
              <li key={c.id}>
                <button
                  className="w-full rounded-md border border-border p-4 text-left hover:border-primary"
                  onClick={() => {
                    setSlotCandidate(swapFor, c.id);
                    setSwapFor(null);
                  }}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-lg">{displayName(c)}</span>
                    <span className="label-caps text-muted-foreground">
                      {hoodOf(c, trip.basics.city)} · {"$".repeat(c.price)}
                    </span>
                    <span className="ml-auto label-caps text-primary">{total}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {s.matched.length ? `matches: ${s.matched.join(", ")}` : "no vibe match"}{" "}
                    · {proximityNote(c, center, coords)}
                    {c.place?.rating != null
                      ? ` · ${c.place.rating.toFixed(1)} on Google (${c.place.userRatingCount ?? 0})`
                      : ""}{" "}
                    · via {c.via || c.source}
                  </p>
                  {closed && (
                    <p className="mt-1 text-xs text-destructive">{closed}</p>
                  )}
                  {!closed && far && (
                    <p className="mt-1 text-xs text-destructive">
                      Far from the rest of this day — you'd need a taxi.
                    </p>
                  )}
                </button>
              </li>
            ))}
            {alternatives.length === 0 && (
              <li className="text-sm text-muted-foreground">
                {suggesting
                  ? "Looking for places that match your vibe…"
                  : "Nothing left from your own list. Try “Suggest more like my vibe”."}
              </li>
            )}
          </ul>
          {swapSlotObj.candidateId && (
            <button
              className="mt-5 text-sm underline"
              onClick={() => {
                setSlotCandidate(swapFor, null);
                setSwapFor(null);
              }}
            >
              Leave this slot empty
            </button>
          )}
        </Overlay>
      )}

      {sourcesOpen && (
        <Overlay onClose={() => setSourcesOpen(false)}>
          {pending ? (
            <Triage
              candidates={pending}
              onDone={(decided) =>
                commitSources(resolved, decided.filter((c) => c.include))
              }
              onSkip={() => commitSources(resolved, pending)}
            />
          ) : (
            <>
              <h3 className="text-2xl">Sources</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a source any time. Reading it again re-fills the open slots and
                keeps your confirmed and booked meals where they are.
              </p>
              <div className="mt-5">
                <SourcesInbox sources={trip.sources ?? []} setSources={setSources} compact />
              </div>
              <button
                className="mt-5 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-40"
                disabled={reading || (trip.sources ?? []).length === 0}
                onClick={() => void readSources()}
              >
                {reading ? "Reading…" : "Read sources & refill open slots"}
              </button>
            </>
          )}
        </Overlay>
      )}

      {detail && (
        <Overlay onClose={() => setDetailFor(null)}>
          <p className="label-caps text-primary">
            {hoodOf(detail, trip.basics.city)} · {"$".repeat(detail.price)}
          </p>
          <h3 className="mt-1 text-3xl">{displayName(detail)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            via {detail.via || detail.source} · {detail.source}
          </p>

          {detail.place ? (
            <div className="mt-4 space-y-1 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p>{detail.place.address}</p>
              <p>
                {detail.place.rating != null
                  ? `${detail.place.rating.toFixed(1)} on Google · ${detail.place.userRatingCount ?? 0} reviews`
                  : "No Google rating"}
              </p>
              {detail.place.weekdayDescriptions && (
                <ul className="mt-1 space-y-0.5">
                  {detail.place.weekdayDescriptions.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
              <p className="flex flex-wrap gap-3 pt-1">
                {detail.place.googleMapsUri && (
                  <a
                    className="underline hover:text-primary"
                    href={detail.place.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Google Maps
                  </a>
                )}
                {detail.place.websiteUri && (
                  <a
                    className="underline hover:text-primary"
                    href={detail.place.websiteUri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </a>
                )}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Manual entry — not matched to a place on Google Maps.
            </p>
          )}


          {(detail.mentions?.length ?? 0) > 0 && (
            <div className="mt-5 space-y-2">
              <p className="label-caps text-muted-foreground">
                {mentionCount(detail) > 1
                  ? `${mentionCount(detail)} people recommended this`
                  : "What they said"}
              </p>
              {detail.mentions!.map((m, i) => (
                <blockquote
                  key={`${m.sourceId}-${i}`}
                  className="border-l-2 border-primary pl-3 text-sm italic"
                >
                  {m.via ? `${m.via}: ` : ""}
                  {m.quote}
                </blockquote>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-1.5">
            <p className="label-caps text-muted-foreground">Booking status</p>
            <div className="flex flex-wrap gap-2">
              {BOOKING_STATES.map((b) => (
                <button
                  key={b}
                  onClick={() => updateCandidate(detail.id, { booking: b })}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    detail.booking === b
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            <p className="label-caps text-muted-foreground">Confirmation number</p>
            <input
              className="w-full rounded border border-input bg-paper px-3 py-2 text-sm"
              value={detail.confirmation}
              onChange={(e) =>
                updateCandidate(detail.id, { confirmation: e.target.value })
              }
              placeholder="—"
            />
          </div>

          <div className="mt-5 space-y-1.5">
            <p className="label-caps text-muted-foreground">Notes</p>
            <textarea
              className="min-h-24 w-full rounded border border-input bg-paper px-3 py-2 text-sm"
              value={detail.notes}
              onChange={(e) => updateCandidate(detail.id, { notes: e.target.value })}
            />
          </div>

          <button
            className="mt-6 text-sm text-destructive underline"
            onClick={() => removeFromTrip(detail.id)}
          >
            Remove from trip
          </button>
        </Overlay>
      )}

      {planB && (
        <Overlay onClose={() => setPlanB(null)}>
          <WeatherPlanB
            ctx={planB.ctx}
            pool={trip.candidates}
            radius={planB.radius}
            taken={takenActivityIds}
            warning={planB.warning}
            replacing={byId.get(planB.candidateId)?.name ?? "this stop"}
            onPick={(c) => swapActivity(planB.dayId, planB.candidateId, c)}
          />
        </Overlay>
      )}
    </div>
  );
}

function BookingPill({ status }: { status: BookingStatus }) {
  const cls =
    status === "Booked"
      ? "border-olive text-olive"
      : status === "Need to book"
        ? "border-primary text-primary"
        : "border-border text-muted-foreground";
  return (
    <span className={`label-caps rounded-full border px-2.5 py-1 ${cls}`}>{status}</span>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/25" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-paper p-6 shadow-xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="label-caps mb-5 text-muted-foreground" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    </div>
  );
}

const ghostBtn =
  "rounded-full border border-rule px-4 py-2 text-sm hover:border-primary hover:text-primary";
