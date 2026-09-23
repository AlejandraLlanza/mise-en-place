export type MealType = "breakfast" | "lunch" | "dinner" | "drinks";

export type SourceType =
  | "friend rec"
  | "blog / press"
  | "saved from social"
  | "my own list"
  | "suggested by Mise";

export type BookingStatus = "Not booked" | "Need to book" | "Booked";

export type Party = "solo" | "partner" | "friends group" | "family";

import type { PlaceData } from "./places.functions";
import type { Mention, Source } from "./sources";
import type { TasteProfile } from "./taste";
import type { PlaceKind } from "./kind";
import type { TravelProfile } from "./travel";
import type { MealTimes } from "./city";

export interface Candidate {
  id: string;
  name: string;
  /** Restaurant, or a thing to do. Defaults to restaurant when missing. */
  kind?: PlaceKind;
  /** True when it isn't a place at all — "walk Avenida Ámsterdam at sunset". */
  noPlace?: boolean;
  address?: string;
  /** Resolved Google Place, when we found one. Null/undefined = manual entry. */
  place?: PlaceData | null;
  bookedVia?: string;
  anchorPartySize?: number | null;
  anchorDate?: string | null;
  neighborhood: string;
  price: number; // 1-4
  tags: string[];
  meals: MealType[];
  cuisine: string;
  source: SourceType;
  via: string;
  notes: string;
  include: boolean;
  booking: BookingStatus;
  confirmation: string;
  /** The verbatim sentence this came from. Never paraphrased. */
  quote?: string;
  sourceIds?: string[];
  mentions?: Mention[];
  triage?: "keep" | "maybe" | "discard";
  isAnchor?: boolean;
  anchorDay?: number | null;
  anchorMeal?: MealType | null;
  anchorTime?: string | null;
}

export interface Slot {
  id: string;
  meal: MealType;
  start: string; // "13:30"
  end: string;
  candidateId: string | null;
  locked: boolean;
}

export interface Day {
  id: string;
  date: string; // ISO yyyy-mm-dd
  slots: Slot[];
  /** Things to do on this day, paced by the traveller profile. */
  activityIds?: string[];
  /** What the user decided for each open block: a candidate id, or "free". */
  blockPicks?: Record<string, string>;
}

export interface Prefs {
  chips: string[];
  priceMin: number;
  priceMax: number;
  party: Party;
  /** Restaurants the user loves at home, resolved on Google Places. */
  favorites?: PlaceData[];
  /** Free-text description of the kind of place they're after. */
  description?: string;
  /** Taste fingerprint derived from the favorites. */
  taste?: TasteProfile | null;
  /** What kind of traveller they are: interests + pace. */
  travel?: TravelProfile;
}

export interface TripBasics {
  city: string;
  startDate: string;
  endDate: string;
  partySize: number;
  /** Local meal times, defaulted from the destination and editable. */
  mealTimes?: Partial<MealTimes>;
}

export interface Trip {
  basics: TripBasics;
  prefs: Prefs;
  candidates: Candidate[];
  days: Day[];
  /** The sources inbox — every paste, file and note, kept as its own card. */
  sources?: Source[];
}
