import type { Message } from "@openloop-bench/schema";
import type { ExtractionThread } from "./loader.js";

export type RedactionKind = "person" | "organization" | "email" | "phone" | "url";

export interface RedactionSegment {
  readonly kind: RedactionKind;
  readonly originalStart: number;
  readonly originalEnd: number;
  readonly redactedStart: number;
  readonly redactedEnd: number;
  readonly originalText: string;
  readonly replacement: string;
}

export interface OffsetMap {
  readonly originalLength: number;
  readonly redactedLength: number;
  readonly segments: readonly RedactionSegment[];
}

export interface RedactedText {
  readonly text: string;
  readonly offsetMap: OffsetMap;
}

export interface RedactedThread {
  readonly thread: ExtractionThread;
  readonly messageMaps: ReadonlyMap<number, OffsetMap>;
}

export interface OffsetMapping {
  readonly ok: true;
  readonly offset: number;
}

export interface UnmappableOffset {
  readonly ok: false;
  readonly reason: "inside_redaction";
  readonly offset: number;
  readonly segment: RedactionSegment;
}

export interface SpanMapping {
  readonly ok: true;
  readonly span: { readonly msg_index: number; readonly start: number; readonly end: number };
}

export interface UnmappableSpan {
  readonly ok: false;
  readonly span: { readonly msg_index: number; readonly start: number; readonly end: number };
  readonly reason: "missing_message_map" | "inside_redaction" | "invalid_span";
  readonly field: string;
}

interface PlannedReplacement {
  readonly kind: RedactionKind;
  readonly replacement: string;
}

export interface RedactionPlan {
  readonly entities: ReadonlyMap<string, PlannedReplacement>;
}

interface Match {
  readonly start: number;
  readonly end: number;
  readonly kind: RedactionKind;
  readonly replacement?: string;
}

const PERSON_NAMES = [
  "aarti",
  "aditya",
  "anita",
  "anjali",
  "ankit",
  "arjun",
  "bala",
  "bhavna",
  "charu",
  "deepak",
  "dinesh",
  "divya",
  "farhan",
  "fatima",
  "gopal",
  "harsha",
  "imran",
  "ishaan",
  "kabir",
  "karthik",
  "kavya",
  "lakshmi",
  "manoj",
  "meera",
  "meghna",
  "nandini",
  "naveen",
  "neha",
  "nikhil",
  "nitin",
  "pooja",
  "prakash",
  "preethi",
  "priya",
  "raghav",
  "rahul",
  "ravi",
  "reema",
  "rohit",
  "sanjay",
  "shalini",
  "sneha",
  "sridhar",
  "sunita",
  "suresh",
  "tanvi",
  "tejas",
  "vikram",
  "vinod",
  "waseem",
  "yasmin",
];

