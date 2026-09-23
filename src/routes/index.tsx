import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Itinerary } from "@/components/mise/Itinerary";
import { Wizard } from "@/components/mise/Wizard";
import { buildDemoTrip, type DemoKind } from "@/lib/mise/demo";
import { generateDays } from "@/lib/mise/generate";
import { resolveCandidates } from "@/lib/mise/placeCache";
import { mergeCandidates } from "@/lib/mise/sources";
import { loadTrip, saveTrip } from "@/lib/mise/store";
import type { Trip } from "@/lib/mise/types";

const title = "Mise en Place — a trip planner built around restaurants";
const description =
  "Start with the restaurants you're determined to eat at, and let the sights fill the gaps. Paste your recommendations, get a day-by-day itinerary.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

function Index() {
  const [trip, setTripState] = useState<Trip | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTripState(loadTrip());
    setHydrated(true);
  }, []);

  const setTrip = (t: Trip | null) => {
    setTripState(t);
    saveTrip(t);
  };

  // Demo trip shows immediately; real Google data fills in a moment later.
  const loadDemo = (kind: DemoKind = "mexico-city") => {
    const t = buildDemoTrip(kind);
    setTrip(t);
    void resolveCandidates(t.candidates, t.basics.city).then((candidates) => {
      // Re-merge once places are known: "contramar roma norte" collapses into
      // Contramar and the mention count adds up.
      const merged = mergeCandidates(candidates);
      setTrip({
        ...t,
        candidates: merged,
        days: generateDays(t.days, merged, t.prefs, { keepBooked: true }),
      });
    });
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="label-caps text-muted-foreground">Mise en Place</p>
      </main>
    );
  }

  if (!trip) {
    return (
      <main>
        <Wizard onComplete={setTrip} onLoadDemo={loadDemo} />
      </main>
    );
  }

  return (
    <main>
      <Itinerary
        trip={trip}
        setTrip={setTrip}
        onStartOver={() => setTrip(null)}
      />
    </main>
  );
}
