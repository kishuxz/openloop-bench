/**
 * metrics: everything the matcher's output is worth, in numbers.
 *
 * The design here is one idea: after matching, the run is a flat list of
 * **outcomes**, one per predicted loop and one per true loop, each carrying the
 * thread properties it inherited. Every metric in the benchmark, meaning detection,
 * the confusion matrices, deadline accuracy, grounding and cost, is a fold over
 * that list, and every breakdown is the same fold over a filtered copy of it.
 *
 * That matters because the brief asks for four cross-cuts of every metric (by
 * register, bucket, thread length and loops-per-thread) and the alternative
 * shape, a bespoke computation per metric re-implemented per breakdown, is
 * where a benchmark grows a subtly different denominator in one cell of one
 * table and nobody notices for a year.
 *
 * ## Denominators, stated once
 *
 *   - Detection (precision/recall/F1) is over all predictions and all truths.
 *   - Every label metric, meaning direction, state, certainty, deadline and resolution,
 *     is over MATCHED PAIRS ONLY. Scoring the direction of a loop the extractor
 *     never found would double-count the miss and make recall failures look
 *     like direction failures.
 *   - Grounding is over all mappable predictions, matched or not, because a
 *     fabricated span is most interesting exactly when it did not match.
 *   - `unmappable` is in none of the above. See below.
 *
 * ## Unmappable is a third column, not a bad answer
 *
 * A prediction whose evidence is `"unmappable"` (see `prediction.ts`) is a
 * redaction artifact: the extractor found something and the offsets could not
 * be carried back to the unredacted message. Counting it as a false positive
 * blames the extractor for the redactor; counting it as a match gives away a
 * true positive nobody verified. It is counted in its own column.
 *
 * The honest cost of that decision is that a true loop the extractor DID find
 * can still show up as a false negative, because nothing could be aligned to
 * it. That is not left implicit: `unmappable.fn_ceiling` is the largest number
 * of false negatives that could be explained this way, being per thread the smaller
 * of (unmappable predictions, unmatched truths), so a reader can bound the
 * effect instead of guessing at it.
 *
 * ## Attribution of errors to breakdown groups
 *
 * Bucket, thread length and loops-per-thread are properties of the thread, so
 * every outcome inherits them unambiguously. Register is a property of a loop,
 * and a false positive has no true loop to inherit from, so a false positive
 * is attributed to the register the PREDICTION claimed, and true positives and
 * false negatives to the register the truth carries. That is the only
 * attribution available, and it is why a register row's precision is "precision
 * among loops this extractor called hi-en" rather than "precision on hi-en".
 */

import type { Certainty, Direction, Loop, Register, State, Thread } from "@openloop-bench/schema";
import { CERTAINTIES, DIRECTIONS, REGISTERS, STATES, resolveSpan } from "@openloop-bench/schema";
import { bucketOf } from "@openloop-bench/corpus";
import { hasOffsets, UNMAPPABLE, type PredictedLoop } from "./prediction.js";
import { spanIoU, type ThreadMatch } from "./match.js";
import {
  DEFAULT_COST_MATRIX,
  isInverted,
  summariseCost,
  type CostBreakdown,
  type CostMatrix,
  type CostedError,
} from "./cost.js";

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export type OutcomeKind = "tp" | "fp" | "fn" | "unmappable";

export interface Outcome {
  readonly thread_id: string;
  readonly bucket: string;
  /** Messages in the thread. Drives the thread-length breakdown. */
  readonly thread_length: number;
  /** Ground-truth loops in the thread. Drives the loops-per-thread breakdown. */
  readonly truth_loops_in_thread: number;

  readonly kind: OutcomeKind;
  /** Truth register for tp/fn; predicted register for fp/unmappable. */
  readonly register: Register;

  readonly truth: Loop | null;
  readonly truth_index: number | null;
  readonly pred: PredictedLoop | null;
  readonly pred_index: number | null;
  /** IoU of the matched evidence spans. Null unless kind is "tp". */
  readonly iou: number | null;

