import { useState } from "react";
import { SOURCE_TYPES } from "@/lib/mise/data";
import {
  blankSource,
  detectSocialUrl,
  looksLikeCsv,
  looksLikeWhatsAppExport,
  SOCIAL_MESSAGE,
  TRUSTS,
  type Source,
  type Trust,
} from "@/lib/mise/sources";
import type { SourceType } from "@/lib/mise/types";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shapeNote(s: Source): string | null {
  if (looksLikeCsv(s.text, s.fileName ?? ""))
    return "Read as a Google Maps saved-list export";
  if (looksLikeWhatsAppExport(s.text)) return "Read as a WhatsApp chat export";
  return null;
}

export function SourcesInbox({
  sources,
  setSources,
  compact = false,
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
}: {
  sources: Source[];
  setSources: (updater: (s: Source[]) => Source[]) => void;
  compact?: boolean;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}) {
  const [draft, setDraft] = useState<Source>(() => blankSource());
  const [dropping, setDropping] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const social = detectSocialUrl(draft.text);
  const canAdd = draft.text.trim().length > 2 && !(!!social && draft.text.trim() === social);

  const commit = (extra?: Partial<Source>) => {
    const next: Source = {
      ...draft,
      ...extra,
      addedAt: new Date().toISOString(),
      text: (extra?.text ?? draft.text).trim(),
    };
    if (!next.text) return;
    setSources((list) => [...list, next]);
    setDraft({ ...blankSource(next.kind), name: next.name, trust: next.trust });
  };

  const readFiles = async (files: FileList | File[]) => {
    setFileNote(null);
    for (const file of Array.from(files)) {
      const ok = /\.(txt|csv)$/i.test(file.name) || /text|csv/.test(file.type);
      if (!ok) {
        setFileNote(`${file.name} isn't a .txt or .csv file, so I skipped it.`);
        continue;
      }
      const text = await file.text();
      if (!text.trim()) continue;
      setSources((list) => [
        ...list,
        {
          ...blankSource(draft.kind),
          name: draft.name,
          trust: draft.trust,
          text: text.trim(),
          fileName: file.name,
          addedAt: new Date().toISOString(),
        },
      ]);
    }
  };

  const patch = (id: string, p: Partial<Source>) =>
    setSources((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));

  return (
    <section className="space-y-5">
      {!compact && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl">Your sources</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every paste, chat export and saved list is kept as its own card, with who
                it came from, when, and how much you trust them. You can come back and add
                more at any time.
              </p>
            </div>
            {onContinue && (
              <button
                type="button"
                disabled={continueDisabled}
                onClick={onContinue}
                className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
              >
                {continueLabel}
              </button>
            )}
          </div>
          {sources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add a paste, a dropped file, or a CSV to continue.
            </p>
          )}
        </>
      )}

      {sources.length > 0 && (
        <ul className="space-y-3">
          {sources.map((s) => {
            const note = shapeNote(s);
            return (
              <li key={s.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="w-40 rounded border border-input bg-paper px-2 py-1 text-sm"
                    placeholder="who is this?"
                    value={s.name}
                    onChange={(e) => patch(s.id, { name: e.target.value })}
                  />
                  <select
                    className="rounded border border-input bg-paper px-2 py-1 text-xs"
                    value={s.kind}
                    onChange={(e) => patch(s.id, { kind: e.target.value as SourceType })}
                  >
                    {SOURCE_TYPES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <TrustDial value={s.trust} onChange={(t) => patch(s.id, { trust: t })} />
                  <span className="label-caps ml-auto text-muted-foreground">
                    {s.fileName ? `${s.fileName} · ` : ""}
                    {formatWhen(s.addedAt)}
                  </span>
                </div>
                {note && <p className="mt-2 text-xs text-primary">{note}</p>}
                <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {s.text}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs text-muted-foreground underline"
                  onClick={() => setSources((list) => list.filter((x) => x.id !== s.id))}
                >
                  Remove this source
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          void readFiles(e.dataTransfer.files);
        }}
        className={`space-y-3 rounded-md border p-4 transition-colors ${
          dropping ? "border-primary bg-primary/5" : "border-dashed border-rule"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-40 rounded border border-input bg-paper px-2 py-1 text-sm"
            placeholder="who is this?"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <select
            className="rounded border border-input bg-paper px-2 py-1 text-xs"
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as SourceType })}
          >
            {SOURCE_TYPES.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <TrustDial value={draft.trust} onChange={(t) => setDraft({ ...draft, trust: t })} />
        </div>

        <textarea
          className="min-h-32 w-full rounded border border-input bg-paper px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="Paste a message, a blog paragraph, a list… or drop a WhatsApp .txt export or a Google Maps .csv here."
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />

        {social && (
          <p className="rounded border border-primary/40 bg-primary/5 p-3 text-xs text-primary">
            {SOCIAL_MESSAGE}
            <span className="mt-1 block break-all text-muted-foreground">{social}</span>
          </p>
        )}
        {fileNote && <p className="text-xs text-muted-foreground">{fileNote}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => commit()}
            className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          >
            Save this source
          </button>
          <label className="cursor-pointer text-xs underline">
            or choose a .txt / .csv file
            <input
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void readFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground">
            Drag a file anywhere in this box.
          </span>
        </div>
      </div>
    </section>
  );
}

function TrustDial({
  value,
  onChange,
}: {
  value: Trust;
  onChange: (t: Trust) => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-border">
      {TRUSTS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          title={`Trust: ${t}`}
          className={`px-2.5 py-1 text-[11px] ${
            value === t ? "bg-primary text-primary-foreground" : "bg-paper"
          }`}
        >
          {t}
        </button>
      ))}
    </span>
  );
}
