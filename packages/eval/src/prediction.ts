/**
 * prediction — the file format an extractor must emit to be scored.
 *
 * This is the contract between Phase 3 (the extractor) and Phase 4 (this
 * package). It is deliberately NOT the corpus schema, for three reasons that
 * each correspond to something the benchmark exists to measure:
 *
 *   1. **No ids.** A predicted loop has no identity. Deciding which prediction
 *      is which ground-truth loop is the matcher's job (`match.ts`), and it is
 *      the one real design decision in the eval. Handing the extractor an id
 *      to fill in would let it assert a match it did not earn.
 *
 *   2. **Spans are not required to resolve.** `ThreadSchema` refuses to parse a
 *      label whose spans do not point at real text, because a corpus is allowed
 *      to demand that of itself. A prediction is not: an evidence span that
 *      overruns its message is a *fabrication*, and fabrication rate is a
 *      headline number here. Rejecting the file at parse time would delete the
 *      measurement. So the span shape is checked and the grounding is scored.
 *
 *   3. **Cross-field consistency is not enforced either.** An extractor that
 *      says `certainty: "explicit"` and gives no span, or `state: "closed"`
 *      with no resolution span, has made a real and interesting error. The
 *      corpus schema calls those unparseable; here they are data points.
 *
 * What IS enforced is everything whose violation would make the file
 * un-scoreable rather than wrong: the closed enums, integer offsets, the split,
 * and the provenance block. A prediction file that cannot say which corpus,
 * which prompt and which model produced it cannot be compared against another
 * one, and comparing runs is the entire point.
 *
 * `notes` is rejected outright. It is the labeler's private reasoning about
 * hard calls, it frequently states the answer, and it exists in exactly one
 * place: the ground truth. A prediction carrying a `notes` field is a sign the
 * ground truth leaked into the extractor's context, so the parse fails loudly
 * rather than scoring it.
 */

import { z } from "zod";
import {
  CertaintySchema,
  DirectionSchema,
  IsoDateSchema,
  RegisterSchema,
  SplitSchema,
  StateSchema,
} from "@openloop-bench/schema";

/** Bumped when the shape changes in a way that invalidates older files. */
export const PREDICTION_FORMAT = 1;

/**
 * The marker an extractor emits when it found a loop but cannot express where.
 *
 * This happens under PII redaction: the model reads redacted text, points at a
 * span in it, and the offsets cannot be carried back to the original message —
 * the redaction changed the string's length. The span is neither right nor
 * wrong, and `metrics.ts` counts it in its own column rather than letting it
 * quietly become a false positive (which would punish the extractor for the
 * redactor's behaviour) or a match (which would be unearned credit).
 */
export const UNMAPPABLE = "unmappable" as const;

/**
 * A span as an extractor emits it: integer offsets, no ordering refinement, no
 * grounding check. `start >= end` is legal here and scores as ungrounded.
 */
export const PredictedOffsetsSchema = z.strictObject({
  msg_index: z.int().min(0),
  start: z.int().min(0),
  end: z.int().min(0),
});
export type PredictedOffsets = z.infer<typeof PredictedOffsetsSchema>;

/** Offsets, or the redaction marker. */
export const PredictedSpanSchema = z.union([PredictedOffsetsSchema, z.literal(UNMAPPABLE)]);
export type PredictedSpan = z.infer<typeof PredictedSpanSchema>;

/** True when the span carries offsets rather than the unmappable marker. */
export function hasOffsets(span: PredictedSpan | null): span is PredictedOffsets {
  return span !== null && span !== UNMAPPABLE;
}

export const PredictedDeadlineSchema = z.strictObject({
  span: PredictedSpanSchema.nullable(),
  /**
   * Free string rather than `IsoDateSchema`: an extractor that resolves "kal
   * tak" to "tomorrow" or to `2026-13-45` has made an error worth counting,
   * and a parse failure would count it as a whole missing prediction instead.
   */
  resolved: z.string().nullable(),
  certainty: CertaintySchema,
});
export type PredictedDeadline = z.infer<typeof PredictedDeadlineSchema>;

export const PredictedLoopSchema = z.strictObject({
  statement: z.string().min(1),
  direction: DirectionSchema,
  counterparty: z.string().min(1),
  deadline: PredictedDeadlineSchema,
  evidence: PredictedSpanSchema,
  resolution: PredictedSpanSchema.nullable(),
  state: StateSchema,
  register: RegisterSchema,
});
export type PredictedLoop = z.infer<typeof PredictedLoopSchema>;