const ORG_WORDS = [
  "agency",
  "bank",
  "capital",
  "client",
  "company",
  "corp",
  "corporation",
  "inc",
  "insurance",
  "labs",
  "llc",
  "llp",
  "office",
  "procurement",
  "pvt",
  "systems",
  "technologies",
  "vendor",
  "ventures",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalized(text: string): string {
  return text.toLowerCase().trim();
}

function senderAliases(sender: string): string[] {
  const aliases = new Set<string>();
  const stripped = sender.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (stripped) aliases.add(stripped);
  const beforeParen = sender.split("(")[0]?.trim();
  if (beforeParen) aliases.add(beforeParen);
  if (sender.trim()) aliases.add(sender.trim());
  return [...aliases].filter((alias) => alias.length > 1);
}

function entityKind(alias: string): RedactionKind {
  const lower = normalized(alias);
  return ORG_WORDS.some((word) => new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}([^a-z0-9]|$)`, "i").test(lower))
    ? "organization"
    : "person";
}

export function buildRedactionPlan(
  senders: readonly string[],
  extraOrganizations: readonly string[] = [],
): RedactionPlan {
  const entities = new Map<string, PlannedReplacement>();
  const counters: Record<RedactionKind, number> = {
    person: 0,
    organization: 0,
    email: 0,
    phone: 0,
    url: 0,
  };

  const addEntity = (alias: string, kind: RedactionKind): void => {
    const key = normalized(alias);
    if (!key || key === "user" || entities.has(key)) return;
    counters[kind]++;
    entities.set(key, { kind, replacement: `[${kind.toUpperCase()}_${counters[kind]}]` });
  };

  for (const sender of senders) {
    if (sender === "user") continue;
    const aliases = senderAliases(sender);
    const kind = entityKind(sender);
    for (const alias of aliases) addEntity(alias, kind);
  }
  for (const name of PERSON_NAMES) addEntity(name, "person");
  for (const org of extraOrganizations) addEntity(org, "organization");

  return { entities };
}

function collectPatternMatches(text: string): Match[] {
  const patterns: Array<{ kind: RedactionKind; regex: RegExp }> = [
    { kind: "url", regex: /\b(?:https?:\/\/|www\.)[^\s<>"')]+/giu },
    { kind: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu },
    { kind: "phone", regex: /(?:\+?\d[\d\s().-]{7,}\d)/gu },
    {
      kind: "organization",
      regex: /\b[A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*)*\s+(?:Inc|LLC|LLP|Ltd|Labs|Systems|Technologies|Ventures|Capital|Corp|Corporation)\b/gu,
    },
  ];

  const matches: Match[] = [];
  for (const { kind, regex } of patterns) {
    for (const match of text.matchAll(regex)) {
      if (match.index === undefined) continue;
      matches.push({ start: match.index, end: match.index + match[0].length, kind });
    }
  }
  return matches;
}

function collectEntityMatches(text: string, plan: RedactionPlan): Match[] {
  const matches: Match[] = [];
  const entities = [...plan.entities].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, replacement] of entities) {
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of text.matchAll(regex)) {
      if (match.index === undefined) continue;
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: replacement.kind,
        replacement: replacement.replacement,
      });
    }
  }
  return matches;
}

function replacementFor(kind: RedactionKind, counters: Record<RedactionKind, number>): string {
  counters[kind]++;
  return `[${kind.toUpperCase()}_${counters[kind]}]`;
}

function selectMatches(matches: readonly Match[]): Match[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const selected: Match[] = [];
  let cursor = 0;
  for (const match of sorted) {
    if (match.start < cursor) continue;
    selected.push(match);
    cursor = match.end;
  }
  return selected;
}

export function redactText(text: string, plan: RedactionPlan): RedactedText {
  const counters: Record<RedactionKind, number> = {
    person: plan.entities.size,
    organization: 0,
    email: 0,
    phone: 0,
    url: 0,
  };
  const matches = selectMatches([...collectPatternMatches(text), ...collectEntityMatches(text, plan)]);
  const segments: RedactionSegment[] = [];
  let cursor = 0;
  let redactedCursor = 0;
  let output = "";

  for (const match of matches) {
    output += text.slice(cursor, match.start);
    redactedCursor += match.start - cursor;

    const replacement = match.replacement ?? replacementFor(match.kind, counters);
    output += replacement;
    segments.push({
      kind: match.kind,
      originalStart: match.start,
      originalEnd: match.end,
      redactedStart: redactedCursor,
      redactedEnd: redactedCursor + replacement.length,
      originalText: text.slice(match.start, match.end),
      replacement,
    });
    cursor = match.end;
    redactedCursor += replacement.length;
  }

  output += text.slice(cursor);
  return {
    text: output,
    offsetMap: {
      originalLength: text.length,
      redactedLength: output.length,
      segments,
    },
  };
}

function redactSender(sender: string, plan: RedactionPlan): string {
  if (sender === "user") return sender;
  const alias = senderAliases(sender)[0] ?? sender;
  return plan.entities.get(normalized(alias))?.replacement ?? "[PERSON]";
}

export function redactThread(thread: ExtractionThread): RedactedThread {
  const plan = buildRedactionPlan(thread.messages.map((message) => message.sender));
  const messageMaps = new Map<number, OffsetMap>();
  const messages: Message[] = thread.messages.map((message) => {
    const redacted = redactText(message.text, plan);
    messageMaps.set(message.index, redacted.offsetMap);
    return {
      ...message,
      sender: redactSender(message.sender, plan),
      text: redacted.text,
    };
  });

  return {
    thread: {
      ...thread,
      messages,
    },
    messageMaps,
  };
}

export function mapRedactedOffsetToOriginal(map: OffsetMap, offset: number): OffsetMapping | UnmappableOffset {
  if (offset < 0 || offset > map.redactedLength) {
    throw new Error(`redacted offset ${offset} is outside [0, ${map.redactedLength}]`);
  }

  let shift = 0;
  for (const segment of map.segments) {
    if (offset < segment.redactedStart) break;
    if (offset === segment.redactedStart) return { ok: true, offset: segment.originalStart };
    if (offset > segment.redactedStart && offset < segment.redactedEnd) {
      return { ok: false, reason: "inside_redaction", offset, segment };
    }
    if (offset === segment.redactedEnd) return { ok: true, offset: segment.originalEnd };
    shift += (segment.originalEnd - segment.originalStart) - (segment.redactedEnd - segment.redactedStart);
  }
  return { ok: true, offset: offset + shift };
}

export function mapOriginalOffsetToRedacted(map: OffsetMap, offset: number): OffsetMapping | UnmappableOffset {
  if (offset < 0 || offset > map.originalLength) {
    throw new Error(`original offset ${offset} is outside [0, ${map.originalLength}]`);
  }

  let shift = 0;
  for (const segment of map.segments) {
    if (offset < segment.originalStart) break;
    if (offset === segment.originalStart) return { ok: true, offset: segment.redactedStart };
    if (offset > segment.originalStart && offset < segment.originalEnd) {
      return { ok: false, reason: "inside_redaction", offset, segment };
    }
    if (offset === segment.originalEnd) return { ok: true, offset: segment.redactedEnd };
    shift += (segment.redactedEnd - segment.redactedStart) - (segment.originalEnd - segment.originalStart);
  }
  return { ok: true, offset: offset + shift };
}

export function mapRedactedSpanToOriginal(
  maps: ReadonlyMap<number, OffsetMap>,
  span: { readonly msg_index: number; readonly start: number; readonly end: number },
  field: string,
): SpanMapping | UnmappableSpan {
  if (span.start >= span.end) return { ok: false, span, field, reason: "invalid_span" };
  const map = maps.get(span.msg_index);
  if (!map) return { ok: false, span, field, reason: "missing_message_map" };

  const start = mapRedactedOffsetToOriginal(map, span.start);
  const end = mapRedactedOffsetToOriginal(map, span.end);
  if (!start.ok || !end.ok) return { ok: false, span, field, reason: "inside_redaction" };

  return {
    ok: true,
    span: {
      msg_index: span.msg_index,
      start: start.offset,
      end: end.offset,
    },
  };
}
