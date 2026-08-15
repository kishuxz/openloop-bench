/**
 * Matcher tests.
 *
 * The matcher is the one real design decision in this package, so it is tested
 * on the cases where the decision is visible rather than on the happy path:
 * an exact hit, a partial overlap on each side of the threshold, two
 * predictions contesting one true loop, no overlap at all, a span that resolves
 * to nothing, and the unmappable marker.
 *
 * The threshold cases are written as pairs: the same overlap scored at two
 * thresholds: because that is the property that matters: the classification
 * changes with the constant, and the constant is a judgment call somebody made.
 */

import { describe, expect, test } from "vitest";
import { matchThread, spanContainsEither, spanIoU } from "../src/match.js";
import { UNMAPPABLE } from "../src/prediction.js";
import { at, EVIDENCE, makeThread, truthLoop, withEvidence } from "./helpers.js";

describe("span overlap primitives", () => {
  test("is 1 for identical spans", () => {
    expect(spanIoU(EVIDENCE, EVIDENCE)).toBe(1);
  });

  test("is 0 across different messages, however similar the offsets", () => {
    expect(spanIoU({ msg_index: 0, start: 4, end: 34 }, EVIDENCE)).toBe(0);
  });

  test("is 0 for adjacent ranges that touch but do not overlap", () => {
    expect(spanIoU({ msg_index: 1, start: 0, end: 4 }, { msg_index: 1, start: 4, end: 10 })).toBe(0);
  });

  test("is 0 for a zero-width or inverted span rather than NaN", () => {
    expect(spanIoU({ msg_index: 1, start: 5, end: 5 }, EVIDENCE)).toBe(0);
    expect(spanIoU({ msg_index: 1, start: 20, end: 10 }, EVIDENCE)).toBe(0);
  });

  test("IoU is intersection over union", () => {
    // Prediction covers the truth entirely and twice its width: 30 / 60.
    expect(spanIoU({ msg_index: 1, start: 4, end: 34 }, { msg_index: 1, start: 4, end: 19 })).toBeCloseTo(0.5);
  });

  test("containment is tracked separately from IoU", () => {
    expect(spanContainsEither({ msg_index: 1, start: 4, end: 34 }, { msg_index: 1, start: 20, end: 34 })).toBe(true);
    expect(spanIoU({ msg_index: 1, start: 4, end: 34 }, { msg_index: 1, start: 20, end: 34 })).toBeCloseTo(0.467, 3);
  });
});

describe("exact match", () => {
  const thread = makeThread([truthLoop()]);
  const match = matchThread(thread, [at(EVIDENCE.start, EVIDENCE.end)], 0.5);

  test("matches at IoU 1.0", () => {
    expect(match.matched).toEqual([{ pred_index: 0, truth_index: 0, iou: 1 }]);
  });

  test("leaves nothing unmatched", () => {
    expect(match.unmatched_predictions).toEqual([]);
    expect(match.unmatched_truths).toEqual([]);
    expect(match.near_misses).toEqual([]);
  });
});

describe("partial overlap either side of the threshold", () => {
  const thread = makeThread([truthLoop()]);
  // Truth is [4, 34). Prediction [0, 24) intersects 20, unions 34: IoU 0.588.
  const prediction = at(0, 24);

  test("matches when the threshold is below the overlap", () => {
    const match = matchThread(thread, [prediction], 0.5);
    expect(match.matched).toHaveLength(1);
    expect(match.matched[0]?.iou).toBeCloseTo(0.588, 3);
    expect(match.unmatched_truths).toEqual([]);
  });

  test("becomes a false positive AND a false negative when the threshold is above it", () => {
    const match = matchThread(thread, [prediction], 0.7);
    expect(match.matched).toEqual([]);
    expect(match.unmatched_predictions).toEqual([0]);
    expect(match.unmatched_truths).toEqual([0]);
  });

  test("records the miss as a near miss with its IoU, so it can be reviewed", () => {
    const match = matchThread(thread, [prediction], 0.7);
    expect(match.near_misses).toHaveLength(1);
    expect(match.near_misses[0]?.reason).toBe("below_threshold");
    expect(match.near_misses[0]?.iou).toBeCloseTo(0.588, 3);
  });
});

describe("containment-first matching", () => {
  const thread = makeThread([truthLoop({ evidence: { msg_index: 1, start: 20, end: 34 } })]);
  const prediction = at(4, 34);

  test("matches a same-message containing span even below the IoU threshold", () => {
    const match = matchThread(thread, [prediction], 0.7);
    expect(match.matched).toHaveLength(1);
    expect(match.matched[0]?.iou).toBeCloseTo(0.467, 3);
    expect(match.unmatched_predictions).toEqual([]);
    expect(match.unmatched_truths).toEqual([]);
    expect(match.near_misses).toEqual([]);
  });
});