export const ThreadPredictionSchema = z.strictObject({
  thread_id: z.string().min(1),
  loops: z.array(PredictedLoopSchema),
});
export type ThreadPrediction = z.infer<typeof ThreadPredictionSchema>;

/**
 * Everything needed to reproduce the run that produced this file.
 *
 * All of it is printed in the report, unedited. A benchmark number without the
 * model id and the sampling parameters beside it is a number that cannot be
 * challenged, and this repo's whole posture is that every number should be.
 */
export const RunMetaSchema = z.strictObject({
  /** Short slug identifying this configuration. Appears in every filename. */
  config: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "config must be lowercase-kebab-case (it becomes a filename)"),
  model_id: z.string().min(1),
  prompt_version: z.string().min(1),
  /** Whatever knobs the run used. Printed verbatim, sorted by key. */
  sampling: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  /**
   * Content hash of the corpus the predictions were generated against, in the
   * form `corpusHash()` returns. Scoring refuses if it differs from the corpus
   * on disk — see `evaluate.ts`.
   */
  corpus_hash: z.string().min(8),
  split: SplitSchema,
  /**
   * Date of the run, `YYYY-MM-DD`. Carried in the file rather than read from
   * the clock so that `pnpm report` is byte-for-byte reproducible: a report
   * that changes every midnight cannot be diffed.
   */
  generated_at: IsoDateSchema,
  /** Optional free text — what this configuration was trying. */
  notes: z.string().min(1).optional(),
});
export type RunMeta = z.infer<typeof RunMetaSchema>;

export const PredictionFileSchema = z.strictObject({
  format: z.literal(PREDICTION_FORMAT),
  meta: RunMetaSchema,
  predictions: z.array(ThreadPredictionSchema),
});
export type PredictionFile = z.infer<typeof PredictionFileSchema>;

const ExtractorPredictionSchema = z.strictObject({
  schema_version: z.literal(1),
  run: z.strictObject({
    config: z.string().min(1),
    split: SplitSchema,
    prompt_version: z.string().min(1),
    corpus_hash: z.string().min(8),
    created_at: z.string().min(1),
  }).passthrough(),
  model: z.strictObject({
    id: z.string().min(1),
    sampling: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    json_mode: z.boolean().optional(),
  }).passthrough(),
  predictions: z.array(
    z.strictObject({
      thread_id: z.string().min(1),
      parsed_loops: z.array(PredictedLoopSchema),
    }).passthrough(),
  ),
}).passthrough();

function generatedDate(createdAt: string): string {
  const match = createdAt.match(/^\d{4}-\d{2}-\d{2}/u);
  return match?.[0] ?? new Date().toISOString().slice(0, 10);
}

/**
 * Accept the extractor's richer artifact shape and normalize it to the eval
 * contract. This keeps prediction data immutable: scoring adapts at the reader
 * boundary instead of rewriting committed model outputs into a second format.
 */
export function normalizePredictionFile(json: unknown): PredictionFile {
  const direct = PredictionFileSchema.safeParse(json);
  if (direct.success) return direct.data;

  const extractor = ExtractorPredictionSchema.safeParse(json);
  if (!extractor.success) {
    const directMessage = direct.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    const extractorMessage = extractor.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`not eval format (${directMessage}); not extractor format (${extractorMessage})`);
  }

  const value = extractor.data;
  return {
    format: PREDICTION_FORMAT,
    meta: {
      config: value.run.config,
      model_id: value.model.id,
      prompt_version: value.run.prompt_version,
      sampling: {
        ...value.model.sampling,
        ...(value.model.json_mode === undefined ? {} : { json_mode: value.model.json_mode }),
      },
      corpus_hash: value.run.corpus_hash,
      split: value.run.split,
      generated_at: generatedDate(value.run.created_at),
    },
    predictions: value.predictions.map((prediction) => ({
      thread_id: prediction.thread_id,
      loops: prediction.parsed_loops,
    })),
  };
}

/** Every prediction in the file, flattened, keeping the thread it came from. */
export function allPredictedLoops(
  file: PredictionFile,
): Array<{ thread_id: string; loop: PredictedLoop }> {
  return file.predictions.flatMap((p) => p.loops.map((loop) => ({ thread_id: p.thread_id, loop })));
}
