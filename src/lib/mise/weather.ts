import {
  lookupForecast,
  type ForecastPayload,
  type PlaceData,
} from "./places.functions";
import type { LatLng } from "./geo";

/**
 * Weather awareness. Real forecast where one exists (about ten days out),
 * clearly-labelled typical conditions for the month beyond that.
 * Every hour is bucketed in the DESTINATION's clock, never the browser's.
 */

export interface HourWeather {
  /** Destination-local date, yyyy-mm-dd. */
  date: string;
  /** Destination-local hour, 0-23. */
  hour: number;
  tempC: number | null;
  precipPct: number | null;
  condition: string;
}

export interface DayWeather {
  date: string;
  maxC: number | null;
  minC: number | null;
  condition: string;
  precipPct: number | null;
  hours: HourWeather[];
  /** False when this is a monthly typical, not a forecast. */
  forecast: boolean;
}

export type WeatherMap = Record<string, DayWeather>;

/* --------------------------- cache --------------------------- */

const KEY = "mise.weather.v1";
const TTL = 6 * 60 * 60 * 1000;

interface Entry {
  at: number;
  payload: ForecastPayload;
}

function read(): Record<string, Entry> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

function write(store: Record<string, Entry>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full — we'll just fetch again */
  }
}

async function forecastFor(at: LatLng): Promise<ForecastPayload | null> {
  const key = `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;
  const store = read();
  const hit = store[key];
  if (hit && Date.now() - hit.at < TTL) return hit.payload;
  try {
    const payload = await lookupForecast({ data: { lat: at.lat, lng: at.lng } });
    store[key] = { at: Date.now(), payload };
    write(store);
    return payload;
  } catch {
    return hit?.payload ?? null;
  }
}

/* ---------------------- typical conditions ---------------------- */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthName(date: string): string {
  const m = Number(date.slice(5, 7));
  return MONTHS[Math.min(11, Math.max(0, m - 1))] ?? "";
}

/**
 * A coarse latitude-and-season estimate, only ever shown as "typical for
 * <month>" — never dressed up as a forecast.
 */
export function climateNormal(lat: number, date: string): DayWeather {
  const month = Number(date.slice(5, 7)) - 1;
  const abs = Math.abs(lat);
  const mean = 27 - 0.35 * abs;
  const amplitude = Math.min(18, 0.42 * abs);
  // Northern hemisphere peaks in July, southern in January.
  const phase = ((month - 6) / 12) * 2 * Math.PI;
  const swing = Math.cos(phase) * (lat >= 0 ? 1 : -1) * amplitude;
  const midday = mean + swing;
  return {
    date,
    maxC: Math.round(midday + 5),
    minC: Math.round(midday - 5),
    condition: "",
    precipPct: null,
    hours: [],
    forecast: false,
  };
}

/* ----------------------- building the map ----------------------- */

function localParts(iso: string, timeZone: string | null) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(hour),
  };
}

/** Weather for every date of the trip, forecast first, typical beyond range. */
export async function weatherForTrip(
  at: LatLng | null,
  dates: string[],
  timeZone: string | null,
): Promise<WeatherMap> {
  const out: WeatherMap = {};
  if (!at || dates.length === 0) return out;

  const payload = await forecastFor(at);

  if (payload) {
    for (const d of payload.days) {
      out[d.date] = {
        date: d.date,
        maxC: d.maxC,
        minC: d.minC,
        condition: d.condition,
        precipPct: d.precipPct,
        hours: [],
        forecast: true,
      };
    }
    for (const h of payload.hours) {
      const local = localParts(h.startTime, timeZone);
      if (!local) continue;
      const day = out[local.date];
      if (!day) continue;
      day.hours.push({
        date: local.date,
        hour: local.hour,
        tempC: h.tempC,
        precipPct: h.precipPct,
        condition: h.condition,
      });
    }
    for (const day of Object.values(out)) {
      day.hours.sort((a, b) => a.hour - b.hour);
    }
  }

  for (const date of dates) {
    if (!out[date]) out[date] = climateNormal(at.lat, date);
  }
  return out;
}

/* --------------------------- reading it --------------------------- */

export const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

export function tempLabel(c: number | null | undefined, fahrenheit: boolean): string {
  if (c == null) return "—";
  return fahrenheit ? `${cToF(c)}°F` : `${Math.round(c)}°C`;
}

/** "18–24°C · light rain · 60% chance of rain" */
export function dayLine(day: DayWeather, fahrenheit: boolean): string {
  const bits: string[] = [];
  if (day.minC != null && day.maxC != null) {
    bits.push(
      `${tempLabel(day.minC, fahrenheit).replace(/°[CF]$/, "")}–${tempLabel(day.maxC, fahrenheit)}`,
    );
  }
  if (day.condition) bits.push(day.condition.toLowerCase());
  if (day.forecast && day.precipPct != null && day.precipPct >= 20) {
    bits.push(`${Math.round(day.precipPct)}% chance of rain`);
  }
  const line = bits.join(" · ");
  return day.forecast ? line : `${line} — typical for ${monthName(day.date)}, not a forecast`;
}

const toHour = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h + m / 60;
};

export interface WindowWeather {
  /** Highest chance of rain across the window, 0-100. */
  rainPct: number | null;
  maxC: number | null;
  minC: number | null;
  /** When rain first crosses the likely line, as a local hour. */
  rainFrom: number | null;
  forecast: boolean;
}

export function windowWeather(
  day: DayWeather | undefined,
  start: string,
  end: string,
): WindowWeather {
  if (!day) return { rainPct: null, maxC: null, minC: null, rainFrom: null, forecast: false };
  if (!day.forecast || day.hours.length === 0) {
    return {
      rainPct: day.forecast ? day.precipPct : null,
      maxC: day.maxC,
      minC: day.minC,
      rainFrom: null,
      forecast: day.forecast,
    };
  }
  const s = Math.floor(toHour(start));
  const e = Math.ceil(toHour(end));
  const inWindow = day.hours.filter((h) => h.hour >= s && h.hour <= e);
  const hours = inWindow.length ? inWindow : day.hours;
  let rain: number | null = null;
  let max: number | null = null;
  let min: number | null = null;
  let from: number | null = null;
  for (const h of hours) {
    if (h.precipPct != null) {
      rain = rain == null ? h.precipPct : Math.max(rain, h.precipPct);
      if (h.precipPct >= RAIN_LIKELY && from == null) from = h.hour;
    }
    if (h.tempC != null) {
      max = max == null ? h.tempC : Math.max(max, h.tempC);
      min = min == null ? h.tempC : Math.min(min, h.tempC);
    }
  }
  return { rainPct: rain, maxC: max, minC: min, rainFrom: from, forecast: true };
}

/* --------------------------- parts of the day --------------------------- */

export interface DayPart {
  label: string;
  /** "16–21°C · cloudy · 60% rain" */
  text: string;
}

const PARTS: Array<{ label: string; from: number; to: number }> = [
  { label: "Morning", from: 6, to: 11 },
  { label: "Afternoon", from: 12, to: 17 },
  { label: "Night", from: 18, to: 23 },
];

/**
 * Morning / afternoon / night breakdown in the destination's clock.
 * Null when there is no hourly forecast (typical-for-the-month days).
 */
export function partsOfDay(
  day: DayWeather | undefined,
  fahrenheit: boolean,
): DayPart[] | null {
  if (!day || !day.forecast || day.hours.length === 0) return null;
  const out: DayPart[] = [];
  for (const part of PARTS) {
    const hours = day.hours.filter((h) => h.hour >= part.from && h.hour <= part.to);
    if (hours.length === 0) continue;
    let max: number | null = null;
    let min: number | null = null;
    let rain: number | null = null;
    const conditions = new Map<string, number>();
    for (const h of hours) {
      if (h.tempC != null) {
        max = max == null ? h.tempC : Math.max(max, h.tempC);
        min = min == null ? h.tempC : Math.min(min, h.tempC);
      }
      if (h.precipPct != null) rain = rain == null ? h.precipPct : Math.max(rain, h.precipPct);
      if (h.condition) conditions.set(h.condition, (conditions.get(h.condition) ?? 0) + 1);
    }
    let condition = "";
    let best = 0;
    for (const [c, n] of conditions) {
      if (n > best) {
        best = n;
        condition = c;
      }
    }
    const bits: string[] = [];
    if (min != null && max != null) {
      bits.push(
        Math.round(min) === Math.round(max)
          ? tempLabel(max, fahrenheit)
          : `${tempLabel(min, fahrenheit).replace(/°[CF]$/, "")}–${tempLabel(max, fahrenheit)}`,
      );
    }
    if (condition) bits.push(condition.toLowerCase());
    if (rain != null && rain >= 20) bits.push(`${Math.round(rain)}% rain`);
    if (bits.length === 0) continue;
    out.push({ label: part.label, text: bits.join(" · ") });
  }
  return out.length > 0 ? out : null;
}



/* --------------------------- outdoors --------------------------- */

const OUTDOOR_TYPES = new Set([
  "park",
  "national_park",
  "garden",
  "botanical_garden",
  "plaza",
  "market",
  "zoo",
  "hiking_area",
  "beach",
  "campground",
  "observation_deck",
  "tourist_attraction",
  "historical_landmark",
  "monument",
  "cemetery",
  "amusement_park",
  "marina",
  "dog_park",
  "picnic_ground",
  "skate_park",
  "stadium",
]);

const INDOOR_TYPES_SET = new Set([
  "museum",
  "art_gallery",
  "book_store",
  "shopping_mall",
  "library",
  "spa",
  "movie_theater",
  "performing_arts_theater",
  "concert_hall",
  "aquarium",
  "cafe",
  "coffee_shop",
  "restaurant",
  "bar",
  "wine_bar",
  "department_store",
  "clothing_store",
]);

/** Indoor place types for a wet-weather plan B. */
export const INDOOR_TYPES = [
  "museum",
  "art_gallery",
  "book_store",
  "shopping_mall",
  "spa",
  "library",
  "movie_theater",
  "cafe",
];

const OUTDOOR_WORDS =
  /\b(park|parque|garden|jard|market|mercado|plaza|z[oó]calo|walk|paseo|stroll|beach|playa|ferry|rooftop|terrace|terraza|viewpoint|mirador|sunset|canal|pier|bridge)\b/i;

/** Is this stop exposed to the weather? Google's own types decide first. */
export function isOutdoorPlace(
  place: PlaceData | null | undefined,
  name = "",
): boolean {
  const types = [place?.primaryType, ...(place?.types ?? [])].filter(
    (t): t is string => Boolean(t),
  );
  if (types.some((t) => INDOOR_TYPES_SET.has(t)) && !types.some((t) => OUTDOOR_TYPES.has(t)))
    return false;
  if (types.some((t) => OUTDOOR_TYPES.has(t))) return true;
  return OUTDOOR_WORDS.test(name);
}

/* --------------------------- warnings --------------------------- */

export const RAIN_LIKELY = 50;
const HOT_C = 34;
const COLD_C = 2;

export interface WeatherWarning {
  text: string;
  /** Only outdoor stops offer a plan B — a warm café doesn't need one. */
  planB: boolean;
}

const hourLabel = (h: number) => {
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
};

/** A warning only when the weather actually clashes with this stop. */
export function warnFor(opts: {
  day: DayWeather | undefined;
  start: string;
  end: string;
  outdoor: boolean;
  name: string;
}): WeatherWarning | null {
  const { day, start, end, outdoor, name } = opts;
  if (!day?.forecast) return null; // never warn off a typical-month estimate
  const w = windowWeather(day, start, end);
  const wet = w.rainPct != null && w.rainPct >= RAIN_LIKELY;
  const hot = w.maxC != null && w.maxC >= HOT_C;
  const cold = w.minC != null && w.minC <= COLD_C;

  if (outdoor) {
    if (wet) {
      const when = w.rainFrom != null ? ` from ${hourLabel(w.rainFrom)}` : "";
      return {
        text: `Rain likely${when} (${Math.round(w.rainPct!)}%) — ${name} is open-air.`,
        planB: true,
      };
    }
    if (hot)
      return {
        text: `${Math.round(w.maxC!)}°C at this hour — ${name} has little shade.`,
        planB: true,
      };
    if (cold)
      return {
        text: `Near freezing at this hour — ${name} is outdoors.`,
        planB: true,
      };
    return null;
  }

  // Indoors: only flag weather that makes getting there miserable.
  if (w.rainPct != null && w.rainPct >= 70)
    return { text: `Heavy rain around this time — take a taxi rather than walk.`, planB: false };
  if (w.maxC != null && w.maxC >= HOT_C + 4)
    return { text: `${Math.round(w.maxC)}°C — don't plan on walking far to this one.`, planB: false };
  return null;
}

