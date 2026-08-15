/**
 * Metrics tests, written against the denominators rather than the arithmetic.
 *
 * Every one of these asserts a rule stated in `metrics.ts`: label metrics are
 * over matched pairs only, unmappable predictions are in no rate at all,
 * grounding counts unmatched predictions too, and a breakdown group's thread
 * count includes threads that produced nothing. Those are the decisions a later
 * refactor can silently reverse while every number still looks plausible.
 */

import { describe, expect, test } from "vitest";
import type { Thread } from "@openloop-bench/schema";
import { matchThread } from "../src/match.js";
import {
  computeBreakdowns,
  computeMetrics,
  lengthBin,
  loopsBin,
  outcomesOf,
  type Outcome,
} from "../src/metrics.js";
import { UNMAPPABLE, type PredictedLoop } from "../src/prediction.js";
import { at, EVIDENCE, makeThread, truthLoop, withEvidence } from "./helpers.js";

function outcomes(thread: Thread, predictions: PredictedLoop[], iou = 0.5): Outcome[] {
  return outcomesOf(thread, predictions, matchThread(thread, predictions, iou));
}

function score(thread: Thread, predictions: PredictedLoop[], iou = 0.5) {
  return computeMetrics(outcomes(thread, predictions, iou), 1);
}

const exact = { start: EVIDENCE.start, end: EVIDENCE.end };

describe("detection", () => {
  test("counts a match as one true positive and nothing else", () => {
    const m = score(makeThread([truthLoop()]), [at(exact.start, exact.end)]);
    expect(m.detection).toMatchObject({ tp: 1, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 });
  });

  test("a prediction on a thread with no loops is a false positive", () => {
    const m = score(makeThread([]), [at(exact.start, exact.end)]);
    expect(m.detection).toMatchObject({ tp: 0, fp: 1, fn: 0, precision: 0 });
  });

  test("silence on a thread with no loops is scored as nothing, not as a win", () => {
    const m = score(makeThread([]), []);
    expect(m.detection).toMatchObject({ tp: 0, fp: 0, fn: 0 });
    expect(m.cost.total).toBe(0);
  });

  test("zero denominators produce 0, never NaN", () => {
    const m = score(makeThread([]), []);
    expect(m.detection.precision).toBe(0);
    expect(m.detection.f1).toBe(0);
    expect(m.direction.accuracy).toBe(0);
  });

  test("containment is detection, and IoU becomes span tightness", () => {
    const thread = makeThread([truthLoop({ evidence: { msg_index: 1, start: 20, end: 34 } })]);
    const m = score(thread, [at(4, 34)], 0.7);
    expect(m.detection).toMatchObject({ tp: 1, fp: 0, fn: 0 });
    expect(m.span_tightness).toMatchObject({ matched: 1 });
    expect(m.span_tightness.mean_iou).toBeCloseTo(0.467, 3);
  });
});

describe("label metrics are over matched pairs only", () => {
  const thread = makeThread([
    truthLoop({ direction: "blocked_on_them", evidence: { msg_index: 1, start: 4, end: 20 } }),
    truthLoop({ statement: "confirm tonight", direction: "blocked_on_you", evidence: { msg_index: 0, start: 8, end: 34 } }),
  ]);

  test("an undetected loop does not appear in the direction matrix", () => {
    // Only the first loop is predicted, and its direction is right.
    const m = score(thread, [at(4, 20, { direction: "blocked_on_them" })]);
    expect(m.detection.fn).toBe(1);
    expect(m.direction.n).toBe(1);
    expect(m.direction.accuracy).toBe(1);
  });

  test("a false positive does not appear in the state matrix", () => {
    const m = score(makeThread([]), [at(4, 20, { state: "closed" })]);
    expect(m.state.n).toBe(0);
  });
});

