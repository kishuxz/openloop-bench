/**
 * cost: one number that says how bad a run was, under weights that are stated
 * rather than assumed.
 *
 * Precision, recall and F1 treat every error as one error. This product does
 * not: the errors have wildly different consequences, and a config that trades
 * three missed loops for one confident false `blocked_on_them` has got worse,
 * not better, while F1 says it improved.
 *
 *   false negative (missed loop)          1   You do not get reminded. The
 *                                             commitment was already invisible;
 *                                             the tool failed to add value but
 *                                             took nothing away.
 *   false positive, blocked_on_you        3   An unnecessary nag to yourself.
 *                                             Annoying, self-contained, and it
 *                                             erodes trust in the whole list.
 *   false positive, blocked_on_them       8   This is the one that can leave the
 *                                             building. A system acting on
 *                                             blocked_on_them sends an outbound
 *                                             chase to somebody who may have
 *                                             already delivered, an error you
 *                                             cannot apologise your way out of.
 *   superseded reported as open           8   Sends the user chasing something
 *                                             that no longer exists, with the
 *                                             full confidence of a real loop.
 *                                             The failure this corpus was built
 *                                             to expose.
 *   direction inverted                    8   Says you owe them when they owe
 *                                             you, or the reverse. Crosses the
 *                                             autonomy boundary the schema
 *                                             defines, in whichever direction.
 *
 * ## These weights are a judgment call, not a measurement
 *
 * Nobody measured that an outbound false chase is eight times worse than a
 * missed reminder. The ratio encodes a product stance, that errors which speak to
 * third parties on the user's behalf are categorically worse than errors that
 * cost the user attention, and a different product could justify a different
 * one. So the matrix is configurable, it is printed in full in every report,
 * and the report says this paragraph out loud. A weighting that appears only as
 * a single score is a weighting nobody can argue with.
 *
 * `mutual` false positives are weighted like `blocked_on_you` by default. A
 * mutual loop is a handshake neither side can complete alone, so the first
 * action it produces is a prompt to the user, not an outbound chase. That is
 * itself a judgment call, and it is the reason the weight is a per-direction
 * record rather than two hard-coded constants.
 *
 * Direction confusions involving `mutual` are NOT charged as inversions. They
 * are in the confusion matrix and they are real errors, but calling
 * `blocked_on_them` where the truth is `mutual` does not reverse who owes whom
 * With 15 mutual loops in the corpus, loading an 8x weight onto a cell
 * that thin would let a handful of labels swing the headline number.
 */

import type { Direction } from "@openloop-bench/schema";

export interface CostMatrix {
  readonly false_negative: number;
  /** Keyed by the direction the *prediction* claimed, since that is what would act. */
  readonly false_positive: Readonly<Record<Direction, number>>;
  readonly superseded_as_open: number;
  readonly direction_inverted: number;
}

export const DEFAULT_COST_MATRIX: CostMatrix = {
  false_negative: 1,
  false_positive: {
    blocked_on_you: 3,
    blocked_on_them: 8,
    mutual: 3,
  },
  superseded_as_open: 8,
  direction_inverted: 8,
};

/** The costed error classes, in the order the report lists them. */
export const COST_KINDS = [
  "false_negative",
  "false_positive",
  "superseded_as_open",
  "direction_inverted",
] as const;
export type CostKind = (typeof COST_KINDS)[number];

/**
 * A single charged error. Direction is carried for false positives because the
 * weight depends on it, and only on the predicted direction, since that is the
 * claim a downstream system would act on.
 */
export type CostedError =
  | { readonly kind: "false_negative" }
  | { readonly kind: "false_positive"; readonly direction: Direction }
  | { readonly kind: "superseded_as_open" }
  | { readonly kind: "direction_inverted" };

export function costOfError(error: CostedError, matrix: CostMatrix = DEFAULT_COST_MATRIX): number {
  switch (error.kind) {
    case "false_negative":
      return matrix.false_negative;
    case "false_positive":
      return matrix.false_positive[error.direction];
    case "superseded_as_open":
      return matrix.superseded_as_open;
    case "direction_inverted":
      return matrix.direction_inverted;
  }
}

/**
 * True when truth and prediction name opposite sides of the obligation.
 *
 * Only the `blocked_on_you` / `blocked_on_them` swap counts; see the file
 * header for why `mutual` confusions are excluded.
 */
export function isInverted(truth: Direction, predicted: Direction): boolean {
  return (
    (truth === "blocked_on_you" && predicted === "blocked_on_them") ||
    (truth === "blocked_on_them" && predicted === "blocked_on_you")
  );
}

export interface CostBreakdown {
  /** Charged count and total cost per error class. */
  readonly by_kind: Readonly<Record<CostKind, { count: number; cost: number }>>;
  /** False positives split by the direction they claimed. */
  readonly false_positive_by_direction: Readonly<Record<Direction, { count: number; cost: number }>>;
  readonly total: number;
  /** Total divided by threads scored: the comparable figure across splits. */
  readonly per_thread: number;
}

export function summariseCost(
  errors: readonly CostedError[],
  threads: number,
  matrix: CostMatrix = DEFAULT_COST_MATRIX,
): CostBreakdown {
  const by_kind: Record<CostKind, { count: number; cost: number }> = {
    false_negative: { count: 0, cost: 0 },
    false_positive: { count: 0, cost: 0 },
    superseded_as_open: { count: 0, cost: 0 },
    direction_inverted: { count: 0, cost: 0 },
  };
  const false_positive_by_direction: Record<Direction, { count: number; cost: number }> = {
    blocked_on_them: { count: 0, cost: 0 },
    blocked_on_you: { count: 0, cost: 0 },
    mutual: { count: 0, cost: 0 },
  };

  let total = 0;
  for (const error of errors) {
    const cost = costOfError(error, matrix);
    total += cost;
    const bucket = by_kind[error.kind];
    bucket.count += 1;
    bucket.cost += cost;
    if (error.kind === "false_positive") {
      const row = false_positive_by_direction[error.direction];
      row.count += 1;
      row.cost += cost;
    }
  }

  return {
    by_kind,
    false_positive_by_direction,
    total,
    per_thread: threads === 0 ? 0 : total / threads,
  };
}
