# Mise en Place

Trip planner built around restaurants. TanStack Start (React 19 + SSR server functions), Vite, Tailwind v4, shadcn/ui. Migrated off Lovable — no Lovable packages or services remain.

## Commands
- `npm run dev` — dev server on http://localhost:3000
- `npm run build` / `npm start` — Nitro node-server build in `.output/`
- `npm run lint`, `npx tsc --noEmit`

## Layout
- `src/routes/` — file-based routes; `src/routeTree.gen.ts` is generated, don't edit.
- `src/components/mise/` — app UI (Wizard, Itinerary, BlockPlanner, …); `src/components/ui/` — shadcn primitives.
- `src/lib/mise/` — domain logic (itinerary generation, scoring, hours, weather, time zones).
- `src/lib/mise/places.functions.ts` — the only server code: Google Places (New), Time Zone and Weather APIs, plus Open-Meteo fallback.
- `src/server.ts` — SSR entry wrapper that turns swallowed h3 errors into an HTML error page.
- `docs/lovable-plans/` — feature plans from the Lovable era, useful history.

## Environment
- `GOOGLE_MAPS_API_KEY` in `.env` (server-only; never expose via `VITE_`). `.env` is gitignored; template in `.env.example`.

## Deployment
- GitHub: https://github.com/AlejandraLlanza/mise-en-place (public — never commit secrets).
- Vercel project `mise-en-place` auto-deploys every push to `main` → https://mise-en-place-alejandra-c11d.vercel.app
- Nitro auto-detects the `vercel` preset there; don't hardcode a preset in `vite.config.ts`.
- `GOOGLE_MAPS_API_KEY` is set in Vercel project env vars; changing it needs a redeploy.