describe("supersession is reported on its own denominator", () => {
  const superseded = truthLoop({
    state: "superseded",
    resolution: { msg_index: 2, start: 0, end: 34 },
  });

  test("counts only truly-superseded pairs, not all state errors", () => {
    const m = score(makeThread([superseded]), [at(exact.start, exact.end, { state: "open" })]);
    expect(m.state.superseded_as_open).toEqual({ count: 1, of: 1, rate: 1 });
  });

  test("superseded read as closed is a state error but not this one", () => {
    const m = score(makeThread([superseded]), [
      at(exact.start, exact.end, { state: "closed", resolution: { msg_index: 2, start: 0, end: 34 } }),
    ]);
    expect(m.state.superseded_as_open.count).toBe(0);
    expect(m.state.accuracy).toBe(0);
  });
});

describe("unmappable predictions", () => {
  const thread = makeThread([truthLoop()]);
  const m = score(thread, [withEvidence(UNMAPPABLE)]);

  test("are in no detection column", () => {
    expect(m.detection).toMatchObject({ tp: 0, fp: 0, fn: 1 });
  });

  test("do not damage precision", () => {
    expect(m.detection.precision).toBe(0);
    expect(m.grounding.of).toBe(0);
  });

  test("are counted in their own column, with the false-negative ceiling they imply", () => {
    expect(m.unmappable.predictions).toBe(1);
    expect(m.unmappable.fn_ceiling).toBe(1);
  });

  test("the ceiling never exceeds the false negatives it could explain", () => {
    const two = score(makeThread([truthLoop()]), [withEvidence(UNMAPPABLE), withEvidence(UNMAPPABLE)]);
    expect(two.unmappable.predictions).toBe(2);
    expect(two.unmappable.fn_ceiling).toBe(1);
    expect(two.detection.fn).toBe(1);
  });
});

describe("grounding", () => {
  test("an unresolvable span is a false positive and a grounding failure", () => {
    const m = score(makeThread([truthLoop()]), [at(4, 900)]);
    expect(m.detection.fp).toBe(1);
    expect(m.grounding).toEqual({ grounded: 0, of: 1, rate: 0 });
  });

  test("counts matched predictions too, so the rate is over everything mappable", () => {
    const m = score(makeThread([truthLoop()]), [at(exact.start, exact.end), at(4, 900)]);
    expect(m.grounding).toEqual({ grounded: 1, of: 2, rate: 0.5 });
  });
});

describe("deadline metrics", () => {
  const withDeadline = truthLoop({
    deadline: { span: { msg_index: 1, start: 27, end: 34 }, resolved: "2026-03-03", certainty: "explicit" },
  });

  test("exact date match is over pairs whose truth has a date", () => {
    const m = score(makeThread([withDeadline]), [
      at(exact.start, exact.end, {
        deadline: { span: { msg_index: 1, start: 27, end: 34 }, resolved: "2026-03-03", certainty: "explicit" },
      }),
    ]);
    expect(m.deadline_resolved).toMatchObject({ exact: 1, of: 1, rate: 1, hallucinated: 0, missing: 0 });
    expect(m.deadline_span).toMatchObject({ found: 1, of: 1, rate: 1, missing: 0 });
  });

  test("a date invented where the truth resolves to none is counted apart from the rate", () => {
    const m = score(makeThread([truthLoop()]), [
      at(exact.start, exact.end, {
        deadline: { span: null, resolved: "2026-03-03", certainty: "implied" },
      }),
    ]);
    expect(m.deadline_resolved.hallucinated).toBe(1);
    expect(m.deadline_resolved.of).toBe(0);
    expect(m.deadline_span.spurious).toBe(0);
  });

  test("a missing date is not the same as a wrong one", () => {
    const m = score(makeThread([withDeadline]), [
      at(exact.start, exact.end, { deadline: { span: null, resolved: null, certainty: "implied" } }),
    ]);
    expect(m.deadline_resolved).toMatchObject({ exact: 0, of: 1, missing: 1 });
    expect(m.deadline_span).toMatchObject({ found: 0, of: 1, missing: 1 });
    expect(m.certainty.accuracy).toBe(0);
  });

  test("finding the deadline quote is separate from resolving the date", () => {
    const m = score(makeThread([withDeadline]), [
      at(exact.start, exact.end, {
        deadline: { span: { msg_index: 1, start: 27, end: 34 }, resolved: null, certainty: "explicit" },
      }),
    ]);
    expect(m.deadline_span).toMatchObject({ found: 1, of: 1, rate: 1 });
    expect(m.deadline_resolved).toMatchObject({ exact: 0, of: 1, missing: 1 });
  });
});

