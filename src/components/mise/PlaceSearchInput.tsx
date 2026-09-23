import { useEffect, useRef, useState } from "react";
import { lookupPlaces } from "@/lib/mise/placeCache";
import type { PlaceData } from "@/lib/mise/places.functions";

export function PlaceSearchInput({
  value,
  city,
  onChange,
  onPick,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  city: string;
  onChange: (name: string) => void;
  onPick: (place: PlaceData) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [hits, setHits] = useState<PlaceData[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const skipRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setHits([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await lookupPlaces(q, city);
        if (cancelled) return;
        setHits(res);
        setFailed(false);
        setOpen(res.length > 0);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, city]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          searching…
        </span>
      )}
      {open && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-paper shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  skipRef.current = true;
                  onPick(h);
                  setOpen(false);
                }}
              >
                <span className="font-display text-base">{h.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {h.address}
                  {h.rating != null
                    ? ` · ${h.rating.toFixed(1)} (${h.userRatingCount ?? 0})`
                    : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <p className="mt-1 text-xs text-muted-foreground">
          Couldn't reach Google Maps — keep the name you typed and fill the rest by hand.
        </p>
      )}
    </div>
  );
}
