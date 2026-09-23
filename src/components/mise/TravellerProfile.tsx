import {
  describeTravel,
  interestsFromText,
  INTERESTS,
  PACES,
  PACE_NOTE,
  blankTravel,
  paceFromText,
  type Pace,
  type TravelProfile,
} from "@/lib/mise/travel";

/** What kind of traveller are you — free text, interest chips, and a pace. */
export function TravellerProfile({
  travel,
  setTravel,
}: {
  travel: TravelProfile;
  setTravel: (t: TravelProfile) => void;
}) {
  const suggested = interestsFromText(travel.description);

  const onText = (text: string) => {
    const add = interestsFromText(text).filter((c) => !travel.interests.includes(c));
    const pace = paceFromText(text);
    setTravel({
      ...travel,
      description: text,
      interests: [...travel.interests, ...add],
      pace: pace ?? travel.pace,
    });
  };

  const toggle = (chip: string) =>
    setTravel({
      ...travel,
      interests: travel.interests.includes(chip)
        ? travel.interests.filter((c) => c !== chip)
        : [...travel.interests, chip],
    });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl">What kind of traveller are you?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Meals are the spine of the trip. This is everything in between.
        </p>
      </div>

      <div className="space-y-2">
        <p className="label-caps text-muted-foreground">
          What do you actually want to see?
        </p>
        <textarea
          rows={3}
          className="w-full rounded-md border border-border bg-paper px-3 py-2 text-sm"
          placeholder="e.g. modernist architecture, one good market, long walks, nothing rushed"
          value={travel.description}
          onChange={(e) => onText(e.target.value)}
        />
      </div>

      <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
        <p className="label-caps text-primary">What we understood</p>
        <p className="mt-2 text-sm">{describeTravel(travel)}</p>
        {suggested.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            From your description we pre-selected: {suggested.join(", ")}. Edit anything
            below.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <p className="label-caps text-muted-foreground">Interests</p>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((chip) => {
            const on = travel.interests.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() => toggle(chip)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-paper hover:border-rule"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <p className="label-caps text-muted-foreground">Pace</p>
        <div className="flex flex-wrap gap-2">
          {PACES.map((p: Pace) => (
            <button
              key={p}
              type="button"
              onClick={() => setTravel({ ...travel, pace: p })}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                travel.pace === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-paper hover:border-rule"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{PACE_NOTE[travel.pace]}</p>
      </div>
    </section>
  );
}

export { blankTravel };