describe("resolution spans", () => {
  const resolved = truthLoop({ state: "closed", resolution: { msg_index: 2, start: 0, end: 34 } });

  test("scores the message index and the overlap", () => {
    const m = score(makeThread([resolved]), [
      at(exact.start, exact.end, { state: "closed", resolution: { msg_index: 2, start: 0, end: 17 } }),
    ]);
    expect(m.resolution_span).toMatchObject({ of: 1, scored: 1, msg_index_correct: 1 });
    expect(m.resolution_span.mean_iou).toBeCloseTo(0.5);
  });

  test("a missing resolution is not scored as a bad one", () => {
    const m = score(makeThread([resolved]), [at(exact.start, exact.end, { state: "closed" })]);
    expect(m.resolution_span).toMatchObject({ of: 1, scored: 0, missing: 1 });
  });

  test("an unmappable resolution is in its own column", () => {
    const m = score(makeThread([resolved]), [
      at(exact.start, exact.end, { state: "closed", resolution: UNMAPPABLE }),
    ]);
    expect(m.resolution_span).toMatchObject({ scored: 0, unmappable: 1 });
    expect(m.unmappable.resolution_spans).toBe(1);
  });

  test("claiming a resolution for an open loop is spurious", () => {
    const m = score(makeThread([truthLoop()]), [
      at(exact.start, exact.end, { resolution: { msg_index: 2, start: 0, end: 10 } }),
    ]);
    expect(m.resolution_span.spurious).toBe(1);
  });
});

describe("breakdown bins", () => {
  test("thread length bins are contiguous", () => {
    expect(lengthBin(1)).toBe("1-4 msgs");
    expect(lengthBin(4)).toBe("1-4 msgs");
    expect(lengthBin(5)).toBe("5-6 msgs");
    expect(lengthBin(9)).toBe("7-9 msgs");
    expect(lengthBin(40)).toBe("10+ msgs");
  });

  test("loops-per-thread bins separate the negatives", () => {
    expect(loopsBin(0)).toBe("0 loops");
    expect(loopsBin(3)).toBe("3+ loops");
    expect(loopsBin(9)).toBe("3+ loops");
  });
});

describe("breakdown attribution", () => {
  const negative = makeThread([], { thread_id: "neg-01" });
  const positive = makeThread([truthLoop({ register: "hi-en" })], { thread_id: "mix-01" });

  const all = [
    ...outcomes(negative, [at(4, 20, { register: "ta-en", direction: "blocked_on_them" })]),
    ...outcomes(positive, [at(exact.start, exact.end, { register: "hi-en" })]),
  ];
  const breakdowns = computeBreakdowns(all, [negative, positive]);

  const group = (b: { groups: Array<{ key: string; metrics: unknown }> }, key: string) =>
    b.groups.find((g) => g.key === key)?.metrics as ReturnType<typeof computeMetrics>;

  test("a false positive is attributed to the register it claimed", () => {
    expect(group(breakdowns.by_register, "ta-en").detection.fp).toBe(1);
    expect(group(breakdowns.by_register, "hi-en").detection.tp).toBe(1);
  });

  test("threads with no outcomes still count in thread-keyed groups", () => {
    const quiet = makeThread([], { thread_id: "neg-02" });
    const withQuiet = computeBreakdowns(all, [negative, positive, quiet]);
    expect(group(withQuiet.by_loops_per_thread, "0 loops").threads).toBe(2);
    expect(group(withQuiet.by_bucket, "neg").threads).toBe(2);
  });

  test("the zero-loop row is the negative-thread false-positive rate", () => {
    const zero = group(breakdowns.by_loops_per_thread, "0 loops");
    expect(zero).toMatchObject({ truth_loops: 0 });
    expect(zero.detection.fp).toBe(1);
  });
});
