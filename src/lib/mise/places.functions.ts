import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PLACES_URL = "https://places.googleapis.com/v1";
const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";
const WEATHER_URL = "https://weather.googleapis.com/v1";

/** Server-only Google Maps Platform key (Places API (New), Time Zone, Weather). */
function mapsKey(): string | null {
  return process.env["GOOGLE_MAPS_API_KEY"] || null;
}

function requireMapsKey(): string {
  const key = mapsKey();
  if (!key) throw new Error("Google Maps is not connected.");
  return key;
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.regularOpeningHours",
  "places.types",
  "places.primaryType",
  "places.addressComponents",
].join(",");

export interface PlacePeriod {
  openDay: number;
  openTime: string;
  closeDay: number | null;
  closeTime: string | null;
}

export interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

export interface PlaceData {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: number | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  periods: PlacePeriod[] | null;
  weekdayDescriptions: string[] | null;
  /** Google Places types, e.g. ["restaurant","bar"] or ["museum"]. */
  types?: string[] | null;
  primaryType?: string | null;
  /** Google's own address components — where the neighbourhood comes from. */
  components?: AddressComponent[] | null;
  /** The name in the local language, when it differs from the display name. */
  localName?: string | null;
}

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const input = z.object({
  query: z.string().min(2).max(120),
  city: z.string().max(80).default(""),
  limit: z.number().int().min(1).max(8).default(6),
  /** "restaurant" biases the text query to food; "activity" / "any" don't. */
  kind: z.enum(["restaurant", "activity", "any"]).default("restaurant"),
  /** The traveller's language, e.g. "en" or "es-419". */
  languageCode: z.string().max(12).optional(),
});

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  types?: string[];
  primaryType?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: Array<{
      open?: { day?: number; hour?: number; minute?: number };
      close?: { day?: number; hour?: number; minute?: number };
    }>;
  };
}

const hhmm = (h?: number, m?: number) =>
  `${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;

function toPlace(p: RawPlace, i: number): PlaceData {
  const hours = p.regularOpeningHours;
  return {
    id: p.id ?? `unknown-${i}`,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    userRatingCount:
      typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    priceLevel: p.priceLevel ? (PRICE_MAP[p.priceLevel] ?? null) : null,
    websiteUri: p.websiteUri ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    periods: hours?.periods
      ? hours.periods.map((pr) => ({
          openDay: pr.open?.day ?? 0,
          openTime: hhmm(pr.open?.hour, pr.open?.minute),
          closeDay: pr.close?.day ?? null,
          closeTime: pr.close ? hhmm(pr.close.hour, pr.close.minute) : null,
        }))
      : null,
    weekdayDescriptions: hours?.weekdayDescriptions ?? null,
    types: p.types ?? null,
    primaryType: p.primaryType ?? null,
    components:
      p.addressComponents?.map((c) => ({
        longText: c.longText ?? "",
        shortText: c.shortText ?? "",
        types: c.types ?? [],
      })) ?? null,
  };
}

export const searchRestaurants = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<PlaceData[]> => {
    const key = requireMapsKey();

    const hint = data.kind === "restaurant" ? " restaurant" : "";
    const textQuery = data.city
      ? `${data.query}${hint} ${data.city}`
      : data.query;

    const res = await fetch(`${PLACES_URL}/places:searchText`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": key,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: data.limit,
        ...(data.languageCode ? { languageCode: data.languageCode } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Places search failed [${res.status}]: ${body}`);
      throw new Error(`Places search failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as { places?: RawPlace[] };
    return (json.places ?? []).map(toPlace);
  });

/* ------------------------------------------------------------------ *
 * Nearby search — what's around a meal, bounded and cached by caller. *
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------- *
 * The place's name in the local language / script.          *
 * One request per place, cached forever by the caller.      *
 * ------------------------------------------------------- */

const localNameInput = z.object({ placeId: z.string().min(3).max(200) });

export const lookupLocalName = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => localNameInput.parse(data))
  .handler(async ({ data }): Promise<string | null> => {
    const key = mapsKey();
    if (!key) return null;

    // No languageCode: Google answers in the place's own language.
    const res = await fetch(
      `${PLACES_URL}/places/${encodeURIComponent(data.placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "displayName",
        },
      },
    );
    if (!res.ok) {
      console.error(`Local name lookup failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { displayName?: { text?: string } };
    return json.displayName?.text ?? null;
  });

const nearbyInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Metres. Derived from the day's spread, capped by the caller. */
  radius: z.number().min(200).max(3000),
  includedTypes: z.array(z.string().max(48)).min(1).max(8),
  limit: z.number().int().min(1).max(20).default(12),
  languageCode: z.string().max(12).optional(),
});

export const searchNearbyPlaces = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => nearbyInput.parse(data))
  .handler(async ({ data }): Promise<PlaceData[]> => {
    const key = requireMapsKey();

    const res = await fetch(`${PLACES_URL}/places:searchNearby`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": key,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        ...(data.languageCode ? { languageCode: data.languageCode } : {}),
        includedTypes: data.includedTypes,
        maxResultCount: data.limit,
        rankPreference: "POPULARITY",
        locationRestriction: {
          circle: {
            center: { latitude: data.lat, longitude: data.lng },
            radius: data.radius,
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Nearby search failed [${res.status}]: ${body}`);
      throw new Error(`Nearby search failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as { places?: RawPlace[] };
    return (json.places ?? []).map(toPlace);
  });

/* ---------------------------------------------------------- *
 * Time zone of the destination — every hours check uses this. *
 * ---------------------------------------------------------- */

const tzInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const lookupTimeZone = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tzInput.parse(data))
  .handler(async ({ data }): Promise<string | null> => {
    const key = requireMapsKey();
    const stamp = Math.floor(Date.now() / 1000);
    const res = await fetch(
      `${TIMEZONE_URL}?location=${data.lat},${data.lng}&timestamp=${stamp}&key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`Time zone lookup failed [${res.status}]: ${body}`);
      return null;
    }
    const json = (await res.json()) as { timeZoneId?: string };
    return json.timeZoneId ?? null;
  });

