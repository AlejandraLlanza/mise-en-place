import { formatTime } from "@/lib/mise/generate";
import { closedDayNote, hoursNote, isClosedAt } from "@/lib/mise/hours";
import {
  BOOKED_VIA,
  TIME_OPTIONS,
  mapsSearchUrl,
  mealFromTime,
  neighborhoodFromAddress,
  neighborhoodOf,
  placeQuery,
} from "@/lib/mise/maps";
import { PlaceSearchInput } from "@/components/mise/PlaceSearchInput";
import type { PlaceData } from "@/lib/mise/places.functions";
import { uid } from "@/lib/mise/parse";
import type { MealType, TripBasics } from "@/lib/mise/types";

export interface AnchorRow {
  id: string;
  name: string;
  address: string;
  place: PlaceData | null;
  date: string;
  time: string;
  meal: MealType | "";
  neighborhood: string;
  bookedVia: string;
  confirmation: string;
  partySize: number;
}

export function blankAnchor(partySize: number): AnchorRow {
  return {
    id: uid(),
    name: "",
    address: "",
    place: null,
    date: "",
    time: "20:00",
    meal: "",
    neighborhood: "",
    bookedVia: "direct",
    confirmation: "",
    partySize,
  };
}

export const rowMeal = (r: AnchorRow): MealType => r.meal || mealFromTime(r.time);
export const rowNeighborhood = (r: AnchorRow, city = ""): string =>
  r.neighborhood ||
  neighborhoodOf(r.place, city) ||
  neighborhoodFromAddress(r.address, city);

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "drinks"];

function longDate(date: string): string {
  if (!date) return "";
  const d = new Date(date + "T12:00:00");
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function anchorWarnings(
  rows: AnchorRow[],
  basics: TripBasics,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const push = (id: string, msg: string) => {
    out[id] = [...(out[id] ?? []), msg];
  };
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!r.name.trim()) continue;
    if (r.date && (r.date < basics.startDate || r.date > basics.endDate)) {
      push(r.id, "This date falls outside your trip.");
    }
    if (!r.date) push(r.id, "No date yet — we'll place this wherever it fits.");
    if (r.date) {
      const closed = closedDayNote(r.place, r.date);
      if (closed) push(r.id, closed);
      else if (isClosedAt(r.place, r.date, r.time)) {
        push(r.id, `Google's hours say ${r.name} isn't open at ${formatTime(r.time)}.`);
      }
      const key = `${r.date}|${rowMeal(r)}`;
      const other = seen.get(key);
      if (other) {
        push(r.id, `Two reservations share ${rowMeal(r)} on this day.`);
        push(other, `Two reservations share ${rowMeal(r)} on this day.`);
      } else {
        seen.set(key, r.id);
      }
    }
  }
  return out;
}

