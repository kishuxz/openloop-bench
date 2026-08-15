/**
 * Prediction format tests.
 *
 * The interesting assertions here are the *acceptances*: a span that does not
 * resolve, a `closed` state with no resolution, an "explicit" certainty with no
 * span. The corpus schema rejects all three, and this one must not, because each
 * is an extractor error the benchmark exists to count — rejecting the file would
 * delete the measurement and replace it with a crash.
 *
 * What is rejected is anything that makes the file un-scoreable: an unknown
 * enum, a missing provenance field, and `notes` — which exists only in ground
 * truth and whose presence in a prediction means the answer leaked.
 */

import { describe, expect, test } from "vitest";
import { PREDICTION_FORMAT, PredictedLoopSchema, PredictionFileSchema, UNMAPPABLE, hasOffsets } from "../src/prediction.js";
import { predicted } from "./helpers.js";

function file(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: PREDICTION_FORMAT,
    meta: {
      config: "fixture-dev",
      model_id: "fixture://reference-v1",
      prompt_version: "fixture-0",
      sampling: { temperature: 0 },
      corpus_hash: "0123456789abcdef",
      split: "dev",
      generated_at: "2026-08-14",
    },
    predictions: [{ thread_id: "en-01", loops: [predicted()] }],
    ...overrides,
  };
}

describe("accepts what the eval needs to measure", () => {
  test("a span that resolves to nothing — fabrication is scored, not rejected", () => {
    const parsed = PredictedLoopSchema.safeParse({
      ...predicted(),
      evidence: { msg_index: 0, start: 9000, end: 9100 },
    });
    expect(parsed.success).toBe(true);
  });

  test("a zero-width span, which grounds nothing and scores as ungrounded", () => {
    expect(PredictedLoopSchema.safeParse({ ...predicted(), evidence: { msg_index: 0, start: 5, end: 5 } }).success).toBe(true);
  });

  test('"closed" with no resolution span — the corpus schema refuses this, we count it', () => {
    expect(PredictedLoopSchema.safeParse({ ...predicted(), state: "closed", resolution: null }).success).toBe(true);
  });

  test('"explicit" certainty with no deadline span', () => {
    const parsed = PredictedLoopSchema.safeParse({
      ...predicted(),
      deadline: { span: null, resolved: null, certainty: "explicit" },
    });
    expect(parsed.success).toBe(true);
  });

  test("a resolved date that is not a date — it can never match, which is the point", () => {
    const parsed = PredictedLoopSchema.safeParse({
      ...predicted(),
      deadline: { span: null, resolved: "tomorrow", certainty: "implied" },
    });
    expect(parsed.success).toBe(true);
  });

  test("the unmappable marker in any span position", () => {
    expect(PredictedLoopSchema.safeParse({ ...predicted(), evidence: UNMAPPABLE }).success).toBe(true);
    expect(PredictedLoopSchema.safeParse({ ...predicted(), resolution: UNMAPPABLE }).success).toBe(true);
  });
});

describe("rejects what makes a file un-scoreable", () => {
  test("an unknown direction", () => {
    expect(PredictedLoopSchema.safeParse({ ...predicted(), direction: "blocked_on_someone" }).success).toBe(false);
  });

  test("notes — that field exists only in ground truth, so its presence means a leak", () => {
    const parsed = PredictedLoopSchema.safeParse({ ...predicted(), notes: "superseded because Ravi sent it" });
    expect(parsed.success).toBe(false);
  });

  test("a missing model id", () => {
    const meta = { ...(file().meta as Record<string, unknown>) };
    delete meta.model_id;
    expect(PredictionFileSchema.safeParse(file({ meta })).success).toBe(false);
  });

  test("a missing corpus hash", () => {
    const meta = { ...(file().meta as Record<string, unknown>) };
    delete meta.corpus_hash;
    expect(PredictionFileSchema.safeParse(file({ meta })).success).toBe(false);
  });

  test("a config name that would not survive being a filename", () => {
    const meta = { ...(file().meta as Record<string, unknown>), config: "Fixture Dev/1" };
    expect(PredictionFileSchema.safeParse(file({ meta })).success).toBe(false);
  });

  test("a run date that is not a real calendar day", () => {
    const meta = { ...(file().meta as Record<string, unknown>), generated_at: "2026-02-30" };
    expect(PredictionFileSchema.safeParse(file({ meta })).success).toBe(false);
  });

  test("a format version this eval does not know", () => {
    expect(PredictionFileSchema.safeParse(file({ format: 99 })).success).toBe(false);
  });
});

describe("hasOffsets", () => {
  test("separates offsets from the marker and from null", () => {
    expect(hasOffsets({ msg_index: 0, start: 0, end: 1 })).toBe(true);
    expect(hasOffsets(UNMAPPABLE)).toBe(false);
    expect(hasOffsets(null)).toBe(false);
  });
});

describe("a well-formed file", () => {
  test("round-trips", () => {
    const parsed = PredictionFileSchema.safeParse(file());
    expect(parsed.success).toBe(true);
  });
});
