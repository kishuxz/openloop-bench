/**
 * match — deciding when a predicted loop IS a ground-truth loop.
 *
 * Everything downstream is arithmetic. This file is the judgment call, so the
 * reasoning lives here rather than in a PR thread.
 *
 * ## Why span overlap and not text similarity
 *
 * A predicted loop arrives with no id, so something has to align it with the
 * truth. The obvious lever is `statement`: compare "send the updated cap table
 * to Priya" against what the model wrote and take the close ones. That is the
 * wrong lever. `statement` is prose an extractor composed, so any similarity
 * measure over it scores *paraphrasing quality* — an extractor that finds every
 * commitment but describes them tersely would lose to one that hallucinates
 * fluent summaries of commitments nobody made.
 *
 * Matching is therefore on the evidence span: same message, and character
 * ranges that either contain one another or overlap by at least `iou`
 * (intersection over union). The claim being checked is "you pointed at the
 * place where this commitment was made", which is the thing the benchmark is
 * about, and it is checkable against the text rather than against a reviewer's
 * opinion.
 *
 * ## Why containment first, then IoU
 *
 * LABELING.md's span convention asks labels to point at the tight commitment
 * phrase. Extractors often include the lead-in clause around the same
 * commitment. Pure IoU measures that boundary convention, not detection, so a
 * span that fully contains its partner in the same message is a valid candidate
 * match. IoU remains the greedy ordering score and is reported separately as
 * span tightness.
 *
 * The threshold is a judgment call and the eval treats it as one: the whole
 * run happens at 0.3, 0.5 and 0.7, all three are reported, and the number
 * appears in every artifact this package writes. A benchmark with a hidden
 * matching threshold is a benchmark whose headline number can be moved by a
 * constant nobody prints.
 *
 * ## One-to-one, and why the losers are recorded
 *
 * Assignment is greedy by descending IoU: the best pair takes each other out of
 * the pool. Two predictions over one true loop therefore produce one true
 * positive and one false positive — correct, because an extractor that splits a
 * single commitment into two reported items has produced a spurious item the
 * user will act on. That is a distinct and real error mode, so it is counted
 * (`split_truths`) rather than merely penalised, along with its mirror,
 * one prediction swallowing two true loops (`merged_predictions`).
 *
 * Greedy rather than optimal (Hungarian) assignment: with a handful of loops
 * per thread the two agree except in contrived cases, and greedy is explainable
 * in a sentence — which matters more here, because every match decision is
 * written to a file a human is expected to be able to check.
 *
 * ## Ungrounded and unmappable predictions
 *
 * A prediction whose evidence span does not resolve to real text is never
 * matched. It cannot be: it points nowhere. It is a false positive and is also
 * counted in the grounding rate, because fabricating an offset is a different
 * failure from finding the wrong commitment.
 *
 * A prediction whose evidence is `"unmappable"` is set aside entirely — not
 * matched, not a false positive. See `prediction.ts` for why, and `metrics.ts`
 * for the ceiling it puts on how much of the false-negative count could be a
 * redaction artifact.
 */

import { resolveSpan, type Message, type Span, type Thread } from "@openloop-bench/schema";
import { hasOffsets, UNMAPPABLE, type PredictedLoop, type PredictedOffsets } from "./prediction.js";

/** The thresholds every run is scored at. Reported side by side, always. */
export const IOU_THRESHOLDS = [0.3, 0.5, 0.7] as const;

/** The one reported as the headline when a single number is needed. */
export const DEFAULT_IOU = 0.5;

/**
 * Intersection over union of two character ranges in the same message.
 *
 * Zero for different messages: a commitment made in message 2 and one made in
 * message 5 are different commitments however similar the offsets look.
 * Zero for degenerate ranges: a zero-width or inverted span has no extent to
 * overlap with, and returning NaN from a division by zero would poison every
 * average downstream.
 */
export function spanIoU(a: PredictedOffsets | Span, b: PredictedOffsets | Span): number {
  if (a.msg_index !== b.msg_index) return 0;
  if (a.start >= a.end || b.start >= b.end) return 0;

  const intersection = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (intersection <= 0) return 0;

  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return intersection / union;
}

/** True when both spans are valid, same-message ranges and either contains the other. */
export function spanContainsEither(a: PredictedOffsets | Span, b: PredictedOffsets | Span): boolean {
  if (a.msg_index !== b.msg_index) return false;
  if (a.start >= a.end || b.start >= b.end) return false;
  return (a.start <= b.start && a.end >= b.end) || (b.start <= a.start && b.end >= a.end);
}

/** Why a prediction/truth pair overlapped without becoming a match. */
export type NearMissReason = "below_threshold" | "lost_contest";

export interface NearMiss {
  readonly pred_index: number;
  readonly truth_index: number;
  readonly iou: number;
  readonly reason: NearMissReason;
}

export interface MatchDecision {
  readonly pred_index: number;
  readonly truth_index: number;
  readonly iou: number;
}

