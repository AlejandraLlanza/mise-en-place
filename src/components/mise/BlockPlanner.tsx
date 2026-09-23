import { useEffect, useRef, useState } from "react";
import {
  suggestForBlock,
  suggestionCount,
  type BlockContext,
  type BlockSuggestion,
} from "@/lib/mise/blocks";
import { formatTime } from "@/lib/mise/generate";
import { mapsSearchUrl, placeQuery } from "@/lib/mise/maps";
import { isPast } from "@/lib/mise/tz";
import type { Candidate } from "@/lib/mise/types";

const ghost =
  "rounded-md border border-rule px-2.5 py-1 text-xs hover:border-primary hover:text-primary";

export function BlockPlanner({
  ctx,
  pool,
  radius,
  taken,
  pick,
  timeZone,
  onAccept,
  onFree,
  onClear,
}: {
  ctx: BlockContext;
  pool: Candidate[];
  radius: number;
  taken: Set<string>;
  /** Candidate id, "free", or undefined while undecided. */
  pick: string | undefined;
  timeZone: string | null;
  onAccept: (c: Candidate) => void;
  onFree: () => void;
  onClear: () => void;
}) {
  const [items, setItems] = useState<BlockSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const asked = useRef<string>("");

  const decided = Boolean(pick);
  const past = isPast(ctx.date, ctx.end, timeZone);
  const fromKey = ctx.from ? `${ctx.from.lat.toFixed(4)},${ctx.from.lng.toFixed(4)}` : "";

  useEffect(() => {
    // Wait until the meal this block hangs off has real coordinates.
    if (decided || past || !fromKey || asked.current === fromKey) return;
    asked.current = fromKey;
    setLoading(true);
    suggestForBlock(ctx, pool, radius, taken)
      .then((found) => setItems(found))
      .catch((e) => {
        console.error("block suggestions", e);
        setError("Couldn't reach Google just now.");
      })
      .finally(() => setLoading(false));
    // one fetch per block location — never on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided, past, fromKey, radius]);

  const header = (
    <p className="label-caps text-olive">
      {ctx.fromName
        ? `Between meals · ${formatTime(ctx.start)}–${formatTime(ctx.end)} · from ${ctx.fromName}`
        : `Open block · ${formatTime(ctx.start)}–${formatTime(ctx.end)}`}
    </p>
  );

  if (pick === "free") {
    return (
      <div className="rounded-md border border-dashed border-rule bg-muted/40 px-4 py-3">
        {header}
        <p className="mt-1 text-sm">Free time.</p>
        <button className={`${ghost} mt-2`} onClick={onClear}>
          Suggest something after all
        </button>
      </div>
    );
  }

  const accepted = pick ? pool.find((c) => c.id === pick) : null;
  if (accepted) {
    return (
      <div className="rounded-md border border-rule bg-card px-4 py-3">
        {header}
        <p className="mt-1 text-base">{accepted.name}</p>
        {accepted.notes && (
          <p className="text-xs text-muted-foreground">{accepted.notes}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <a
            className="underline hover:text-primary"
            href={mapsSearchUrl(
              placeQuery(accepted.name, accepted.address, ctx.city),
            )}
            target="_blank"
            rel="noreferrer"
          >
            View map
          </a>
          <button className="underline hover:text-primary" onClick={onClear}>
            Swap
          </button>
          <button className="underline hover:text-primary" onClick={onFree}>
            Make it free time
          </button>
        </div>
      </div>
    );
  }

  const want = suggestionCount(ctx.prefs);
  const shown = (items ?? []).slice(offset, offset + want);

  return (
    <div className="rounded-md border border-dashed border-rule bg-muted/40 px-4 py-3">
      {header}
      <p className="mt-1 text-sm text-muted-foreground">
        {loading || (!items && !past && !error)
          ? "Looking for things open around here…"
          : past
            ? "This block has already passed."
            : shown.length === 0
              ? error ?? "Nothing open nearby fits this window — free time."
              : "Picked because of where you're eating:"}
      </p>

      {shown.length > 0 && (
        <ul className="mt-3 space-y-3">
          {shown.map((s) => (
            <li key={s.candidate.id} className="border-t border-rule pt-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base">{s.candidate.name}</span>
                <span className="label-caps text-muted-foreground">
                  {s.candidate.place?.primaryType?.replace(/_/g, " ") ??
                    "thing to do"}
                </span>
                {s.fromSources && (
                  <span className="label-caps text-primary">from your sources</span>
                )}
              </div>
              {s.why && (
                <p className="mt-1 text-xs text-muted-foreground">{s.why}</p>
              )}
              {s.hours && (
                <p className="text-xs text-muted-foreground">{s.hours}</p>
              )}
              {s.candidate.quote && (
                <p className="mt-1 text-xs italic">“{s.candidate.quote}”</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <button
                  className="underline hover:text-primary"
                  onClick={() => onAccept(s.candidate)}
                >
                  Add to this block
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
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {(items?.length ?? 0) > offset + want && (
          <button
            className="underline hover:text-primary"
            onClick={() => setOffset(offset + want)}
          >
            Show other options
          </button>
        )}
        <button className="underline hover:text-primary" onClick={onFree}>
          Keep it free time
        </button>
      </div>
    </div>
  );
}
