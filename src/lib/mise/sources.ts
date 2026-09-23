import { classifyText } from "./kind";
import { parseBlob, uid } from "./parse";
import type { Candidate, SourceType } from "./types";

export type Trust = "low" | "normal" | "high";

export const TRUSTS: Trust[] = ["low", "normal", "high"];

/** How the trust dial nudges the ranking. */
export const TRUST_WEIGHT: Record<Trust, number> = { low: -6, normal: 0, high: 8 };

export interface Source {
  id: string;
  /** Who this came from — "Isabel", "Eater LA", "me". */
  name: string;
  trust: Trust;
  kind: SourceType;
  /** ISO timestamp of when it was added. */
  addedAt: string;
  /** The original text, kept verbatim. */
  text: string;
  fileName?: string;
}

export interface Mention {
  sourceId: string;
  via: string;
  trust: Trust;
  /** The verbatim sentence this restaurant came from. Never paraphrased. */
  quote: string;
}

export function blankSource(kind: SourceType = "friend rec"): Source {
  return {
    id: uid(),
    name: "",
    trust: "normal",
    kind,
    addedAt: new Date().toISOString(),
    text: "",
  };
}

/* ---------------------------------------------------------------- social */

const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(instagram\.com|instagr\.am|tiktok\.com|vm\.tiktok\.com)\/\S*/i;

/** Instagram / TikTok links can't be read — the platforms block it. */
export function detectSocialUrl(text: string): string | null {
  return text.match(SOCIAL_RE)?.[0] ?? null;
}

export const SOCIAL_MESSAGE =
  "I can't read the link — Instagram and TikTok block it. Paste the caption text or drop a screenshot's text instead.";

/* -------------------------------------------------------------- whatsapp */

export interface WaMessage {
  author: string;
  body: string;
}

const WA_LINE =
  /^\u200e?\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap]\.?[Mm]\.?)?\]?\s*[-–]?\s*([^:]{1,45}?):\s*([\s\S]*)$/;

export function looksLikeWhatsAppExport(text: string): boolean {
  const lines = text.split(/\r?\n/).slice(0, 40).filter(Boolean);
  if (lines.length < 2) return false;
  const hits = lines.filter((l) => WA_LINE.test(l)).length;
  return hits >= Math.max(2, Math.floor(lines.length * 0.3));
}

/** Parse WhatsApp "Export chat" output into one entry per message. */
export function parseWhatsAppExport(text: string): WaMessage[] {
  const out: WaMessage[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(WA_LINE);
    if (m) {
      const body = (m[3] ?? "").trim();
      if (!body || /^(<Media omitted>|null|image omitted|sticker omitted)$/i.test(body))
        continue;
      out.push({ author: (m[2] ?? "").trim(), body });
    } else if (out.length) {
      // continuation of the previous message
      const last = out[out.length - 1]!;
      last.body = `${last.body} ${line}`.trim();
    }
  }
  return out;
}

/* ------------------------------------------------------------------- csv */

export interface CsvRow {
  name: string;
  note: string;
  url: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function looksLikeCsv(text: string, fileName = ""): boolean {
  if (fileName.toLowerCase().endsWith(".csv")) return true;
  const first = text.split(/\r?\n/)[0] ?? "";
  return /title/i.test(first) && /url|note/i.test(first) && first.includes(",");
}

/** Google Maps saved-list export: Title, Note, URL. */
export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  let nameAt = idx(["title", "name"]);
  let noteAt = idx(["note", "comment", "description"]);
  let urlAt = idx(["url", "link"]);
  let body = lines.slice(1);
  if (nameAt < 0) {
    nameAt = 0;
    noteAt = 1;
    urlAt = 2;
    body = lines;
  }
  const rows: CsvRow[] = [];
  for (const line of body) {
    const cells = splitCsvLine(line);
    const name = (cells[nameAt] ?? "").replace(/^"|"$/g, "").trim();
    if (!name) continue;
    rows.push({
      name,
      note: noteAt >= 0 ? (cells[noteAt] ?? "").trim() : "",
      url: urlAt >= 0 ? (cells[urlAt] ?? "").trim() : "",
    });
  }
  return rows;
}

/* ------------------------------------------------------------ extraction */

