/**
 * Cost model tests.
 *
 * The weights themselves are a judgment call and there is nothing to test about
 * them. What is testable is that the model charges what it says it charges: the
 * direction of a false positive decides its weight, one pair can be charged
 * twice, and a `mutual` confusion is not an inversion.
 */

import { describe, expect, test } from "vitest";
import { matchThread } from "../src/match.js";
import { computeMetrics, costedErrors, outcomesOf } from "../src/metrics.js";
import { costOfError, DEFAULT_COST_MATRIX, isInverted, summariseCost } from "../src/cost.js";
import type { PredictedLoop } from "../src/prediction.js";
import type { Thread } from "@openloop-bench/schema";
import { at, EVIDENCE, makeThread, truthLoop } from "./helpers.js";

function score(thread: Thread, predictions: PredictedLoop[], threads = 1) {
  return computeMetrics(outcomesOf(thread, predictions, matchThread(thread, predictions, 0.5)), threads);
}

const exact = { start: EVIDENCE.start, end: EVIDENCE.end };

describe("isInverted", () => {
  test("is true only for the you/them swap", () => {
    expect(isInverted("blocked_on_you", "blocked_on_them")).toBe(true);
    expect(isInverted("blocked_on_them", "blocked_on_you")).toBe(true);
  });

  test("is false for anything involving mutual", () => {
    expect(isInverted("mutual", "blocked_on_them")).toBe(false);
    expect(isInverted("blocked_on_you", "mutual")).toBe(false);
  });

  test("is false when the direction is right", () => {
    expect(isInverted("blocked_on_you", "blocked_on_you")).toBe(false);
  });
});

describe("weights", () => {
  test("a false blocked_on_them costs more than a false blocked_on_you", () => {
    const them = score(makeThread([]), [at(4, 20, { direction: "blocked_on_them" })]);
    const you = score(makeThread([]), [at(4, 20, { direction: "blocked_on_you" })]);
    expect(them.cost.total).toBe(DEFAULT_COST_MATRIX.false_positive.blocked_on_them);
    expect(you.cost.total).toBe(DEFAULT_COST_MATRIX.false_positive.blocked_on_you);
    expect(them.cost.total).toBeGreaterThan(you.cost.total);
  });

  test("a missed loop is the cheapest error there is", () => {
    const missed = score(makeThread([truthLoop()]), []);
    expect(missed.cost.total).toBe(DEFAULT_COST_MATRIX.false_negative);
  });

  test("the false positive weight follows the direction the prediction claimed", () => {
    const m = score(makeThread([]), [at(4, 20, { direction: "mutual" })]);
    expect(m.cost.false_positive_by_direction.mutual).toEqual({
      count: 1,
      cost: DEFAULT_COST_MATRIX.false_positive.mutual,
    });
  });

  test("a custom matrix is honoured everywhere, not just in the total", () => {
    const outcomes = outcomesOf(
      makeThread([truthLoop()]),
      [],
      matchThread(makeThread([truthLoop()]), [], 0.5),
    );
    const doubled = computeMetrics(outcomes, 1, { ...DEFAULT_COST_MATRIX, false_negative: 100 });
    expect(doubled.cost.by_kind.false_negative).toEqual({ count: 1, cost: 100 });
  });
});

describe("charging matched pairs", () => {
  const superseded = truthLoop({ state: "superseded", resolution: { msg_index: 2, start: 0, end: 34 } });

  test("a superseded loop reported open is charged", () => {
    const m = score(makeThread([superseded]), [at(exact.start, exact.end, { state: "open" })]);
    expect(m.cost.by_kind.superseded_as_open).toEqual({
      count: 1,
      cost: DEFAULT_COST_MATRIX.superseded_as_open,
    });
  });

  test("one pair can be charged twice; they are two distinct harms", () => {
    const m = score(makeThread([superseded]), [
      at(exact.start, exact.end, { state: "open", direction: "blocked_on_them" }),
    ]);
    expect(m.cost.total).toBe(
      DEFAULT_COST_MATRIX.superseded_as_open + DEFAULT_COST_MATRIX.direction_inverted,
    );
  });

  test("a mutual confusion is in the matrix but is not charged as an inversion", () => {
    const thread = makeThread([truthLoop({ direction: "mutual" })]);
    const m = score(thread, [at(exact.start, exact.end, { direction: "blocked_on_them" })]);
    expect(m.direction.accuracy).toBe(0);
    expect(m.cost.by_kind.direction_inverted.count).toBe(0);
    expect(m.cost.total).toBe(0);
  });

  test("a correct match costs nothing", () => {
    const m = score(makeThread([truthLoop()]), [at(exact.start, exact.end)]);
    expect(costedErrors(outcomesOf(makeThread([truthLoop()]), [at(exact.start, exact.end)], matchThread(makeThread([truthLoop()]), [at(exact.start, exact.end)], 0.5))[0]!)).toEqual([]);
    expect(m.cost.total).toBe(0);
  });
});

describe("summariseCost", () => {
  test("per-thread cost divides by threads, and survives zero threads", () => {
    const errors = [{ kind: "false_negative" } as const, { kind: "false_negative" } as const];
    expect(summariseCost(errors, 4).per_thread).toBe(0.5);
    expect(summariseCost(errors, 0).per_thread).toBe(0);
  });

  test("costOfError covers every kind in the matrix", () => {
    expect(costOfError({ kind: "false_negative" })).toBe(1);
    expect(costOfError({ kind: "false_positive", direction: "blocked_on_them" })).toBe(8);
    expect(costOfError({ kind: "superseded_as_open" })).toBe(8);
    expect(costOfError({ kind: "direction_inverted" })).toBe(8);
  });
});