  /** False for a prediction whose evidence span resolved to nothing. */
  readonly evidence_grounded: boolean;
  /** Extra predictions (beyond this one) that also covered this true loop. */
  readonly split_by: number;
  /** Extra true loops (beyond this one) this prediction also covered. */
  readonly merges: number;
  /**
   * Set on unmappable outcomes that could, at most, account for one of this
   * thread's unmatched truths. Summed, this is `unmappable.fn_ceiling`.
   */
  readonly shadows_unmatched_truth: boolean;
}

/** Turn one thread's match result into the outcome list the metrics fold over. */
export function outcomesOf(
  thread: Thread,
  predictions: readonly PredictedLoop[],
  match: ThreadMatch,
): Outcome[] {
  const base = {
    thread_id: thread.thread_id,
    bucket: bucketOf(thread.thread_id) ?? "unknown",
    thread_length: thread.messages.length,
    truth_loops_in_thread: thread.loops.length,
  };

  const splitBy = new Map(match.split_truths.map((s) => [s.truth_index, s.pred_indices.length - 1]));
  const merges = new Map(
    match.merged_predictions.map((m) => [m.pred_index, m.truth_indices.length - 1]),
  );
  const ungrounded = new Set(match.ungrounded_predictions);

  const outcomes: Outcome[] = [];

  for (const decision of match.matched) {
    const truth = thread.loops[decision.truth_index];
    const pred = predictions[decision.pred_index];
    if (!truth || !pred) continue;
    outcomes.push({
      ...base,
      kind: "tp",
      register: truth.register,
      truth,
      truth_index: decision.truth_index,
      pred,
      pred_index: decision.pred_index,
      iou: decision.iou,
      evidence_grounded: true,
      split_by: splitBy.get(decision.truth_index) ?? 0,
      merges: merges.get(decision.pred_index) ?? 0,
      shadows_unmatched_truth: false,
    });
  }

  for (const index of match.unmatched_predictions) {
    const pred = predictions[index];
    if (!pred) continue;
    outcomes.push({
      ...base,
      kind: "fp",
      register: pred.register,
      truth: null,
      truth_index: null,
      pred,
      pred_index: index,
      iou: null,
      evidence_grounded: !ungrounded.has(index),
      split_by: 0,
      merges: merges.get(index) ?? 0,
      shadows_unmatched_truth: false,
    });
  }

  for (const index of match.unmatched_truths) {
    const truth = thread.loops[index];
    if (!truth) continue;
    outcomes.push({
      ...base,
      kind: "fn",
      register: truth.register,
      truth,
      truth_index: index,
      pred: null,
      pred_index: null,
      iou: null,
      evidence_grounded: true,
      split_by: splitBy.get(index) ?? 0,
      merges: 0,
      shadows_unmatched_truth: false,
    });
  }

  // The ceiling, assigned to the first N unmappable predictions in index order:
  // at most one unmatched truth can be excused per unmappable prediction.
  const excusable = Math.min(match.unmappable_predictions.length, match.unmatched_truths.length);
  match.unmappable_predictions.forEach((index, i) => {
    const pred = predictions[index];
    if (!pred) return;
    outcomes.push({
      ...base,
      kind: "unmappable",
      register: pred.register,
      truth: null,
      truth_index: null,
      pred,
      pred_index: index,
      iou: null,
      evidence_grounded: true,
      split_by: 0,
      merges: 0,
      shadows_unmatched_truth: i < excusable,
    });
  });

  return outcomes;
}

// ---------------------------------------------------------------------------
// Confusion matrices
// ---------------------------------------------------------------------------

export interface Confusion<K extends string> {
  /** `rows[truth][predicted]`. */
  readonly rows: Readonly<Record<K, Readonly<Record<K, number>>>>;
  readonly correct: number;
  readonly n: number;
  readonly accuracy: number;
}

function confusion<K extends string>(
  keys: readonly K[],
  pairs: ReadonlyArray<{ truth: K; pred: K }>,
): Confusion<K> {
  const rows = Object.fromEntries(
    keys.map((truth) => [truth, Object.fromEntries(keys.map((pred) => [pred, 0]))]),
  ) as Record<K, Record<K, number>>;

  let correct = 0;
  for (const { truth, pred } of pairs) {
    const row = rows[truth];
    if (!row || row[pred] === undefined) continue;
    row[pred] += 1;
    if (truth === pred) correct += 1;
  }

  return { rows, correct, n: pairs.length, accuracy: rate(correct, pairs.length) };
}

