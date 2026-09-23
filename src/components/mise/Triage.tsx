import { useEffect, useMemo, useState } from "react";
import { mentionCount, recommenders } from "@/lib/mise/sources";
import type { Candidate } from "@/lib/mise/types";

type Verdict = "keep" | "maybe" | "discard";
type Tab = "restaurant" | "activity";

const TAB_LABEL: Record<Tab, string> = {
  restaurant: "Restaurants",
  activity: "Things to do",
};

/** Fast one-at-a-time keep / maybe / discard pass, one pool per tab. */
export function Triage({
  candidates,
  onDone,
  onSkip,
}: {
  candidates: Candidate[];
  onDone: (decided: Candidate[]) => void;
  onSkip: () => void;
}) {
  const pools = useMemo(() => {
    const restaurant = candidates.filter((c) => (c.kind ?? "restaurant") !== "activity");
    const activity = candidates.filter((c) => c.kind === "activity");
    return { restaurant, activity };
  }, [candidates]);

  const [tab, setTab] = useState<Tab>(
    pools.restaurant.length > 0 ? "restaurant" : "activity",
  );
  const [index, setIndex] = useState<Record<Tab, number>>({
    restaurant: 0,
    activity: 0,
  });
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  const list = pools[tab];
  const at = index[tab];
  const current = list[at];

  const decide = (v: Verdict) => {
    const c = list[at];
    if (!c) return;
    setVerdicts((prev) => ({ ...prev, [c.id]: v }));
    setIndex((prev) => ({ ...prev, [tab]: prev[tab] + 1 }));
  };

  const back = () =>
    setIndex((prev) => ({ ...prev, [tab]: Math.max(0, prev[tab] - 1) }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "k") decide("keep");
      else if (k === "m") decide("maybe");
      else if (k === "d" || k === "x") decide("discard");
      else if (k === "u" || k === "arrowleft" || k === "backspace") back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finish = () =>
    onDone(
      candidates.map((c) => {
        const v = verdicts[c.id] ?? "keep";
        return { ...c, triage: v, include: v !== "discard" };
      }),
    );

  const remaining = (t: Tab) => Math.max(0, pools[t].length - index[t]);
  const allDone = remaining("restaurant") === 0 && remaining("activity") === 0;

  const tabs = (
    <div className="flex flex-wrap items-center gap-2">
      {(["restaurant", "activity"] as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={`rounded-full border px-3.5 py-1.5 text-sm ${
            tab === t
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-paper hover:border-rule"
          }`}
        >
          {TAB_LABEL[t]}
          <span className="ml-1.5 opacity-70">{pools[t].length}</span>
        </button>
      ))}
    </div>
  );

  if (!current) {
    const other: Tab = tab === "restaurant" ? "activity" : "restaurant";
    const kept = candidates.filter((c) => (verdicts[c.id] ?? "keep") !== "discard").length;
    return (
      <section className="space-y-5">
        <h2 className="text-2xl">
          {allDone ? "Triage done" : `${TAB_LABEL[tab]} done`}
        </h2>
        {tabs}
        <p className="text-sm text-muted-foreground">
          {kept} of {candidates.length} entries are going into the pool
          {remaining(other) > 0
            ? ` — ${remaining(other)} left under ${TAB_LABEL[other].toLowerCase()}.`
            : ". You can still fix any field on the next screen."}
        </p>
        <div className="flex flex-wrap gap-3">
          {remaining(other) > 0 && (
            <button
              type="button"
              className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
              onClick={() => setTab(other)}
            >
              Go through {TAB_LABEL[other].toLowerCase()}
            </button>
          )}
          <button
            type="button"
            className={`rounded-full px-5 py-2 text-sm ${
              remaining(other) > 0
                ? "border border-rule"
                : "bg-primary text-primary-foreground"
            }`}
            onClick={finish}
          >
            Continue to the review table
          </button>
          {at > 0 && (
            <button
              type="button"
              className="rounded-full border border-rule px-4 py-2 text-sm"
              onClick={back}
            >
              Back one
            </button>
          )}
        </div>
      </section>
    );
  }

  const mentions = mentionCount(current);
  const who = recommenders(current);
  const isActivity = current.kind === "activity";

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl">Keep or cut</h2>
        <span className="label-caps text-muted-foreground">
          {at + 1} / {list.length}
        </span>
      </div>

      {tabs}

      <article className="printed rounded-lg border border-border p-6">
        <p className="label-caps text-primary">
          {isActivity ? (current.noPlace ? "Note · thing to do" : "Thing to do") : "Restaurant"}
        </p>
        <p className="mt-1 font-display text-3xl">{current.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {[
            current.place?.address ?? current.address,
            current.neighborhood,
            isActivity ? "" : "$".repeat(current.price),
            current.noPlace
              ? "a note, not a pin"
              : current.place?.rating != null
                ? `${current.place.rating.toFixed(1)} (${current.place.userRatingCount ?? 0})`
                : "no Google match",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {mentions > 1 && (
          <p className="mt-3 inline-block rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
            {mentions} people recommended this
          </p>
        )}
        {current.quote && (
          <blockquote className="mt-4 border-l-2 border-primary pl-3 text-sm italic">
            {who[0] ? `${who[0]}: ` : ""}
            {current.quote}
          </blockquote>
        )}
        {current.tags.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{current.tags.join(" · ")}</p>
        )}
      </article>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
          onClick={() => decide("keep")}
        >
          Keep <span className="opacity-70">(K)</span>
        </button>
        <button
          type="button"
          className="rounded-full border border-rule px-5 py-2 text-sm"
          onClick={() => decide("maybe")}
        >
          Maybe <span className="opacity-70">(M)</span>
        </button>
        <button
          type="button"
          className="rounded-full border border-rule px-5 py-2 text-sm"
          onClick={() => decide("discard")}
        >
          Discard <span className="opacity-70">(D)</span>
        </button>
        <button type="button" className="text-sm underline" onClick={back}>
          Undo (U)
        </button>
        <button
          type="button"
          className="ml-auto text-sm underline text-muted-foreground"
          onClick={onSkip}
        >
          Skip triage
        </button>
      </div>
    </section>
  );
}
