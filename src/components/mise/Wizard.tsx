import { useEffect, useRef, useState } from "react";
import {
  AnchorStep,
  blankAnchor,
  rowMeal,
  rowNeighborhood,
  type AnchorRow,
} from "@/components/mise/AnchorStep";
import { PlaceMatchCell } from "@/components/mise/PlaceMatchCell";
import { SourcesInbox } from "@/components/mise/SourcesInbox";
import { Triage } from "@/components/mise/Triage";
import { TravellerProfile } from "@/components/mise/TravellerProfile";
import { blankTravel, type TravelProfile } from "@/lib/mise/travel";
import type { DemoKind } from "@/lib/mise/demo";
import {
  extractFromSource,
  mergeCandidates,
  type Source,
} from "@/lib/mise/sources";
import { resolveCandidates } from "@/lib/mise/placeCache";
import { PlaceSearchInput } from "@/components/mise/PlaceSearchInput";
import { chipsFromText, deriveTaste, describeTaste } from "@/lib/mise/taste";
import { CHIPS } from "@/lib/mise/data";
import {
  clockSentence,
  defaultMealTimes,
  slotsForCity,
  type MealTimes,
} from "@/lib/mise/city";
import { MEAL_LABEL } from "@/lib/mise/data";
import { dateRange, emptyDays, generateDays } from "@/lib/mise/generate";
import { lookupPlaces } from "@/lib/mise/placeCache";
import { neighborhoodOf } from "@/lib/mise/maps";
import type { PlaceData } from "@/lib/mise/places.functions";
import { parseBlob, uid } from "@/lib/mise/parse";
import type {
  Candidate,
  MealType,
  Party,
  Prefs,
  SourceType,
  Trip,
  TripBasics,
} from "@/lib/mise/types";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "drinks"];
const PARTIES: Party[] = ["solo", "partner", "friends group", "family"];