export function AnchorStep({
  rows,
  setRows,
  basics,
}: {
  rows: AnchorRow[];
  setRows: (rows: AnchorRow[]) => void;
  basics: TripBasics;
}) {
  const warnings = anchorWarnings(rows, basics);
  const patch = (id: string, p: Partial<AnchorRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const done = rows.filter((r) => r.name.trim());
  const hoodOptions = [
    ...new Set(
      rows
        .map((r) => rowNeighborhood(r, basics.city))
        .filter(Boolean),
    ),
  ];

  return (
    <section className="space-y-6">
      <datalist id="mise-neighborhoods">
        {hoodOptions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div>
        <h2 className="text-2xl">Which tables are already confirmed?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Start typing the restaurant and pick it from the list — we pull the address,
          neighbourhood, rating and opening hours straight from Google Maps.
        </p>
      </div>

      {rows.map((row, i) => {
        const meal = rowMeal(row);
        const hood = rowNeighborhood(row, basics.city);
        const place = row.place;
        return (
          <div
            key={row.id}
            id={`anchor-${row.id}`}
            className="space-y-4 rounded-md border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <span className="label-caps text-muted-foreground">
                Reservation {i + 1}
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground underline"
                  onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Restaurant">
                  <PlaceSearchInput
                    className={inputCls}
                    value={row.name}
                    city={basics.city}
                    placeholder="Start typing — we'll find it on Google Maps"
                    onChange={(name) =>
                      patch(row.id, name === row.name ? {} : { name, place: null })
                    }
                    onPick={(hit) =>
                      patch(row.id, {
                        name: hit.name,
                        place: hit,
                        address: hit.address,
                        neighborhood: neighborhoodOf(hit, basics.city),
                      })
                    }
                  />
                </Field>
                {place ? (
                  <PlaceSummary place={place} date={row.date} />
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Not matched to a Google place yet — pick a suggestion, or keep it as a
                    manual entry and fill the address below.
                  </p>
                )}
              </div>

              {!place && (
                <div className="sm:col-span-2">
                  <Field label="Address (manual entry)">
                    <input
                      className={inputCls}
                      value={row.address}
                      placeholder="Calle Durango 200, Roma Norte"
                      onChange={(e) => patch(row.id, { address: e.target.value })}
                    />
                  </Field>
                </div>
              )}

              <Field label="Date">
                <input
                  type="date"
                  className={inputCls}
                  value={row.date}
                  min={basics.startDate}
                  max={basics.endDate}
                  onChange={(e) => patch(row.id, { date: e.target.value })}
                />
              </Field>

              <Field label="Time">
                <select
                  className={inputCls}
                  value={row.time}
                  onChange={(e) => patch(row.id, { time: e.target.value })}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Meal slot">
                <select
                  className={inputCls}
                  value={row.meal}
                  onChange={(e) =>
                    patch(row.id, { meal: e.target.value as MealType | "" })
                  }
                >
                  <option value="">From the time — {mealFromTime(row.time)}</option>
                  {MEALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Neighborhood">
                <input
                  className={inputCls}
                  list="mise-neighborhoods"
                  value={row.neighborhood}
                  placeholder={
                    rowNeighborhood(row, basics.city) ||
                    "From the address — not found yet"
                  }
                  onChange={(e) => patch(row.id, { neighborhood: e.target.value })}
                />
              </Field>

              <Field label="Booked via">
                <select
                  className={inputCls}
                  value={row.bookedVia}
                  onChange={(e) => patch(row.id, { bookedVia: e.target.value })}
                >
                  {BOOKED_VIA.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Party size">
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={row.partySize}
                  onChange={(e) =>
                    patch(row.id, { partySize: Number(e.target.value) || 1 })
                  }
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Confirmation note">
                  <input
                    className={inputCls}
                    value={row.confirmation}
                    placeholder="Confirmation number, name on the booking, anything else"
                    onChange={(e) => patch(row.id, { confirmation: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            {(meal || hood) && row.name.trim() && (
              <p className="text-xs text-muted-foreground">
                Reading this as {meal}
                {hood ? ` in ${hood}` : ""}.
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="rounded-full border border-rule px-4 py-2 text-sm hover:border-primary hover:text-primary"
        onClick={() => setRows([...rows, blankAnchor(basics.partySize)])}
      >
        + Add another reservation
      </button>

      {done.length > 0 && (
        <div className="space-y-3 border-t border-border pt-6">
          <p className="label-caps text-muted-foreground">What we understood</p>
          {done.map((row) => {
            const warn = warnings[row.id] ?? [];
            const hood = rowNeighborhood(row, basics.city);
            return (
              <div
                key={row.id}
                className="rounded-md border-2 border-foreground/80 bg-paper p-4"
              >
                <p className="font-display text-lg leading-snug">{row.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.date ? `${longDate(row.date)}, ` : "Date not set · "}
                  {formatTime(row.time)} · {rowMeal(row)}
                  {row.address ? ` · ${row.address}` : hood ? ` · ${hood}` : ""} · table
                  for {row.partySize} · booked via {row.bookedVia}
                  {row.confirmation ? ` · ${row.confirmation}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <a
                    className="underline hover:text-primary"
                    href={
                      row.place?.googleMapsUri ??
                      mapsSearchUrl(placeQuery(row.name, row.address, basics.city))
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    View map
                  </a>
                  {row.place?.websiteUri && (
                    <a
                      className="underline hover:text-primary"
                      href={row.place.websiteUri}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Website
                    </a>
                  )}
                  <button
                    type="button"
                    className="underline hover:text-primary"
                    onClick={() =>
                      document
                        .getElementById(`anchor-${row.id}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                  >
                    Edit
                  </button>
                </div>
                {warn.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-destructive">
                    {warn.map((w) => (
                      <li key={w}>Heads up — {w}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PlaceSummary({ place, date }: { place: PlaceData; date: string }) {
  const hours = date ? hoursNote(place, date) : null;
  return (
    <div className="mt-2 space-y-1 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <p>{place.address}</p>
      <p>
        {place.rating != null
          ? `${place.rating.toFixed(1)} on Google · ${place.userRatingCount ?? 0} reviews`
          : "No Google rating"}
        {place.priceLevel ? ` · ${"$".repeat(place.priceLevel)}` : ""}
      </p>
      {hours && <p>{hours}</p>}
      <p className="flex flex-wrap gap-3">
        {place.googleMapsUri && (
          <a
            className="underline hover:text-primary"
            href={place.googleMapsUri}
            target="_blank"
            rel="noreferrer"
          >
            View on Google Maps
          </a>
        )}
        {place.websiteUri && (
          <a
            className="underline hover:text-primary"
            href={place.websiteUri}
            target="_blank"
            rel="noreferrer"
          >
            Website
          </a>
        )}
      </p>
    </div>
  );
}

const inputCls =
  "w-full rounded border border-input bg-paper px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label-caps text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