function withMention(c: Candidate, source: Source, quote: string, via: string): Candidate {
  return {
    ...c,
    source: source.kind,
    via,
    quote,
    sourceIds: [source.id],
    mentions: [{ sourceId: source.id, via, trust: source.trust, quote }],
  };
}

/** Turn one source card into restaurant candidates, keeping the verbatim quote. */
export function extractFromSource(source: Source, city: string): Candidate[] {
  const via = source.name.trim();

  if (looksLikeCsv(source.text, source.fileName ?? "")) {
    return parseCsv(source.text).map((row) => {
      const [base] = parseBlob(
        `${row.name}${row.note ? ` — ${row.note}` : ""}`,
        source.kind,
        via,
        city,
      );
      const quote = row.note.trim() || row.name;
      const seed: Candidate =
        base ??
        ({
          id: uid(),
          name: row.name,
          kind: classifyText(`${row.name} ${row.note}`),
          neighborhood: "",
          price: 2,
          tags: [],
          meals: ["lunch", "dinner"],
          cuisine: "",
          source: source.kind,
          via,
          notes: row.note,
          include: true,
          booking: "Not booked",
          confirmation: "",
        } as Candidate);
      return withMention({ ...seed, name: row.name }, source, quote, via || "your saved list");
    });
  }

  if (looksLikeWhatsAppExport(source.text)) {
    const out: Candidate[] = [];
    for (const msg of parseWhatsAppExport(source.text)) {
      const who = via || msg.author;
      for (const c of parseBlob(msg.body, source.kind, who, city)) {
        out.push(withMention(c, source, msg.body.trim(), who));
      }
    }
    return out;
  }

  return parseBlob(source.text, source.kind, via, city).map((c) =>
    withMention(c, source, (c.quote ?? "").trim() || c.name, via || "your notes"),
  );
}

/* --------------------------------------------------------------- merging */

const nameKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function mergeKey(c: Candidate): string {
  return c.place?.id ? `place:${c.place.id}` : `name:${nameKey(c.name)}`;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function combine(a: Candidate, b: Candidate): Candidate {
  const mentions = [...(a.mentions ?? []), ...(b.mentions ?? [])];
  const seen = new Set<string>();
  const deduped = mentions.filter((m) => {
    const k = `${m.sourceId}|${m.quote}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    ...a,
    name: a.place?.name ?? (a.name.length >= b.name.length ? a.name : b.name),
    ...(a.place ?? b.place ? { place: a.place ?? b.place } : {}),
    address: a.address || b.address || "",
    neighborhood: a.neighborhood || b.neighborhood,
    cuisine: a.cuisine || b.cuisine,
    tags: uniq([...a.tags, ...b.tags]).slice(0, 6),
    meals: uniq([...a.meals, ...b.meals]),
    notes: [a.notes, b.notes].filter(Boolean).join(" · "),
    quote: a.quote || b.quote || "",
    kind: (a.place ? a.kind : undefined) ?? a.kind ?? b.kind ?? "restaurant",
    noPlace: Boolean(a.noPlace && b.noPlace),
    sourceIds: uniq([...(a.sourceIds ?? []), ...(b.sourceIds ?? [])]),
    mentions: deduped,
    isAnchor: Boolean(a.isAnchor || b.isAnchor),
  };
}

/**
 * Collapse duplicates across every source into one restaurant, so "Contramar",
 * "contramar roma norte" and "the tuna tostada place" become a single entry
 * with a mention count.
 */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const index = new Map<string, number>();
  for (const c of list) {
    const key = mergeKey(c);
    const at = index.get(key);
    if (at == null) {
      index.set(key, out.length);
      out.push({ ...c, mentions: c.mentions ?? [] });
    } else {
      out[at] = combine(out[at]!, c);
    }
  }
  return out;
}

export function mentionCount(c: Candidate): number {
  return Math.max(1, c.mentions?.length ?? 1);
}

export function bestTrust(c: Candidate): Trust {
  const trusts = (c.mentions ?? []).map((m) => m.trust);
  if (trusts.includes("high")) return "high";
  if (trusts.includes("normal") || trusts.length === 0) return "normal";
  return "low";
}

export function recommenders(c: Candidate): string[] {
  return [...new Set((c.mentions ?? []).map((m) => m.via).filter(Boolean))];
}
