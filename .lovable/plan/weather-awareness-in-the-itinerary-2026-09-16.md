# Weather awareness in the itinerary

Each day of the trip gets a real forecast, outdoor stops get warned when the weather turns, and every warning comes with a concrete plan B.

## 1. A weather line on every day

- Under each day's heading: high/low temperature, a short condition ("light rain from 4pm"), and chance of rain.
- Comes from Google's weather data for the trip city, read in the destination's own clock so "afternoon" means their afternoon.
- Fetched once per trip and cached, so scrolling never re-fetches.

## 2. Warnings where they matter

- Outdoor stops (parks, markets, walks, viewpoints, rooftop bars, anything with no roof) get a warning when rain or extreme temperature overlaps their time: "Rain likely 4-7pm — Mercado de Medellín is open-air."
- Open blocks between meals get the same treatment: a wet gap is flagged before you plan it.
- Restaurants are only flagged when the weather is extreme (heavy rain at the walk between meals, or a heat/cold warning on a long walk connector).
- Nothing is blocked or moved automatically — the day stays exactly as you arranged it.

## 3. Plan B, always concrete

- Every weather warning carries a "Show me a plan B" action.
- Plan B first looks at things you already collected in Sources that are indoors and open at that time, then falls back to indoor places nearby (museums, galleries, covered markets, bookshops, cafés, spas), picked the same way the open-block suggestions already are.
- One click swaps the stop; the original goes back into the pool, never deleted.
- For a wet walk between two meals, plan B is simply the travel line switching to "12 min walk — 6 min by taxi in the rain".

## 4. Trips beyond forecast range

- Forecasts only exist about 10 days out. Further ahead, each day shows typical conditions for that month instead, clearly labelled "Typical for March, not a forecast", with no per-stop warnings and no plan B prompts.
- As the trip comes within range, the real forecast replaces it automatically.

## 5. Surfacing it

- A compact weather strip at the top of the itinerary summarising the trip: "Three dry days, rain Thursday afternoon."
- Both demos (Mexico City and Tokyo) show it, so the difference between a dry season and a wet one is visible.

## Technical notes

- New server function in `places.functions.ts` hitting the Google Maps connector's Weather API (`weather/v1/forecast/days:lookup`, up to 10 days) plus `weather/v1/currentConditions:lookup`, keyed on the trip city's coordinates.
- New `src/lib/mise/weather.ts`: `DayWeather` type (date, min/max temp, condition, precipitation probability, hourly buckets), `weatherForTrip(city, coords, dates)` with localStorage caching under `mise.weather.v1` (6-hour TTL), plus `climateNormal(lat, month)` for the beyond-range case — a coarse latitude/season estimate, always labelled as typical rather than forecast.
- Hourly overlap checks reuse `overlapMinutes`-style logic from `hours.ts` and the destination timezone from `tz.ts`.
- `isOutdoor(place)` derived from Google Places types (park, tourist_attraction, market, plaza, zoo, hiking area, rooftop/beer_garden hints) — no hardcoded names.
- Plan B reuses `blocks.ts` (`nearbyCached`, `fitsBlock`) with an indoor type list; sources-first ordering mirrors `suggestForBlock`.
- `Itinerary.tsx` renders the trip strip, the per-day line, warning badges on meal/activity cards, and the plan-B panel; `BlockPlanner.tsx` shows the wet-block warning.
- Unit preference follows the trip locale (°C worldwide, °F for US destinations), with a toggle in the day strip.