function iso(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function toMin(t: string): number {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

function addMin(t: string, minutes: number): string {
  const total = (toMin(t) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const STEPS = ["Trip basics", "Anchors", "Vibe", "Sources", "Triage", "Review"];

export function Wizard({
  onComplete,
  onLoadDemo,
}: {
  onComplete: (trip: Trip) => void;
  onLoadDemo: (kind: DemoKind) => void;
}) {
  const [step, setStep] = useState(0);
  const [basics, setBasics] = useState<TripBasics>({
    city: "",
    startDate: iso(21),
    endDate: iso(25),
    partySize: 2,
  });
  const [anchorRows, setAnchorRows] = useState<AnchorRow[]>([blankAnchor(2)]);
  const [prefs, setPrefs] = useState<Prefs>({
    chips: [],
    priceMin: 1,
    priceMax: 3,
    party: "partner",
  });
  const [sources, setSources] = useState<Source[]>([]);
  const [parsing, setParsing] = useState(false);
  const [homeCity, setHomeCity] = useState("");
  const [favQuery, setFavQuery] = useState("");
  const [review, setReview] = useState<Candidate[]>([]);
  const [resolvingIds, setResolvingIds] = useState<string[]>([]);
  const attempted = useRef<Set<string>>(new Set());

  // Resolve parsed names against Places once, on the review step. Never on render,
  // never twice for the same row.
  useEffect(() => {
    if (step !== 5) return;
    const pending = review.filter(
      (r) => r.place === undefined && r.name.trim().length > 2 && !attempted.current.has(r.id),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const row of pending) {
        attempted.current.add(row.id);
        setResolvingIds((ids) => [...ids, row.id]);
        try {
          const hits = await lookupPlaces(row.name, basics.city, 1);
          if (!cancelled) applyPlaceTo(row.id, hits[0] ?? null);
        } catch {
          if (!cancelled) applyPlaceTo(row.id, null);
        } finally {
          if (!cancelled) setResolvingIds((ids) => ids.filter((i) => i !== row.id));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, review, basics.city]);

  const applyPlaceTo = (id: string, place: PlaceData | null) =>
    setReview((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        if (!place) return { ...r, place: null };
        return {
          ...r,
          place,
          name: r.name.trim() ? r.name : place.name,
          address: place.address,
          neighborhood: r.neighborhood || neighborhoodOf(place, basics.city),
          price: place.priceLevel ?? r.price,
        };
      }),
    );


  const dayCount = Math.max(
    1,
    Math.round(
      (new Date(basics.endDate + "T12:00:00").getTime() -
        new Date(basics.startDate + "T12:00:00").getTime()) /
        86400000,
    ) + 1,
  );

  const favorites = prefs.favorites ?? [];
  const description = prefs.description ?? "";
  const taste = prefs.taste ?? null;
  const travel: TravelProfile = prefs.travel ?? blankTravel();
  const suggestedChips = chipsFromText(description);

  const addFavorite = (place: PlaceData) => {
    setFavQuery("");
    setPrefs((p) => {
      const list = p.favorites ?? [];
      if (list.some((f) => f.id === place.id)) return p;
      const favs = [...list, place];
      return { ...p, favorites: favs, taste: deriveTaste(favs) };
    });
  };

  const removeFavorite = (id: string) =>
    setPrefs((p) => {
      const favs = (p.favorites ?? []).filter((f) => f.id !== id);
      return { ...p, favorites: favs, taste: deriveTaste(favs) };
    });

  const applyDescription = (text: string) =>
    setPrefs((p) => {
      const add = chipsFromText(text).filter((c) => !p.chips.includes(c));
      return { ...p, description: text, chips: [...p.chips, ...add] };
    });

  const toggleChip = (chip: string) =>
    setPrefs((p) => ({
      ...p,
      chips: p.chips.includes(chip)
        ? p.chips.filter((c) => c !== chip)
        : [...p.chips, chip],
    }));

  const runParse = async () => {
    setParsing(true);
    try {
      const raw = sources.flatMap((src) => extractFromSource(src, basics.city));
      const merged = mergeCandidates(raw);
      // Resolve every mention to a real Google place, then merge again so that
      // "Contramar" and "the tuna tostada place" collapse into one entry.
      const resolved = await resolveCandidates(merged, basics.city);
      setReview(mergeCandidates(resolved));
      setStep(4);
    } finally {
      setParsing(false);
    }
  };

  const finish = () => {
    const dates = dateRange(basics.startDate, basics.endDate);
    const anchors: Candidate[] = anchorRows
      .filter((r) => r.name.trim())
      .map((r) => {
        const meal = rowMeal(r);
        const dayIndex = r.date ? dates.indexOf(r.date) : -1;
        return {
          id: r.id,
          name: r.name.trim(),
          address: (r.place?.address ?? r.address).trim(),
          place: r.place,
          bookedVia: r.bookedVia,
          anchorPartySize: r.partySize,
          anchorDate: r.date || null,
          neighborhood: rowNeighborhood(r, basics.city),
          price: r.place?.priceLevel ?? 3,
          tags: [],
          meals: [meal],
          cuisine: "",
          source: "my own list" as const,
          via: r.bookedVia,
          notes: "",
          include: true,
          booking: "Booked" as const,
          confirmation: r.confirmation,
          isAnchor: true,
          anchorDay: dayIndex >= 0 ? dayIndex : null,
          anchorMeal: meal,
          anchorTime: r.time,
        };
      });
    const candidates = [...anchors, ...review.filter((c) => c.include)];
    const days = generateDays(
      emptyDays(basics.startDate, basics.endDate, basics.city, basics.mealTimes),
      candidates,
      prefs,
    );
    onComplete({ basics, prefs, candidates, days, sources });
  };

  /** Editing a start time shifts that slot's window, keeping its length. */
  const setMealStart = (meal: MealType, start: string) => {
    if (!start) return;
    const current = slotsForCity(basics.city, basics.mealTimes).find(
      (s) => s.meal === meal,
    );
    if (!current) return;
    const length =
      (toMin(current.end) - toMin(current.start) + 24 * 60) % (24 * 60) || 90;
    const base: Partial<MealTimes> =
      basics.mealTimes ?? defaultMealTimes(basics.city);
    setBasics({
      ...basics,
      mealTimes: { ...base, [meal]: { start, end: addMin(start, length) } },
    });
  };

  const updateRow = (id: string, patch: Partial<Candidate>) =>
    setReview((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <p className="label-caps text-primary">Mise en Place</p>
        <h1 className="mt-2 text-4xl leading-tight sm:text-5xl">
          Build the trip around the meals.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Give us the restaurants you're determined to eat at and the pile of
          recommendations you've collected. Everything else fills the gaps.
        </p>
      </header>

      <ol className="mb-8 flex flex-wrap gap-x-5 gap-y-2">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`label-caps ${i === step ? "text-primary" : i < step ? "text-foreground" : "text-muted-foreground"}`}
          >
            {String(i + 1).padStart(2, "0")} {s}
          </li>
        ))}
      </ol>

      <div className="printed rounded-lg p-6 sm:p-8">
        {step === 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl">Where and when?</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="City">
                <input
                  className={inputCls}
                  value={basics.city}
                  placeholder="Tokyo · Lisbon · Mexico City · anywhere"
                  onChange={(e) => setBasics({ ...basics, city: e.target.value })}
                />
              </Field>
              <Field label="Party size">
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={basics.partySize}
                  onChange={(e) =>
                    setBasics({ ...basics, partySize: Number(e.target.value) || 1 })
                  }
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  className={inputCls}
                  value={basics.startDate}
                  onChange={(e) => setBasics({ ...basics, startDate: e.target.value })}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  className={inputCls}
                  value={basics.endDate}
                  onChange={(e) => setBasics({ ...basics, endDate: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">
              {dayCount} days of eating in {basics.city.trim() || "your city"}.
            </p>

            <div className="rounded-md border border-border bg-muted/30 p-4">
              <p className="text-sm text-foreground">{clockSentence(basics.city, basics.mealTimes)}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                {slotsForCity(basics.city, basics.mealTimes).map((slot) => (
                  <Field key={slot.meal} label={MEAL_LABEL[slot.meal]}>
                    <input
                      type="time"
                      className={inputCls}
                      value={slot.start}
                      onChange={(e) => setMealStart(slot.meal, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 text-xs underline text-muted-foreground hover:text-primary"
                onClick={() => {
                  const { mealTimes: _drop, ...rest } = basics;
                  setBasics(rest);
                }}
              >
                Reset to local times
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <AnchorStep rows={anchorRows} setRows={setAnchorRows} basics={basics} />
        )}

        {step === 2 && (
          <section className="space-y-7">
            <h2 className="text-2xl">What are you in the mood for?</h2>

            <div className="space-y-3">
              <p className="label-caps text-muted-foreground">
                Places you love in your own city
              </p>
              <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                <input
                  className="rounded-md border border-border bg-paper px-3 py-2 text-sm"
                  placeholder="Your city (optional)"
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                />
                <PlaceSearchInput
                  value={favQuery}
                  city={homeCity}
                  onChange={setFavQuery}
                  onPick={addFavorite}
                  placeholder="Start typing a restaurant you love…"
                  className="w-full rounded-md border border-border bg-paper px-3 py-2 text-sm"
                />
              </div>
              {favorites.length > 0 && (
                <ul className="space-y-1.5">
                  {favorites.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <span className="text-sm">
                        <span className="font-display text-base">{f.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {f.address}
                          {f.rating != null ? ` · ${f.rating.toFixed(1)}` : ""}
                          {f.priceLevel != null ? ` · ${"$".repeat(f.priceLevel)}` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => removeFavorite(f.id)}
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <p className="label-caps text-muted-foreground">
                Describe the kind of place you're after
              </p>
              <textarea
                rows={3}
                className="w-full rounded-md border border-border bg-paper px-3 py-2 text-sm"
                placeholder="e.g. small natural wine spots, counter seats, nothing stuffy, great cocktails after"
                value={description}
                onChange={(e) => applyDescription(e.target.value)}
              />
            </div>

            {(taste || description.trim()) && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
                <p className="label-caps text-primary">What we learned about your taste</p>
                <p className="mt-2 text-sm">
                  {taste
                    ? describeTaste(taste)
                    : "Add a couple of home favourites and we'll read your price and rating habits too."}
                </p>
                {suggestedChips.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    From your description we pre-selected: {suggestedChips.join(", ")}. Edit
                    anything below.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {CHIPS.map((chip) => {
                const on = prefs.chips.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-paper text-foreground hover:border-rule"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <p className="label-caps text-muted-foreground">Price range</p>
              <div className="flex items-center gap-4">
                <span className="w-16 text-sm">{"$".repeat(prefs.priceMin)}</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  value={prefs.priceMin}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      priceMin: Math.min(Number(e.target.value), p.priceMax),
                    }))
                  }
                  className="flex-1 accent-primary"
                />
                <input
                  type="range"
                  min={1}
                  max={4}
                  value={prefs.priceMax}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      priceMax: Math.max(Number(e.target.value), p.priceMin),
                    }))
                  }
                  className="flex-1 accent-primary"
                />
                <span className="w-16 text-right text-sm">
                  {"$".repeat(prefs.priceMax)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="label-caps text-muted-foreground">Who are you traveling with</p>
              <div className="flex flex-wrap gap-2">
                {PARTIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrefs((prev) => ({ ...prev, party: p }))}
                    className={`rounded-full border px-3.5 py-1.5 text-sm ${
                      prefs.party === p
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-paper hover:border-rule"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <div className="space-y-10">
            <TravellerProfile
              travel={travel}
              setTravel={(t) => setPrefs((p) => ({ ...p, travel: t }))}
            />
            <SourcesInbox
              sources={sources}
              setSources={setSources}
              onContinue={() => void runParse()}
              continueLabel="Read my sources & continue to triage"
              continueDisabled={parsing || sources.length === 0}
            />
          </div>
        )}

        {step === 4 && (
          <Triage
            candidates={review}
            onDone={(decided) => {
              setReview(decided);
              setStep(5);
            }}
            onSkip={() => setStep(5)}
          />
        )}


        {step === 5 && (
          <section className="space-y-5">
            <h2 className="text-2xl">Check our reading</h2>
            <p className="text-sm text-muted-foreground">
              {review.length} candidates pulled out and matched against Google Maps.
              Everything is editable — fix a wrong match, untick what isn't a restaurant.
              Names we can't find stay as manual entries.
            </p>
            <datalist id="mise-review-neighborhoods">
              {[...new Set(review.map((r) => r.neighborhood).filter(Boolean))].map(
                (n) => (
                  <option key={n} value={n} />
                ),
              )}
            </datalist>
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="rule-line label-caps text-muted-foreground">
                    <th className="py-2 text-left font-medium">In</th>
                    <th className="py-2 text-left font-medium">Name</th>
                    <th className="py-2 text-left font-medium">Kind</th>
                    <th className="py-2 text-left font-medium">Google match</th>
                    <th className="py-2 text-left font-medium">Neighborhood</th>
                    <th className="py-2 text-left font-medium">$</th>
                    <th className="py-2 text-left font-medium">Meals</th>
                    <th className="py-2 text-left font-medium">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {review.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={row.include}
                          className="accent-primary"
                          onChange={(e) =>
                            updateRow(row.id, { include: e.target.checked })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className={cellCls}
                          value={row.name}
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          className={cellCls}
                          value={row.kind ?? "restaurant"}
                          onChange={(e) =>
                            updateRow(row.id, {
                              kind: e.target.value as "restaurant" | "activity",
                            })
                          }
                        >
                          <option value="restaurant">restaurant</option>
                          <option value="activity">thing to do</option>
                        </select>
                      </td>
                      <td className="w-56 py-2 pr-3">
                        <PlaceMatchCell
                          name={row.name}
                          city={basics.city}
                          place={row.place}
                          resolving={resolvingIds.includes(row.id)}
                          onPick={(p) => applyPlaceTo(row.id, p)}
                          onClear={() => updateRow(row.id, { place: null })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className={cellCls}
                          list="mise-review-neighborhoods"
                          value={row.neighborhood}
                          placeholder="—"
                          onChange={(e) =>
                            updateRow(row.id, { neighborhood: e.target.value })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          className={cellCls}
                          value={row.price}
                          onChange={(e) =>
                            updateRow(row.id, { price: Number(e.target.value) })
                          }
                        >
                          {[1, 2, 3, 4].map((p) => (
                            <option key={p} value={p}>
                              {"$".repeat(p)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-1">
                          {MEALS.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() =>
                                updateRow(row.id, {
                                  meals: row.meals.includes(m)
                                    ? row.meals.filter((x) => x !== m)
                                    : [...row.meals, m],
                                })
                              }
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                row.meals.includes(m)
                                  ? "border-primary text-primary"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {m.slice(0, 5)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2">
                        <input
                          className={cellCls}
                          value={row.tags.join(", ")}
                          onChange={(e) =>
                            updateRow(row.id, {
                              tags: e.target.value
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className={ghostBtn}
              onClick={() =>
                setReview((rows) => [
                  ...rows,
                  {
                    id: uid(),
                    name: "",
                    place: null,
                    neighborhood: "",
                    price: 2,
                    tags: [],
                    meals: ["lunch", "dinner"],
                    cuisine: "",
                    source: "my own list",
                    via: "you",
                    notes: "",
                    include: true,
                    booking: "Not booked",
                    confirmation: "",
                  },
                ])
              }
            >
              + Add a row manually
            </button>
          </section>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
          {step > 0 && (
            <button type="button" className={ghostBtn} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              className={solidBtn}
              disabled={step === 0 && !basics.city.trim()}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className={solidBtn}
              disabled={parsing || sources.length === 0}
              onClick={() => void runParse()}
            >
              {parsing ? "Reading your sources…" : "Read my sources & continue to triage"}
            </button>
          )}
          {step === 5 && (
            <button type="button" className={solidBtn} onClick={finish}>
              Build my itinerary
            </button>
          )}
          <div className="ml-auto flex gap-4">
            <button
              type="button"
              className="text-sm underline"
              onClick={() => onLoadDemo("mexico-city")}
            >
              Load Mexico City demo
            </button>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => onLoadDemo("tokyo")}
            >
              Load Tokyo demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded border border-input bg-paper px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const cellCls =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-border focus:border-primary";
const solidBtn =
  "rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const ghostBtn =
  "rounded-full border border-rule px-4 py-2 text-sm hover:border-primary hover:text-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label-caps text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
