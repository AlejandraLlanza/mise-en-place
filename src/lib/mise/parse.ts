import {
  CUISINE_KEYWORDS,
  MEAL_KEYWORDS,
  PRICE_WORDS,
  VIBE_KEYWORDS,
} from "./data";
import { classifyText, isNonPlacePhrase } from "./kind";
import type { Candidate, MealType, SourceType } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

const BULLET = /^\s*([-•*·–—]|\d+[.)])\s+/;

function splitAnd(fragment: string): string[] {
  const idx = fragment.indexOf(" and ");
  if (idx > 0 && idx < 40) {
    const left = fragment.slice(0, idx).trim();
    const right = fragment.slice(idx + 5).trim();
    const leftCap = /^[A-ZÁÉÍÓÚÑ]/.test(left);
    const rightCap = /^[A-ZÁÉÍÓÚÑ]/.test(right);
    if (leftCap && rightCap && left.length > 2 && right.length > 2) {
      return [left, right];
    }
  }
  return [fragment];
}

/** "eat at Contramar, and go to Casa Luis Barragán" → two fragments. */
const VERB_LEAD =
  "go to|going to|visit|see|check out|eat at|eat|lunch at|dinner at|drinks at|breakfast at|try|don't miss|dont miss|stop by|book|walk|take|stroll|wander|ride|catch|watch|hike|explore";

const VERB_SPLIT = new RegExp(`(?:,\\s*|\\s+)(?:and\\s+|then\\s+)?(?=(?:${VERB_LEAD})\\s+[A-Z0-9\\u00C0-\\u024F])`, "g");

/** "Mercado de Medellín in the morning, then Museo Tamayo" → two mentions. */
const THEN_SPLIT = /,?\s+then\s+(?=[A-Z0-9\u00C0-\u024F])/g;

export function splitFragments(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(BULLET, "");
    for (const chunk of line.split(/;|\s+•\s+|\s+\*\s+/)) {
      const piece = chunk.trim();
      if (!piece) continue;
      for (const part of piece.split(VERB_SPLIT)) {
        const cleaned = part.trim().replace(/^(?:and|then)\s+/i, "");
        if (!cleaned) continue;
        for (const seg of cleaned.split(THEN_SPLIT)) {
          if (!seg.trim()) continue;
          for (const f of splitAnd(seg)) {
            const t = f.trim();
            if (t.length > 1) out.push(t);
          }
        }
      }
    }
  }
  return out;
}

export function extractName(fragment: string): string {
  const stop = /[—–:(,]|\s-\s/;
  const m = fragment.search(stop);
  let name = m > 0 ? fragment.slice(0, m) : fragment;
  name = name.replace(
    /^(go to|going to|visit|see|check out|eat at|eat|lunch at|dinner at|drinks at|breakfast at|try|don't miss|dont miss|stop by|book)\s+/i,
    "",
  );
  name = name.replace(
    /\s+(in|at|for|near|on|by|con|en)\s+[a-zá-úñ]*[A-ZÁ-ÚÑ0-9].*$/,
    "",
  );
  name = name.trim().replace(/[.\s]+$/, "");
  if (name.length > 60) name = name.slice(0, 60).trim();
  return name;
}

export function matchNeighborhood(text: string, city = ""): string {
  const isCity = (v: string) => {
    const t = city.trim().toLowerCase();
    const x = v.trim().toLowerCase();
    return t.length > 2 && (x === t || t.includes(x) || x.includes(t));
  };
  // "… in Shimokitazawa", "… in Kreuzberg" — anywhere in the world.
  const inPhrase = text.match(
    /\bin ([A-ZÁÉÍÓÚÑÜÖÅØ][\wÁÉÍÓÚÑüöåø'’-]*(?: [A-ZÁÉÍÓÚÑÜÖÅØ][\wÁÉÍÓÚÑüöåø'’-]*){0,2})/,
  );
  const found = inPhrase?.[1]?.trim() ?? "";
  return isCity(found) ? "" : found;
}

export function extractPrice(text: string): number {
  const dollars = text.match(/\$+/g);
  if (dollars) {
    const longest = dollars.reduce((a, b) => (b.length > a.length ? b : a));
    if (longest.length >= 1 && longest.length <= 4) return longest.length;
  }
  const lower = text.toLowerCase();
  for (const [word, price] of PRICE_WORDS) {
    if (lower.includes(word)) return price;
  }
  return 2;
}

export function extractTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  for (const [phrase, chip] of VIBE_KEYWORDS) {
    if (lower.includes(phrase) && !tags.includes(chip)) tags.push(chip);
  }
  return tags.slice(0, 4);
}

