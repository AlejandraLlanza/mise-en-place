# Weather by part of day

Right now each day shows one summary line: "15–28°C · partly sunny · 20% chance of rain". That hides the thing travellers actually need — whether the rain lands at lunch or after dinner.

## What changes

Under each day heading, replace the single line with three short parts:

```text
Wednesday                                        Sep 16
Morning   16–21°C · cloudy
Afternoon 24–28°C · partly sunny
Night     19°C · light rain · 60% rain
```

- Morning = 6:00–12:00, Afternoon = 12:00–18:00, Night = 18:00–24:00, all in the destination city's local time.
- Each part shows its own temperature range, condition, and chance of rain (only when 20% or higher).
- A day still keeps one compact overall line above the parts when space is tight on small screens; on narrow widths the three parts stack.
- If a part has no hourly data (beyond the forecast window, or cities where Google has no forecast), the day falls back to the existing single "typical for [month], not a forecast" line — no invented per-part detail.

Warnings, plan B, and the °C/°F toggle keep working exactly as today, and now read from the part that covers the stop's time instead of the whole day.

## Technical notes

- Add `partsOfDay(day, fahrenheit)` to `src/lib/mise/weather.ts`, built on the existing `windowWeather` helper (hourly buckets are already stored in destination timezone), returning morning/afternoon/night entries or `null` when no hourly data exists.
- Update the day header in `src/components/mise/Itinerary.tsx` to render the three parts when available and fall back to `dayLine` otherwise.
- No API, caching, or data-fetching changes — the hourly forecast is already requested and cached.
