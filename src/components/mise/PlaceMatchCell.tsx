import { useState } from "react";
import { PlaceSearchInput } from "@/components/mise/PlaceSearchInput";
import type { PlaceData } from "@/lib/mise/places.functions";

export function PlaceMatchCell({
  name,
  city,
  place,
  resolving,
  onPick,
  onClear,
}: {
  name: string;
  city: string;
  place: PlaceData | null | undefined;
  resolving: boolean;
  onPick: (place: PlaceData) => void;
  onClear: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState(name);

  if (searching) {
    return (
      <div className="space-y-1">
        <PlaceSearchInput
          className="w-full rounded border border-input bg-paper px-2 py-1 text-sm"
          value={query}
          city={city}
          autoFocus
          placeholder="Search Google Maps"
          onChange={setQuery}
          onPick={(p) => {
            onPick(p);
            setSearching(false);
          }}
        />
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => {
            onClear();
            setSearching(false);
          }}
        >
          Keep as a manual entry
        </button>
      </div>
    );
  }

  if (resolving) {
    return <span className="text-xs text-muted-foreground">matching…</span>;
  }

  return (
    <div className="space-y-0.5">
      {place ? (
        <>
          <p className="text-xs text-foreground">{place.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {place.address}
            {place.rating != null
              ? ` · ${place.rating.toFixed(1)} (${place.userRatingCount ?? 0})`
              : ""}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No Google match — manual entry
        </p>
      )}
      <button
        type="button"
        className="text-[11px] underline hover:text-primary"
        onClick={() => {
          setQuery(name);
          setSearching(true);
        }}
      >
        {place ? "Wrong match?" : "Search Google Maps"}
      </button>
    </div>
  );
}
