import type { MealType } from "./types";

export interface SlotTemplateEntry {
  meal: MealType;
  start: string;
  end: string;
  optional: boolean;
}

export type MealTimes = Record<MealType, { start: string; end: string }>;

export type DiningClock =
  | "early"
  | "standard"
  | "late"
  | "very late"
  | "night owl";

/**
 * Meals happen at different hours around the world. We pick a clock from the
 * city / country the traveller typed, and fall back to a middle-of-the-road one.
 */
const CLOCK_HINTS: Array<[RegExp, DiningClock]> = [
  [/argentin|buenos aires|montevideo|uruguay/i, "night owl"],
  [
    /spain|españa|madrid|barcelona|sevilla|seville|valencia|bilbao|san sebast|granada|málaga|malaga/i,
    "very late",
  ],
  [
    /portugal|lisbon|lisboa|porto|mexic|méxic|cdmx|guadalajara|monterrey|oaxaca|italy|italia|rome|roma,|milan|napl|napoli|florence|firenze|greece|athens|turkey|türkiye|istanbul|israel|tel aviv|beirut|lebanon|chile|santiago|lima|peru|perú|colombia|bogot|medell|brazil|brasil|são paulo|sao paulo|rio de janeiro|croatia|malta|cyprus|france|paris|lyon|marseille|bordeaux/i,
    "late",
  ],
  [
    /norway|sweden|stockholm|oslo|denmark|copenhagen|helsinki|finland|iceland|reykjav|netherlands|amsterdam|belgium|brussels|germany|berlin|munich|hamburg|switzerland|zurich|zürich|austria|vienna|poland|warsaw|krak|czech|prague|china|beijing|shanghai|hong kong|taipei|taiwan|japan|tokyo|kyoto|osaka|korea|seoul|australia|sydney|melbourne|new zealand|auckland|canada|toronto|vancouver|montreal|singapore|bangkok|thailand|vietnam|hanoi/i,
    "early",
  ],
];

export function diningClock(city: string): DiningClock {
  for (const [re, clock] of CLOCK_HINTS) {
    if (re.test(city)) return clock;
  }
  return "standard";
}

const CLOCKS: Record<DiningClock, SlotTemplateEntry[]> = {
  early: [
    { meal: "breakfast", start: "08:00", end: "09:30", optional: true },
    { meal: "lunch", start: "12:00", end: "13:30", optional: false },
    { meal: "dinner", start: "18:00", end: "20:00", optional: false },
    { meal: "drinks", start: "20:30", end: "22:30", optional: true },
  ],
  standard: [
    { meal: "breakfast", start: "08:30", end: "10:00", optional: true },
    { meal: "lunch", start: "12:30", end: "14:00", optional: false },
    { meal: "dinner", start: "19:00", end: "21:00", optional: false },
    { meal: "drinks", start: "21:30", end: "23:30", optional: true },
  ],
  late: [
    { meal: "breakfast", start: "09:00", end: "10:30", optional: true },
    { meal: "lunch", start: "14:00", end: "16:00", optional: false },
    { meal: "dinner", start: "20:00", end: "22:00", optional: false },
    { meal: "drinks", start: "22:30", end: "00:30", optional: true },
  ],
  "very late": [
    { meal: "breakfast", start: "09:30", end: "11:00", optional: true },
    { meal: "lunch", start: "14:30", end: "16:30", optional: false },
    { meal: "dinner", start: "21:30", end: "23:30", optional: false },
    { meal: "drinks", start: "23:45", end: "01:30", optional: true },
  ],
  "night owl": [
    { meal: "breakfast", start: "09:30", end: "11:00", optional: true },
    { meal: "lunch", start: "13:30", end: "15:30", optional: false },
    { meal: "dinner", start: "22:00", end: "00:00", optional: false },
    { meal: "drinks", start: "00:15", end: "02:00", optional: true },
  ],
};

export function defaultSlotsForCity(city: string): SlotTemplateEntry[] {
  return CLOCKS[diningClock(city)];
}

export function defaultMealTimes(city: string): MealTimes {
  const out = {} as MealTimes;
  for (const s of defaultSlotsForCity(city)) out[s.meal] = { start: s.start, end: s.end };
  return out;
}

/** The slot template a trip actually uses: the city default, plus any edits. */
export function slotsForCity(
  city: string,
  mealTimes?: Partial<MealTimes>,
): SlotTemplateEntry[] {
  return defaultSlotsForCity(city).map((s) => {
    const override = mealTimes?.[s.meal];
    return override ? { ...s, start: override.start, end: override.end } : s;
  });
}

export function prettyTime(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  let hour = h % 12;
  if (hour === 0) hour = 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Plain-language explanation of the local clock, shown on the basics step. */
export function clockSentence(city: string, mealTimes?: Partial<MealTimes>): string {
  const place = city.trim() || "your destination";
  const slots = slotsForCity(city, mealTimes);
  const dinner = slots.find((s) => s.meal === "dinner");
  const lunch = slots.find((s) => s.meal === "lunch");
  if (!dinner || !lunch) return "";
  return `In ${place}, dinner usually starts around ${prettyTime(
    dinner.start,
  )} and lunch around ${prettyTime(lunch.start)} — we've set your slots accordingly.`;
}

export const CLOCK_NOTE: Record<DiningClock, string> = {
  early: "early — dinner around 6pm",
  standard: "standard — dinner around 7pm",
  late: "late — dinner around 8pm",
  "very late": "very late — dinner around 9:30pm",
  "night owl": "very late indeed — dinner around 10pm",
};