/** Zero-denominator returns 0 rather than NaN, because a NaN poisons every average. */
export function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

// ---------------------------------------------------------------------------
// The metric set
// ---------------------------------------------------------------------------

export interface Detection {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
}

export interface MetricSet {
  readonly threads: number;
  readonly truth_loops: number;
  readonly predicted_loops: number;

  readonly detection: Detection;

  readonly direction: Confusion<Direction>;
  readonly state: Confusion<State> & {
    /** The headline: a superseded commitment reported as still live. */
    readonly superseded_as_open: { count: number; of: number; rate: number };
  };
  readonly certainty: Confusion<Certainty>;

  readonly deadline_resolved: {
    readonly exact: number;
    readonly of: number;
    readonly rate: number;
    /** Truth had no resolvable date; the extractor produced one anyway. */
    readonly hallucinated: number;
    /** Truth had a date; the extractor produced none. */
    readonly missing: number;
  };

  readonly deadline_span: {
    /** Matched pairs whose truth has an explicit deadline span. */
    readonly of: number;
    /** ...and the prediction gave usable deadline offsets. */
    readonly found: number;
    readonly rate: number;
    readonly missing: number;
    readonly unmappable: number;
    /** Truth has no explicit deadline span; the extractor produced one anyway. */
    readonly spurious: number;
  };

  readonly resolution_span: {
    /** Matched pairs where the truth is closed or superseded. */
    readonly of: number;
    /** ...and the prediction gave usable offsets. Denominator of the two rates. */
    readonly scored: number;
    readonly msg_index_correct: number;
    readonly msg_index_rate: number;
    readonly mean_iou: number;
    readonly missing: number;
    readonly unmappable: number;
    /** Truth is open; the extractor claimed a resolution anyway. */
    readonly spurious: number;
  };

  readonly grounding: {
    readonly grounded: number;
    readonly of: number;
    readonly rate: number;
  };

  readonly span_tightness: {
    /** Matched evidence pairs. */
    readonly matched: number;
    /** Mean evidence-span IoU over matched pairs. */
    readonly mean_iou: number;
  };

  readonly unmappable: {
    readonly predictions: number;
    readonly deadline_spans: number;
    readonly resolution_spans: number;
    /** Upper bound on false negatives explainable by unmappable predictions. */
    readonly fn_ceiling: number;
  };

  readonly structure: {
    /** True loops reported as two or more predictions. */
    readonly split_truths: number;
    /** Predictions covering two or more true loops. */
    readonly merged_predictions: number;
  };

  readonly cost: CostBreakdown;
}

/** The costed errors an outcome carries. One outcome can carry two. */
export function costedErrors(outcome: Outcome): CostedError[] {
  const errors: CostedError[] = [];
  if (outcome.kind === "fn") errors.push({ kind: "false_negative" });
  if (outcome.kind === "fp" && outcome.pred) {
    errors.push({ kind: "false_positive", direction: outcome.pred.direction });
  }
  if (outcome.kind === "tp" && outcome.truth && outcome.pred) {
    if (outcome.truth.state === "superseded" && outcome.pred.state === "open") {
      errors.push({ kind: "superseded_as_open" });
    }
    if (isInverted(outcome.truth.direction, outcome.pred.direction)) {
      errors.push({ kind: "direction_inverted" });
    }
  }
  return errors;
}

/**
 * Fold a list of outcomes into every metric the report prints.
 *
 * `threads` is passed rather than derived: a negative thread that produced no
 * predictions and has no loops generates no outcomes at all, and it is exactly
 * the thread whose silence the benchmark most wants to credit.
 */
