# Make Mise work anywhere in the world

Strip the Mexico City assumptions out of the planner so the same flow feels native in Tokyo, Madrid, New York or Buenos Aires.

## 1. Meal times set themselves from the destination

- Expand the dining-clock profiles so the country/city decides the default slot times: Tokyo 18:00 dinner, New York 19:00, Madrid 21:30, Buenos Aires 22:00, and so on, with a sensible worldwide default.
- On the first step (trip basics), after a city is entered, show the defaults in plain words: "In Madrid, dinner usually starts around 9:30pm — we've set your slots accordingly."
- Show the four slot times (breakfast, lunch, dinner, drinks) as editable time fields right there. Edits are saved with the trip and used for every day, and for all the opening-hours checks.

## 2. Neighbourhoods come from Google, not a list

- Delete the built-in Mexico City neighbourhood list and its adjacency map.
- Ask Google for address components on every place and read the neighbourhood from whichever exists: neighborhood, sublocality, then ward/district, then the wider administrative area.
- If none exists, fall back to the postal district; only show nothing when Google returns nothing. No more "NEIGHBOURHOOD?" placeholders.
- Cohesion scoring that used the hardcoded adjacency map switches entirely to real distance, with an exact neighbourhood-name match as the only fallback.

## 3. Distance is always expressed as time

- One shared travel label: 20 minutes' walk or less reads "12 min walk"; anything further reads "25 min by taxi or transit" (estimated from distance at city driving speed).
- Kilometre strings disappear from the interface.
- The one-day cohesion rule becomes "meals within about 25 minutes' walk of each other" instead of a fixed 2.5 km, so dense and sprawling cities both behave. The existing pinned-reservation exception and the taxi-hop warning stay.

## 4. Language and local script

- Places requests carry the browser's language code, so names and addresses come back in the traveller's language.
- For each resolved place we also keep the local-language name (one extra cached lookup per place, never repeated) and show both when they differ: "Senso-ji / 浅草寺".
- Addresses are displayed exactly as Google returns them for that country — no reformatting.

## 5. Two demos

- Keep the Mexico City demo, add a Tokyo demo with its own sources, reservations, traveller profile and activity mentions.
- Footer buttons read "Load Mexico City demo" and "Load Tokyo demo", making the difference in meal times, neighbourhoods and walking distances visible side by side.

## Technical notes

- `src/lib/mise/city.ts`: country/city clock table returning slot templates plus a plain-language sentence; `TripBasics` gains an optional `mealTimes` override consumed by `emptyDays` in `generate.ts`.
- `src/lib/mise/places.functions.ts`: field mask adds `places.addressComponents`; requests pass `languageCode`; a `placeDetails` server fn (no language override) supplies the local-script name, cached by place ID.
- `src/lib/mise/maps.ts`: `neighborhoodFromComponents` replaces the hardcoded list; free-text parsing stays only as a fallback for unresolved entries.
- `src/lib/mise/geo.ts`: `travelLabel()` and `travelMinutes()` with a 20-minute walk threshold; `generate.ts` swaps `MAX_DAY_METERS` for `MAX_DAY_WALK_MINUTES = 25`.
- `src/lib/mise/data.ts`: remove `NEIGHBORHOODS` and `ADJACENT`; update `score.ts` and any importers.
- `src/lib/mise/demo.ts`: refactor into a shared builder with Mexico City and Tokyo seed sets; `Wizard.tsx` and `Itinerary.tsx` expose both buttons.
