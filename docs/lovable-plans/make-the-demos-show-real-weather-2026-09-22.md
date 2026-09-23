# Make the demos show real weather

## What's wrong

Both demo trips (Mexico City and Tokyo) start 21 days from today and end 25 days out. Google's forecast only reaches about 10 days, so every demo day falls outside it. The result: no morning/afternoon/night breakdown, no rain or heat warnings, no "Show me a plan B" — just the single "typical for September, not a forecast" line on every day. The weather feature is working; the demos simply sit past the window it covers.

Tokyo has a second issue: Google's weather service returned "not supported for this location" for it, so even inside the window Tokyo would fall back to typical-for-the-month.

## What changes

- Move both demos into the forecast window: start 3 days from today, 5 days long (through day 7). Every demo day then shows the real per-part forecast, warnings on open-air stops, and plan B where rain lands.
- Keep the typical-for-the-month fallback exactly as it is — it still covers trips booked far ahead and cities Google doesn't forecast.
- Re-check Tokyo against the live weather service. If it still returns unsupported, leave Tokyo as the demo that shows the typical-month path (that contrast is honest and useful), and say so in the demo button area only if it currently misleads.

Nothing else about the demos changes — same restaurants, sources, taste profile, and generated days.

## Technical notes

- `buildDemoTrip` in `src/lib/mise/demo.ts`: change `startDate: iso(21)` / `endDate: iso(25)` to `iso(3)` / `iso(7)`.
- Verify with a browser run: load each demo, confirm the day headers render Morning/Afternoon/Night lines from `partsOfDay` rather than the fallback `dayLine`, and check the console for forecast errors.
- The weather cache key is coordinate-based, not date-based, so no cache invalidation is needed.