export function computeMetrics(
  outcomes: readonly Outcome[],
  threads: number,
  matrix: CostMatrix = DEFAULT_COST_MATRIX,
): MetricSet {
  const tp = outcomes.filter((o) => o.kind === "tp");
  const fp = outcomes.filter((o) => o.kind === "fp");
  const fn = outcomes.filter((o) => o.kind === "fn");
  const unmappable = outcomes.filter((o) => o.kind === "unmappable");

  const pairs = tp.flatMap((o) => (o.truth && o.pred ? [{ truth: o.truth, pred: o.pred, o }] : []));

  const precision = rate(tp.length, tp.length + fp.length);
  const recall = rate(tp.length, tp.length + fn.length);

  const direction = confusion<Direction>(
    DIRECTIONS,
    pairs.map(({ truth, pred }) => ({ truth: truth.direction, pred: pred.direction })),
  );

  const stateConfusion = confusion<State>(
    STATES,
    pairs.map(({ truth, pred }) => ({ truth: truth.state, pred: pred.state })),
  );
  const supersededPairs = pairs.filter(({ truth }) => truth.state === "superseded");
  const supersededAsOpen = supersededPairs.filter(({ pred }) => pred.state === "open").length;

  const certainty = confusion<Certainty>(
    CERTAINTIES,
    pairs.map(({ truth, pred }) => ({
      truth: truth.deadline.certainty,
      pred: pred.deadline.certainty,
    })),
  );

  const datedPairs = pairs.filter(({ truth }) => truth.deadline.resolved !== null);
  const deadline_resolved = {
    exact: datedPairs.filter(({ truth, pred }) => pred.deadline.resolved === truth.deadline.resolved)
      .length,
    of: datedPairs.length,
    rate: rate(
      datedPairs.filter(({ truth, pred }) => pred.deadline.resolved === truth.deadline.resolved)
        .length,
      datedPairs.length,
    ),
    hallucinated: pairs.filter(
      ({ truth, pred }) => truth.deadline.resolved === null && pred.deadline.resolved !== null,
    ).length,
    missing: datedPairs.filter(({ pred }) => pred.deadline.resolved === null).length,
  };

  const explicitDeadlinePairs = pairs.filter(({ truth }) => truth.deadline.span !== null);
  const deadlineFound = explicitDeadlinePairs.filter(
    ({ pred }) => pred.deadline.span !== null && pred.deadline.span !== UNMAPPABLE,
  ).length;
  const deadlineUnmappable = explicitDeadlinePairs.filter(({ pred }) => pred.deadline.span === UNMAPPABLE).length;
  const deadline_span = {
    of: explicitDeadlinePairs.length,
    found: deadlineFound,
    rate: rate(deadlineFound, explicitDeadlinePairs.length),
    missing: explicitDeadlinePairs.length - deadlineFound - deadlineUnmappable,
    unmappable: deadlineUnmappable,
    spurious: pairs.filter(({ truth, pred }) => truth.deadline.span === null && pred.deadline.span !== null).length,
  };

  const resolvedPairs = pairs.filter(({ truth }) => truth.resolution !== null);
  let msgIndexCorrect = 0;
  let iouTotal = 0;
  let scored = 0;
  let missing = 0;
  let unmappableResolution = 0;
  for (const { truth, pred } of resolvedPairs) {
    const truthSpan = truth.resolution;
    if (!truthSpan) continue;
    if (pred.resolution === null) {
      missing += 1;
      continue;
    }
    if (pred.resolution === UNMAPPABLE) {
      unmappableResolution += 1;
      continue;
    }
    scored += 1;
    if (pred.resolution.msg_index === truthSpan.msg_index) msgIndexCorrect += 1;
    iouTotal += spanIoU(pred.resolution, truthSpan);
  }

  const resolution_span = {
    of: resolvedPairs.length,
    scored,
    msg_index_correct: msgIndexCorrect,
    msg_index_rate: rate(msgIndexCorrect, scored),
    mean_iou: rate(iouTotal, scored),
    missing,
    unmappable: unmappableResolution,
    spurious: pairs.filter(({ truth, pred }) => truth.resolution === null && pred.resolution !== null)
      .length,
  };

  const mappablePredictions = tp.length + fp.length;
  const grounded = mappablePredictions - fp.filter((o) => !o.evidence_grounded).length;
  const spanTightnessTotal = tp.reduce((total, outcome) => total + (outcome.iou ?? 0), 0);

  const errors = outcomes.flatMap(costedErrors);

  return {
    threads,
    truth_loops: tp.length + fn.length,
    predicted_loops: tp.length + fp.length + unmappable.length,

    detection: {
      tp: tp.length,
      fp: fp.length,
      fn: fn.length,
      precision,
      recall,
      f1: rate(2 * precision * recall, precision + recall),
    },

    direction,
    state: {
      ...stateConfusion,
      superseded_as_open: {
        count: supersededAsOpen,
        of: supersededPairs.length,
        rate: rate(supersededAsOpen, supersededPairs.length),
      },
    },
    certainty,

    deadline_resolved,
    deadline_span,
    resolution_span,

    grounding: {
      grounded,
      of: mappablePredictions,
      rate: rate(grounded, mappablePredictions),
    },

    span_tightness: {
      matched: tp.length,
      mean_iou: rate(spanTightnessTotal, tp.length),
    },

    unmappable: {
      predictions: unmappable.length,
      deadline_spans: pairs.filter(({ pred }) => pred.deadline.span === UNMAPPABLE).length,
      resolution_spans: unmappableResolution,
      fn_ceiling: unmappable.filter((o) => o.shadows_unmatched_truth).length,
    },

    structure: {
      split_truths: [...tp, ...fn].filter((o) => o.split_by > 0).length,
      merged_predictions: [...tp, ...fp].filter((o) => o.merges > 0).length,
    },

    cost: summariseCost(errors, threads, matrix),
  };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

/** Thread-length bins. Chosen against the corpus: median dev thread is 5. */
export const LENGTH_BINS = [
  { key: "1-4 msgs", upTo: 4 },
  { key: "5-6 msgs", upTo: 6 },
  { key: "7-9 msgs", upTo: 9 },
  { key: "10+ msgs", upTo: Number.POSITIVE_INFINITY },
] as const;

export function lengthBin(messages: number): string {
  return LENGTH_BINS.find((b) => messages <= b.upTo)?.key ?? LENGTH_BINS[LENGTH_BINS.length - 1]!.key;
}

/**
 * Loops-per-thread bins. This is the within-thread recall cross-cut: it answers
 * whether an extractor finds every commitment in a busy thread or anchors on
 * the first one and stops. The `0 loops` row is the negative set, where the only
 * possible outcome is a false positive.
 */
export const LOOPS_BINS = ["0 loops", "1 loop", "2 loops", "3+ loops"] as const;

export function loopsBin(loops: number): string {
  if (loops === 0) return "0 loops";
  if (loops === 1) return "1 loop";
  if (loops === 2) return "2 loops";
  return "3+ loops";
}

export interface Breakdown {
  /** Group key → metrics. Insertion order is the order the report prints. */
  readonly groups: Array<{ key: string; metrics: MetricSet }>;
}

function groupBy(
  outcomes: readonly Outcome[],
  /** thread_id → group key, or null when the grouping is not a thread property. */
  threadKeys: ReadonlyMap<string, string> | null,
  order: readonly string[],
  keyOf: (outcome: Outcome) => string,
  matrix: CostMatrix,
): Breakdown {
  const byKey = new Map<string, Outcome[]>();
  for (const key of order) byKey.set(key, []);
  for (const outcome of outcomes) {
    const key = keyOf(outcome);
    byKey.set(key, [...(byKey.get(key) ?? []), outcome]);
  }

  const threadCounts = new Map<string, number>();
  if (threadKeys) {
    for (const key of order) threadCounts.set(key, 0);
    for (const [, key] of threadKeys) threadCounts.set(key, (threadCounts.get(key) ?? 0) + 1);
  }

  return {
    groups: [...byKey].map(([key, group]) => ({
      key,
      metrics: computeMetrics(group, threadCounts.get(key) ?? distinctThreads(group), matrix),
    })),
  };
}

function distinctThreads(outcomes: readonly Outcome[]): number {
  return new Set(outcomes.map((o) => o.thread_id)).size;
}

export interface Breakdowns {
  readonly by_register: Breakdown;
  readonly by_bucket: Breakdown;
  readonly by_thread_length: Breakdown;
  readonly by_loops_per_thread: Breakdown;
}

/**
 * Every cross-cut the brief asks for, over the same outcome list.
 *
 * `threads` maps thread_id → its properties, so a thread with no outcomes at
 * all still lands in its bucket, length and loops-per-thread row. The register
 * breakdown has no such map, since register is a loop-level label, so its thread
 * counts are "threads that produced an outcome of this register".
 */
export function computeBreakdowns(
  outcomes: readonly Outcome[],
  threads: readonly Thread[],
  matrix: CostMatrix = DEFAULT_COST_MATRIX,
): Breakdowns {
  const bucketKeys = new Map(threads.map((t) => [t.thread_id, bucketOf(t.thread_id) ?? "unknown"]));
  const lengthKeys = new Map(threads.map((t) => [t.thread_id, lengthBin(t.messages.length)]));
  const loopsKeys = new Map(threads.map((t) => [t.thread_id, loopsBin(t.loops.length)]));

  const buckets = [...new Set(bucketKeys.values())].sort();

  return {
    by_register: groupBy(outcomes, null, REGISTERS, (o) => o.register, matrix),
    by_bucket: groupBy(outcomes, bucketKeys, buckets, (o) => o.bucket, matrix),
    by_thread_length: groupBy(
      outcomes,
      lengthKeys,
      LENGTH_BINS.map((b) => b.key),
      (o) => lengthBin(o.thread_length),
      matrix,
    ),
    by_loops_per_thread: groupBy(
      outcomes,
      loopsKeys,
      LOOPS_BINS,
      (o) => loopsBin(o.truth_loops_in_thread),
      matrix,
    ),
  };
}

// ---------------------------------------------------------------------------
// Error classification, shared by the cost model and the failure gallery
// ---------------------------------------------------------------------------

/**
 * Gallery categories. An outcome can belong to several, since a false positive with
 * a fabricated span is both, and it appears in each, because the gallery exists
 * to be read one failure mode at a time.
 */
export const ERROR_CATEGORIES = [
  "false_positive_blocked_on_them",
  "superseded_as_open",
  "direction_inverted",
  "false_positive_blocked_on_you",
  "false_positive_mutual",
  "false_negative",
  "state_error_other",
  "direction_error_other",
  "ungrounded_evidence",
  "split_prediction",
  "merged_prediction",
  "certainty_error",
  "resolved_date_error",
  "resolution_span_error",
  "unmappable_evidence",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Every category this outcome belongs to. Empty for a clean true positive. */
export function categorise(outcome: Outcome): ErrorCategory[] {
  const categories: ErrorCategory[] = [];
  const { truth, pred } = outcome;

  if (outcome.kind === "fn") categories.push("false_negative");

  if (outcome.kind === "fp" && pred) {
    categories.push(
      pred.direction === "blocked_on_them"
        ? "false_positive_blocked_on_them"
        : pred.direction === "blocked_on_you"
          ? "false_positive_blocked_on_you"
          : "false_positive_mutual",
    );
    if (!outcome.evidence_grounded) categories.push("ungrounded_evidence");
  }

  if (outcome.kind === "unmappable") categories.push("unmappable_evidence");

  if (outcome.kind === "tp" && truth && pred) {
    if (truth.state === "superseded" && pred.state === "open") categories.push("superseded_as_open");
    else if (truth.state !== pred.state) categories.push("state_error_other");

    if (isInverted(truth.direction, pred.direction)) categories.push("direction_inverted");
    else if (truth.direction !== pred.direction) categories.push("direction_error_other");

    if (truth.deadline.certainty !== pred.deadline.certainty) categories.push("certainty_error");

    const dateWrong =
      truth.deadline.resolved !== null
        ? pred.deadline.resolved !== truth.deadline.resolved
        : pred.deadline.resolved !== null;
    if (dateWrong) categories.push("resolved_date_error");

    if (truth.resolution !== null) {
      const predResolution = pred.resolution;
      const wrong =
        predResolution === null ||
        predResolution === UNMAPPABLE ||
        predResolution.msg_index !== truth.resolution.msg_index ||
        spanIoU(predResolution, truth.resolution) === 0;
      if (wrong) categories.push("resolution_span_error");
    } else if (pred.resolution !== null) {
      categories.push("resolution_span_error");
    }
  }

  if (outcome.split_by > 0) categories.push("split_prediction");
  if (outcome.merges > 0) categories.push("merged_prediction");

  return categories;
}

/** The text a predicted span points at, or null when it points at nothing. */
export function predictedSpanText(thread: Thread, loop: PredictedLoop): string | null {
  if (!hasOffsets(loop.evidence)) return null;
  return resolveSpan(thread.messages, loop.evidence);
}