export function extractMeals(text: string): MealType[] {
  const lower = text.toLowerCase();
  const meals: MealType[] = [];
  for (const [phrase, meal] of MEAL_KEYWORDS) {
    if (lower.includes(phrase) && !meals.includes(meal)) meals.push(meal);
  }
  if (meals.length === 0) return ["lunch", "dinner"];
  return meals;
}

export function extractCuisine(text: string): string {
  const lower = text.toLowerCase();
  for (const [phrase, cuisine] of CUISINE_KEYWORDS) {
    if (lower.includes(phrase)) return cuisine;
  }
  return "";
}

export function parseBlob(
  text: string,
  source: SourceType,
  via: string,
  city = "",
): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const fragment of splitFragments(text)) {
    const nonPlace = isNonPlacePhrase(fragment);
    // A note, not a pin: keep the whole phrase as the name.
    const name = nonPlace
      ? fragment.replace(/[.\s]+$/, "").slice(0, 70)
      : extractName(fragment);
    if (!name || name.length < 2) continue;
    if (/^(https?:|www\.)/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = nonPlace ? "activity" : classifyText(fragment);
    out.push({
      id: uid(),
      name,
      kind,
      ...(nonPlace ? { noPlace: true, place: null } : {}),
      neighborhood: matchNeighborhood(fragment, city),
      price: extractPrice(fragment),
      tags: extractTags(fragment),
      meals: extractMeals(fragment),
      cuisine: extractCuisine(fragment),
      source,
      via: via.trim(),
      notes: fragment.slice(name.length).replace(/^[\s—–:(,-]+/, "").trim(),
      quote: fragment.trim(),
      include: true,
      booking: "Not booked",
      confirmation: "",
    });
  }
  return out;
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Parse "Contramar, Thu 2:30pm" into an anchor candidate. */
export function parseAnchorLine(line: string, startDate: string, dayCount: number): Candidate {
  const lower = line.toLowerCase();
  const name = extractName(line);

  let anchorDay: number | null = null;
  const dayMatch = lower.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (dayMatch) {
    const target = DAY_NAMES.indexOf(dayMatch[1] ?? "");
    const start = new Date(startDate + "T12:00:00");
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (d.getDay() === target) {
        anchorDay = i;
        break;
      }
    }
  }

  let anchorTime: string | null = null;
  let anchorMeal: MealType | null = null;
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1] ?? "0", 10) % 12;
    if (timeMatch[3] === "pm") hour += 12;
    const minutes = timeMatch[2] ?? "00";
    anchorTime = `${String(hour).padStart(2, "0")}:${minutes}`;
    if (hour < 11) anchorMeal = "breakfast";
    else if (hour < 17) anchorMeal = "lunch";
    else if (hour < 22) anchorMeal = "dinner";
    else anchorMeal = "drinks";
  }

  const meals = extractMeals(line);

  return {
    id: uid(),
    name,
    neighborhood: matchNeighborhood(line),
    price: extractPrice(line),
    tags: extractTags(line),
    meals: anchorMeal ? [anchorMeal] : meals,
    cuisine: extractCuisine(line),
    source: "my own list",
    via: "you",
    notes: "",
    include: true,
    booking: anchorTime ? "Booked" : "Need to book",
    confirmation: "",
    isAnchor: true,
    anchorDay,
    anchorMeal,
    anchorTime,
  };
}