export interface ThreadMatch {
  readonly thread_id: string;
  readonly iou_threshold: number;
  readonly matched: MatchDecision[];
  /** False positives: grounded, mappable, matched nothing. */
  readonly unmatched_predictions: number[];
  /** Evidence span pointed at no real text. Always a subset of the above. */
  readonly ungrounded_predictions: number[];
  /** Evidence was `"unmappable"`. Neither matched nor counted against. */
  readonly unmappable_predictions: number[];
  /** False negatives. */
  readonly unmatched_truths: number[];
  /** Overlapping pairs that did not become matches. The hand-review material. */
  readonly near_misses: NearMiss[];
  /** One true loop reported as two or more. An extractor splitting commitments. */
  readonly split_truths: Array<{ truth_index: number; pred_indices: number[] }>;
  /** One prediction covering two or more true loops. The mirror error. */
  readonly merged_predictions: Array<{ pred_index: number; truth_indices: number[] }>;
}

/** Evidence offsets if the prediction has any that resolve, else null. */
export function groundedEvidence(
  messages: readonly Message[],
  loop: PredictedLoop,
): PredictedOffsets | null {
  if (!hasOffsets(loop.evidence)) return null;
  return resolveSpan(messages, loop.evidence) === null ? null : loop.evidence;
}

/**
 * Align one thread's predictions against its ground truth.
 *
 * Deterministic: candidates are sorted by descending IoU with ties broken by
 * prediction index then truth index, so the same inputs always produce the same
 * assignment and the same near-miss list. A matcher whose output depended on
 * object iteration order would make every number in the report unreproducible.
 */
export function matchThread(
  thread: Thread,
  predictions: readonly PredictedLoop[],
  iouThreshold: number,
): ThreadMatch {
  const unmappable: number[] = [];
  const ungrounded: number[] = [];
  const eligible = new Map<number, PredictedOffsets>();

  predictions.forEach((loop, index) => {
    if (loop.evidence === UNMAPPABLE) {
      unmappable.push(index);
      return;
    }
    const grounded = groundedEvidence(thread.messages, loop);
    if (grounded === null) {
      ungrounded.push(index);
      return;
    }
    eligible.set(index, grounded);
  });

  interface Candidate {
    pred_index: number;
    truth_index: number;
    iou: number;
    contains: boolean;
  }
  const candidates: Candidate[] = [];
  for (const [pred_index, evidence] of eligible) {
    thread.loops.forEach((truth, truth_index) => {
      const iou = spanIoU(evidence, truth.evidence);
      const contains = spanContainsEither(evidence, truth.evidence);
      if (iou > 0 || contains) candidates.push({ pred_index, truth_index, iou, contains });
    });
  }

  candidates.sort(
    (a, b) => b.iou - a.iou || a.pred_index - b.pred_index || a.truth_index - b.truth_index,
  );

  const matched: MatchDecision[] = [];
  const nearMisses: NearMiss[] = [];
  const takenPredictions = new Set<number>();
  const takenTruths = new Set<number>();

  for (const candidate of candidates) {
    if (!candidate.contains && candidate.iou < iouThreshold) {
      nearMisses.push({ ...candidate, reason: "below_threshold" });
      continue;
    }
    if (takenPredictions.has(candidate.pred_index) || takenTruths.has(candidate.truth_index)) {
      nearMisses.push({ ...candidate, reason: "lost_contest" });
      continue;
    }
    matched.push({
      pred_index: candidate.pred_index,
      truth_index: candidate.truth_index,
      iou: candidate.iou,
    });
    takenPredictions.add(candidate.pred_index);
    takenTruths.add(candidate.truth_index);
  }

  // Split / merge counted over every matchable candidate, not over the
  // assignment: the error is that the extractor produced two overlapping
  // reports of one commitment, which is true regardless of which one won.
  const above = candidates.filter((c) => c.contains || c.iou >= iouThreshold);

  const byTruth = new Map<number, number[]>();
  const byPrediction = new Map<number, number[]>();
  for (const c of above) {
    byTruth.set(c.truth_index, [...(byTruth.get(c.truth_index) ?? []), c.pred_index]);
    byPrediction.set(c.pred_index, [...(byPrediction.get(c.pred_index) ?? []), c.truth_index]);
  }

  const split_truths = [...byTruth]
    .filter(([, preds]) => preds.length > 1)
    .map(([truth_index, pred_indices]) => ({ truth_index, pred_indices: [...pred_indices].sort((a, b) => a - b) }))
    .sort((a, b) => a.truth_index - b.truth_index);

  const merged_predictions = [...byPrediction]
    .filter(([, truths]) => truths.length > 1)
    .map(([pred_index, truth_indices]) => ({ pred_index, truth_indices: [...truth_indices].sort((a, b) => a - b) }))
    .sort((a, b) => a.pred_index - b.pred_index);

  const unmatchedPredictions = [...eligible.keys()]
    .filter((i) => !takenPredictions.has(i))
    .concat(ungrounded)
    .sort((a, b) => a - b);

  const unmatchedTruths = thread.loops
    .map((_, i) => i)
    .filter((i) => !takenTruths.has(i));

  return {
    thread_id: thread.thread_id,
    iou_threshold: iouThreshold,
    matched: matched.sort((a, b) => a.pred_index - b.pred_index),
    unmatched_predictions: unmatchedPredictions,
    ungrounded_predictions: ungrounded,
    unmappable_predictions: unmappable,
    unmatched_truths: unmatchedTruths,
    near_misses: nearMisses.sort(
      (a, b) => b.iou - a.iou || a.pred_index - b.pred_index || a.truth_index - b.truth_index,
    ),
    split_truths,
    merged_predictions,
  };
}
