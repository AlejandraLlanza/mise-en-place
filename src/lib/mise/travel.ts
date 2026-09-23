/** The traveller profile: what they want to see, and how fast. */

export type Pace = "packed" | "balanced" | "slow";

export const PACES: Pace[] = ["packed", "balanced", "slow"];

/** How many activities we suggest per day. */
export const PACE_COUNT: Record<Pace, number> = {
  packed: 4,
  balanced: 2,
  slow: 1,
};

export const PACE_NOTE: Record<Pace, string> = {
  packed: "3–4 things a day, tight between meals",
  balanced: "2 things a day, room to breathe",
  slow: "one thing a day, long meals",
};

export const INTERESTS = [
  "art & museums",
  "architecture & design",
  "markets",
  "parks & nature",
  "shopping & concept stores",
  "history",
  "live music",
  "spa & wellness",
  "bookshops",
  "neighbourhood walking",
];

const INTEREST_KEYWORDS: Array<[string, string]> = [
  ["museum", "art & museums"],
  ["museo", "art & museums"],
  ["art", "art & museums"],
  ["gallery", "art & museums"],
  ["exhibition", "art & museums"],
  ["architect", "architecture & design"],
  ["design", "architecture & design"],
  ["barragán", "architecture & design"],
  ["brutalis", "architecture & design"],
  ["market", "markets"],
  ["mercado", "markets"],
  ["flea", "markets"],
  ["park", "parks & nature"],
  ["garden", "parks & nature"],
  ["nature", "parks & nature"],
  ["hike", "parks & nature"],
  ["outdoors", "parks & nature"],
  ["shop", "shopping & concept stores"],
  ["store", "shopping & concept stores"],
  ["vintage", "shopping & concept stores"],
  ["boutique", "shopping & concept stores"],
  ["histor", "history"],
  ["ruins", "history"],
  ["colonial", "history"],
  ["aztec", "history"],
  ["cathedral", "history"],
  ["live music", "live music"],
  ["concert", "live music"],
  ["jazz", "live music"],
  ["gig", "live music"],
  ["dance", "live music"],
  ["spa", "spa & wellness"],
  ["wellness", "spa & wellness"],
  ["massage", "spa & wellness"],
  ["yoga", "spa & wellness"],
  ["thermal", "spa & wellness"],
  ["book", "bookshops"],
  ["librer", "bookshops"],
  ["walk", "neighbourhood walking"],
  ["wander", "neighbourhood walking"],
  ["stroll", "neighbourhood walking"],
  ["neighbourhood", "neighbourhood walking"],
  ["neighborhood", "neighbourhood walking"],
  ["on foot", "neighbourhood walking"],
];

const PACE_KEYWORDS: Array<[RegExp, Pace]> = [
  [/\b(slow|relax|unhurried|lazy|chill|take my time|nothing rushed)\b/i, "slow"],
  [/\b(packed|see everything|as much as|non-?stop|busy|maximis|maximiz)\b/i, "packed"],
];

export interface TravelProfile {
  description: string;
  interests: string[];
  pace: Pace;
}

export const blankTravel = (): TravelProfile => ({
  description: "",
  interests: [],
  pace: "balanced",
});

/** Map free text onto the interest chip vocabulary. */
export function interestsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const [word, chip] of INTEREST_KEYWORDS) {
    if (lower.includes(word) && !out.includes(chip)) out.push(chip);
  }
  return out;
}

export function paceFromText(text: string): Pace | null {
  for (const [re, pace] of PACE_KEYWORDS) if (re.test(text)) return pace;
  return null;
}

/** Say back, in plain words, what we understood. */
export function describeTravel(profile: TravelProfile): string {
  const bits: string[] = [];
  if (profile.interests.length > 0) {
    bits.push(`you're here for ${profile.interests.join(", ")}`);
  }
  bits.push(`you want a ${profile.pace} pace — ${PACE_NOTE[profile.pace]}`);
  return `You lean: ${bits.join("; ")}.`;
}

/** Does this activity match what the traveller said they want? */
export function interestScore(
  profile: TravelProfile | null | undefined,
  text: string,
): number {
  if (!profile || profile.interests.length === 0) return 0;
  const chips = interestsFromText(text);
  const hits = chips.filter((c) => profile.interests.includes(c)).length;
  return Math.min(20, hits * 10);
}