/* ------------------------------------------------------------ *
 * Weather — forecast for the trip city, days + hours in one go. *
 * ------------------------------------------------------------ */

export interface RawForecastDay {
  date: string; // yyyy-mm-dd, already local to the destination
  maxC: number | null;
  minC: number | null;
  condition: string;
  precipPct: number | null;
}

export interface RawForecastHour {
  /** UTC ISO instant — the caller buckets it in the destination's clock. */
  startTime: string;
  tempC: number | null;
  condition: string;
  precipPct: number | null;
}

export interface ForecastPayload {
  days: RawForecastDay[];
  hours: RawForecastHour[];
}

const weatherInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const pad2 = (n: number) => String(n).padStart(2, "0");

/** WMO weather codes, worded the way Google words its conditions. */
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

interface OpenMeteoJson {
  utc_offset_seconds?: number;
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
}

/**
 * Second opinion for places Google has no forecast for (Tokyo, among others).
 * Free, no key. Times come back in the destination's clock, so they're shifted
 * to UTC instants to match the payload the caller already knows how to bucket.
 */
async function openMeteoForecast(
  lat: number,
  lng: number,
): Promise<ForecastPayload | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&forecast_days=10&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Open-Meteo lookup failed [${res.status}]`);
      return null;
    }
    const json = (await res.json()) as OpenMeteoJson;
    const offset = (json.utc_offset_seconds ?? 0) * 1000;
    const days = (json.daily?.time ?? []).map((date, i) => ({
      date,
      maxC: json.daily?.temperature_2m_max?.[i] ?? null,
      minC: json.daily?.temperature_2m_min?.[i] ?? null,
      condition: WMO[json.daily?.weather_code?.[i] ?? -1] ?? "",
      precipPct: json.daily?.precipitation_probability_max?.[i] ?? null,
    }));
    const hours = (json.hourly?.time ?? []).map((local, i) => ({
      // "2026-09-25T14:00" is destination-local; shift back to a UTC instant.
      startTime: new Date(new Date(`${local}Z`).getTime() - offset).toISOString(),
      tempC: json.hourly?.temperature_2m?.[i] ?? null,
      condition: WMO[json.hourly?.weather_code?.[i] ?? -1] ?? "",
      precipPct: json.hourly?.precipitation_probability?.[i] ?? null,
    }));
    return days.length > 0 ? { days, hours } : null;
  } catch {
    return null;
  }
}


export const lookupForecast = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => weatherInput.parse(data))
  .handler(async ({ data }): Promise<ForecastPayload> => {
    const key = requireMapsKey();
    const headers = { "X-Goog-Api-Key": key };
    const loc = `location.latitude=${data.lat}&location.longitude=${data.lng}`;

    const get = async (path: string): Promise<Record<string, unknown> | null> => {
      const res = await fetch(`${WEATHER_URL}/${path}`, { headers });
      if (res.status === 404) {
        // Google has no forecast for this place — fall back to monthly typical.
        return null;
      }
      if (!res.ok) {
        const body = await res.text();
        console.error(`Weather lookup failed [${res.status}]: ${body}`);
        throw new Error(`Weather lookup failed [${res.status}]`);
      }
      return (await res.json()) as Record<string, unknown>;
    };


    interface RawDayJson {
      displayDate?: { year?: number; month?: number; day?: number };
      maxTemperature?: { degrees?: number };
      minTemperature?: { degrees?: number };
      daytimeForecast?: {
        weatherCondition?: { description?: { text?: string } };
        precipitation?: { probability?: { percent?: number } };
      };
    }
    interface RawHourJson {
      interval?: { startTime?: string };
      temperature?: { degrees?: number };
      weatherCondition?: { description?: { text?: string } };
      precipitation?: { probability?: { percent?: number } };
    }

    /**
     * Google caps a page at 5 days / 24 hours and returns the rest behind a
     * page token, so a single call only ever covers the next day or two.
     * Walk the pages until the whole window is in hand.
     */
    const paged = async <T>(
      path: string,
      field: string,
      wanted: number,
      maxPages: number,
    ): Promise<T[]> => {
      const out: T[] = [];
      let token: string | undefined;
      for (let page = 0; page < maxPages; page++) {
        const url = token ? `${path}&pageToken=${encodeURIComponent(token)}` : path;
        const json = await get(url);
        if (!json) break;
        out.push(...((json[field] as T[] | undefined) ?? []));
        token = json["nextPageToken"] as string | undefined;

        if (!token || out.length >= wanted) break;
      }
      return out.slice(0, wanted);
    };

    const [rawDays, rawHours] = await Promise.all([
      paged<RawDayJson>(
        `forecast/days:lookup?${loc}&days=10&pageSize=5&unitsSystem=METRIC`,
        "forecastDays",
        10,
        3,
      ),
      paged<RawHourJson>(
        `forecast/hours:lookup?${loc}&hours=240&pageSize=24&unitsSystem=METRIC`,
        "forecastHours",
        240,
        10,
      ),
    ]);

    // Google has nothing for this place — ask the backup service.
    if (rawDays.length === 0) {
      const backup = await openMeteoForecast(data.lat, data.lng);
      if (backup) return backup;
    }

    return {

      days: rawDays
        .filter((d) => d.displayDate?.year)
        .map((d) => ({
          date: `${d.displayDate!.year}-${pad2(d.displayDate!.month ?? 1)}-${pad2(
            d.displayDate!.day ?? 1,
          )}`,
          maxC: d.maxTemperature?.degrees ?? null,
          minC: d.minTemperature?.degrees ?? null,
          condition: d.daytimeForecast?.weatherCondition?.description?.text ?? "",
          precipPct: d.daytimeForecast?.precipitation?.probability?.percent ?? null,
        })),
      hours: rawHours
        .filter((h) => h.interval?.startTime)
        .map((h) => ({
          startTime: h.interval!.startTime!,
          tempC: h.temperature?.degrees ?? null,
          condition: h.weatherCondition?.description?.text ?? "",
          precipPct: h.precipitation?.probability?.percent ?? null,
        })),
    };
  });