describe("two predictions over one true loop", () => {
  const thread = makeThread([truthLoop()]);
  // [4, 34) truth. First prediction 0.8 IoU, second 0.6.
  const predictions = [at(4, 28), at(10, 34)];
  const match = matchThread(thread, predictions, 0.5);

  test("the higher IoU takes the match", () => {
    expect(match.matched).toHaveLength(1);
    expect(match.matched[0]?.pred_index).toBe(0);
  });

  test("the loser is a false positive, not a second match", () => {
    expect(match.unmatched_predictions).toEqual([1]);
    expect(match.unmatched_truths).toEqual([]);
  });

  test("the loser is recorded as having lost a contest, not as below threshold", () => {
    const lost = match.near_misses.filter((n) => n.reason === "lost_contest");
    expect(lost).toHaveLength(1);
    expect(lost[0]?.pred_index).toBe(1);
  });

  test("the split is counted as its own error mode", () => {
    expect(match.split_truths).toEqual([{ truth_index: 0, pred_indices: [0, 1] }]);
    expect(match.merged_predictions).toEqual([]);
  });

  test("assignment does not depend on the order the predictions arrive in", () => {
    const reversed = matchThread(thread, [predictions[1]!, predictions[0]!], 0.5);
    expect(reversed.matched[0]?.iou).toBeCloseTo(match.matched[0]!.iou, 10);
    expect(reversed.split_truths).toHaveLength(1);
  });
});

describe("one prediction over two true loops", () => {
  const thread = makeThread([
    truthLoop({ evidence: { msg_index: 1, start: 4, end: 20 } }),
    truthLoop({ statement: "confirm tonight", evidence: { msg_index: 1, start: 14, end: 34 } }),
  ]);
  const match = matchThread(thread, [at(4, 34)], 0.3);

  test("matches only one of them and counts the merge", () => {
    expect(match.matched).toHaveLength(1);
    expect(match.unmatched_truths).toHaveLength(1);
    expect(match.merged_predictions).toEqual([{ pred_index: 0, truth_indices: [0, 1] }]);
  });
});

describe("zero overlap", () => {
  const thread = makeThread([truthLoop()]);

  test("a prediction in the same message but a different place matches nothing", () => {
    const match = matchThread(thread, [at(0, 3)], 0.3);
    expect(match.matched).toEqual([]);
    expect(match.unmatched_predictions).toEqual([0]);
    expect(match.unmatched_truths).toEqual([0]);
    expect(match.near_misses).toEqual([]);
  });

  test("the same offsets in a different message match nothing", () => {
    const match = matchThread(thread, [withEvidence({ msg_index: 2, start: 4, end: 34 })], 0.3);
    expect(match.matched).toEqual([]);
    expect(match.unmatched_predictions).toEqual([0]);
  });
});

describe("ungrounded evidence", () => {
  const thread = makeThread([truthLoop()]);
  // Message 1 is 34 characters; this span runs off the end and resolves to nothing.
  const match = matchThread(thread, [at(4, 90)], 0.3);

  test("never matches, however much it appears to overlap", () => {
    expect(match.matched).toEqual([]);
  });

  test("is a false positive and is flagged as ungrounded", () => {
    expect(match.unmatched_predictions).toEqual([0]);
    expect(match.ungrounded_predictions).toEqual([0]);
  });
});

describe("unmappable evidence", () => {
  const thread = makeThread([truthLoop()]);
  const match = matchThread(thread, [withEvidence(UNMAPPABLE)], 0.5);

  test("is set aside: not matched, and not a false positive", () => {
    expect(match.matched).toEqual([]);
    expect(match.unmappable_predictions).toEqual([0]);
    expect(match.unmatched_predictions).toEqual([]);
  });

  test("does not rescue the truth it might have been", () => {
    expect(match.unmatched_truths).toEqual([0]);
  });

  test("does not suppress a real match made by a mappable prediction beside it", () => {
    const both = matchThread(thread, [withEvidence(UNMAPPABLE), at(EVIDENCE.start, EVIDENCE.end)], 0.5);
    expect(both.matched).toEqual([{ pred_index: 1, truth_index: 0, iou: 1 }]);
    expect(both.unmappable_predictions).toEqual([0]);
  });
});

describe("empty cases", () => {
  test("a negative thread with no predictions produces no decisions at all", () => {
    const match = matchThread(makeThread([]), [], 0.5);
    expect(match.matched).toEqual([]);
    expect(match.unmatched_predictions).toEqual([]);
    expect(match.unmatched_truths).toEqual([]);
  });

  test("a negative thread with a prediction produces a false positive", () => {
    const match = matchThread(makeThread([]), [at(4, 34)], 0.5);
    expect(match.unmatched_predictions).toEqual([0]);
  });
});
