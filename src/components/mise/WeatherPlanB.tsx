import { useEffect, useState } from "react";
import { indoorAlternatives, type BlockContext, type BlockSuggestion } from "@/lib/mise/blocks";
import { mapsSearchUrl, placeQuery } from "@/lib/mise/maps";
import type { Candidate } from "@/lib/mise/types";

/**
 * Wet-weather plan B: indoor things the traveller already collected, then
 * indoor places around the same spot. Never invented, never auto-applied.
 */
export function WeatherPlanB({
  ctx,
  pool,
  radius,
  taken,
  warning,
  replacing,
  onPick,
}: {
  ctx: BlockContext;
  pool: Candidate[];
  radius: number;
  taken: Set<string>;
  warning: string;
  replacing: string;
  onPick: (c: Candidate) => void;
}) {
  const [items, setItems] = useState<BlockSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    indoorAlternatives(ctx, pool, radius, taken)
      .then((found) => alive && setItems(found))
      .catch(() => alive && setError("Couldn't reach Google just now."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="label-caps text-primary">Plan B</p>
      <h3 className="mt-1 text-2xl">Somewhere under a roof</h3>
      <p className="mt-2 text-sm text-destructive">{warning}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Indoor options open at that hour, near where you're eating. Picking one
        replaces {replacing} for this day — it stays on your list for another.
      </p>

      <ul className="mt-5 space-y-3">
        {(items ?? []).map((s) => (
          <li key={s.candidate.id} className="border-t border-rule pt-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-lg">{s.candidate.name}</span>
              <span className="label-caps text-muted-foreground">
                {s.candidate.place?.primaryType?.replace(/_/g, " ") ?? "indoors"}
              </span>
              {s.fromSources && (
                <span className="label-caps text-primary">from your sources</span>
              )}
            </div>
            {s.why && <p className="mt-1 text-xs text-muted-foreground">{s.why}</p>}
            {s.hours && <p className="text-xs text-muted-foreground">{s.hours}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button
                className="underline hover:text-primary"
                onClick={() => onPick(s.candidate)}
              >
                Swap it in
              </button>
              <a
                className="underline hover:text-primary"
                href={mapsSearchUrl(
                  placeQuery(s.candidate.name, s.candidate.address, ctx.city),
                )}
                target="_blank"
                rel="noreferrer"
              >
                View map
              </a>
            </div>
          </li>
        ))}
        {items && items.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {error ?? "Nothing indoors nearby is open then — an umbrella it is."}
          </li>
        )}
        {!items && !error && (
          <li className="text-sm text-muted-foreground">Looking for somewhere dry…</li>
        )}
      </ul>
    </>
  );
}
