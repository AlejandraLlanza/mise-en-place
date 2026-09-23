# A backup weather source for cities Google doesn't cover

Google's weather service has no data for some cities — Tokyo is one — so those trips
currently fall back to "typical for September, not a forecast" with no morning /
afternoon / night breakdown and no rain warnings.

## What changes

When Google returns nothing for a place, the app quietly asks a second free weather
service (Open-Meteo) for the same ten days and hourly detail, then shows it exactly
like a Google forecast: real highs and lows, conditions, chance of rain, the
morning / afternoon / night lines, warnings and plan B.

- The traveller sees no difference and no extra setting — it just works in more cities.
- If both services come up empty, the honest "typical for the month, not a forecast"
  line stays as today.
- No new account, key, or cost: Open-Meteo is free and needs no sign-up.

Result: the Tokyo demo shows a real forecast instead of monthly averages.

## Technical notes

- In `lookupForecast` (`src/lib/mise/places.functions.ts`), a Google 404 (already
  handled as "no data") triggers a second fetch to
  `https://api.open-meteo.com/v1/forecast` with `daily=temperature_2m_max,
  temperature_2m_min,precipitation_probability_max,weather_code`,
  `hourly=temperature_2m,precipitation_probability,weather_code`,
  `forecast_days=10`, `timezone=UTC`.
- Map WMO `weather_code` to the same plain-language condition strings Google returns
  ("Cloudy", "Light rain", …) via a small lookup table, so `dayLine`, `partsOfDay`,
  and the warning logic need no changes.
- Hourly `startTime` values are emitted as UTC ISO strings, matching the existing
  `ForecastPayload` shape — destination-timezone bucketing in `weather.ts` is untouched.
- Payload shape, six-hour localStorage cache, and all UI code stay as they are.
