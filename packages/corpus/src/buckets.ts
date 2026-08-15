/**
 * buckets — the deliberate composition of the seed corpus.
 *
 * A benchmark whose composition is implicit is a benchmark nobody can audit.
 * The bucket lives in the `thread_id` prefix rather than in a schema field, so
 * it is visible in `ls`, greppable, and impossible to disagree with the
 * filename about. `pnpm stats` reports coverage against these targets and
 * `pnpm stats:check` fails if a bucket is empty in either split.
 */

export interface Bucket {
  /** `thread_id` prefix, before the first hyphen. */
  readonly prefix: string;
  readonly label: string;
  /** How many threads this bucket is specified to contain. */
  readonly target: number;
  readonly why: string;
}

export const BUCKETS: readonly Bucket[] = [
  {
    prefix: "en",
    label: "English",
    target: 10,
    why: "The easy baseline. If an extractor fails here, nothing else is worth measuring.",
  },
  {
    prefix: "mix",
    label: "Code-mixed (Hinglish/Tanglish)",
    target: 10,
    why: "Deadlines expressed non-numerically — kal tak, parso, naaliki, weekend tak.",
  },
  {
    prefix: "sup",
    label: "Superseded",
    target: 6,
    why: "Committed, then cancelled/delegated/overtaken in-thread. The headline metric.",
  },
  {
    prefix: "neg",
    label: "Negative (zero loops)",
    target: 8,
    why: "Near-miss language that is not a commitment. Without these, precision measures nothing.",
  },
  {
    prefix: "del",
    label: "Delegation / direction flip",
    target: 6,
    why: "The obligation survives but who owes it changes. Direction errors are safety errors.",
  },
];

export const BUCKET_PREFIXES: readonly string[] = BUCKETS.map((b) => b.prefix);

/** The bucket prefix of a thread id, or null if it is not a known bucket. */
export function bucketOf(threadId: string): string | null {
  const prefix = threadId.split("-")[0] ?? "";
  return BUCKET_PREFIXES.includes(prefix) ? prefix : null;
}