/** Does this walk deserve a "take a taxi" nudge? */
export function wetWalk(day: DayWeather | undefined, time: string): boolean {
  if (!day?.forecast) return false;
  const w = windowWeather(day, time, time);
  return w.rainPct != null && w.rainPct >= RAIN_LIKELY;
}

/** "Three dry days · rain Thursday afternoon" — built only from the forecast. */
export function tripSummary(
  days: Array<{ date: string; weekday: string }>,
  map: WeatherMap,
  fahrenheit: boolean,
): string {
  const known = days.map((d) => ({ ...d, wx: map[d.date] })).filter((d) => d.wx?.forecast);
  if (known.length === 0) return "Forecast isn't out yet — showing typical conditions for the month.";
  const wet = known.filter(
    (d) => (d.wx!.precipPct ?? 0) >= RAIN_LIKELY || /rain|storm|shower|snow/i.test(d.wx!.condition),
  );
  const temps = known
    .map((d) => d.wx!.maxC)
    .filter((t): t is number => t != null);
  const range = temps.length
    ? `highs ${tempLabel(Math.min(...temps), fahrenheit).replace(/°[CF]$/, "")}–${tempLabel(Math.max(...temps), fahrenheit)}`
    : "";
  const dry = known.length - wet.length;
  const rainBit = wet.length
    ? `rain ${wet.map((d) => d.weekday).join(", ")}`
    : "no rain in the forecast";
  return [`${dry} dry ${dry === 1 ? "day" : "days"}`, rainBit, range]
    .filter(Boolean)
    .join(" · ");
}

/** Fahrenheit only where people actually use it. */
export function usesFahrenheit(places: Array<PlaceData | null | undefined>): boolean {
  for (const p of places) {
    const country = p?.components?.find((c) => c.types.includes("country"));
    if (country) return ["US", "BS", "KY", "BZ", "PW"].includes(country.shortText);
  }
  return false;
}
