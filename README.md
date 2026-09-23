# Mise en Place

A trip planner built around restaurants. Originally generated with Lovable, now a standalone project.

## Stack

TanStack Start (React 19, SSR + server functions) · Vite · Tailwind CSS v4 · shadcn/ui · Nitro (Node server build)

## Setup

1. Install [Node.js LTS](https://nodejs.org).
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a Google Maps Platform API key (see below) and put it in `.env`:
   ```sh
   GOOGLE_MAPS_API_KEY=your-key
   ```
4. Run it:
   ```sh
   npm run dev      # http://localhost:3000
   ```

## Google Maps Platform key

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project and enable billing (these APIs have a free monthly tier).
2. Enable **Places API (New)**, **Time Zone API** and **Weather API**.
3. Create an API key under *APIs & Services → Credentials* and restrict it to those three APIs.

The key is used only on the server (`src/lib/mise/places.functions.ts`) and never reaches the browser.
Without a key the app still loads; place search shows "Google Maps is not connected." Weather falls
back to Open-Meteo (no key) where Google has no forecast.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build to `.output/` |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
