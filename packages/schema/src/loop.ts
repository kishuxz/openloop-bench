/**
 * loop — one labeled open loop: a commitment outstanding between two people.
 *
 * The design constraint behind this file is that a label must be checkable
 * without asking a human whether it looks right. Two fields carry that weight:
 *
 *   evidence — a character span, never a quoted string. A quote can be typed
 *              from memory, paraphrased, or hallucinated wholesale and still
 *              read as plausible. An offset pair either resolves to real
 *              characters in the referenced message or it does not, and the
 *              validator decides, not a reviewer's patience.
 *
 *   deadline.raw — the exact source phrasing, asserted to appear verbatim
 *              somewhere in the thread. "kal tak" must be recoverable as
 *              typed; a labeler cannot quietly upgrade it to "by tomorrow"
 *              and lose the thing this benchmark is actually testing.
 *
 * Cross-field checks that need the thread (span resolution, raw-phrase
 * grounding) live in `thread.ts` — a Loop in isolation cannot see its own text.
 */

import { z } from "zod";
import { CertaintySchema, DirectionSchema, RegisterSchema, StateSchema, SUBJECT } from "./enums.js";
import { IsoDateSchema } from "./temporal.js";

/**
 * When the commitment is due.
 *
 * Consistency rules, enforced here because they need no thread context:
 *   - certainty "none" requires raw === null and resolved === null. A deadline
 *     nobody stated cannot have source phrasing.
 *   - certainty "explicit" or "implied" requires a non-empty raw. If there is
 *     no phrasing to point at, the certainty is "none".
 *   - resolved may be null even when raw is present: "sometime next quarter"
 *     is real phrasing that does not resolve to a day. Resolving it anyway
 *     would be the labeler inventing a date, which is the exact failure mode
 *     this benchmark exists to measure.
 */
export const DeadlineSchema = z
  .strictObject({
    /** Exact source phrasing, verbatim ("kal tak", "by EOD Friday", "parso"). */
    raw: z.string().min(1).nullable(),

    /**
     * `raw` grounded to a day, resolved against the timestamp of the message
     * the phrase appeared in. Null when the phrasing does not name a day.
     */
    resolved: IsoDateSchema.nullable(),

    certainty: CertaintySchema,
  })
  .superRefine((deadline, ctx) => {
    if (deadline.certainty === "none") {
      if (deadline.raw !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["raw"],
          message: 'certainty "none" requires raw to be null (no phrasing was stated)',
        });
      }
      if (deadline.resolved !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["resolved"],
          message: 'certainty "none" requires resolved to be null (nothing to resolve from)',
        });
      }
      return;
    }
    if (deadline.raw === null) {
      ctx.addIssue({
        code: "custom",
        path: ["raw"],
        message: `certainty "${deadline.certainty}" requires raw source phrasing; use "none" if nothing was stated`,
      });
    }
  })
  .describe("When the commitment is due, and how firmly that was stated");

export type Deadline = z.infer<typeof DeadlineSchema>;

/**
 * A half-open character span `[start, end)` into `thread.messages[msg_index].text`,
 * measured in UTF-16 code units — i.e. exactly what `String.prototype.slice`
 * takes. Offsets are validated against the referenced message in `thread.ts`,
 * including a guard against a boundary landing inside a surrogate pair.
 */
export const EvidenceSchema = z
  .strictObject({
    msg_index: z.int().min(0),
    start: z.int().min(0),
    end: z.int().min(0),
  })
  .refine((e) => e.start < e.end, {
    path: ["end"],
    message: "end must be greater than start (a zero-width span grounds nothing)",
  })
  .describe("Character span proving the loop exists in the text");

export type Evidence = z.infer<typeof EvidenceSchema>;

export const LoopSchema = z
  .strictObject({
    /**
     * Natural-language description of the obligation, written by the labeler.
     * Not a quote — the quote is `evidence`. Phrase it so it stands alone
     * outside the thread: "send the updated cap table to Priya".
     */
    statement: z.string().min(3),

    direction: DirectionSchema,

    /**
     * The other party to the obligation. Usually a `sender` in the thread, but
     * deliberately not required to be: under delegation the counterparty
     * becomes someone who never sent a message ("Arjun will send it").
     * Never `"user"` — the subject is not their own counterparty.
     */
    counterparty: z.string().min(1),

    deadline: DeadlineSchema,

    /** Where in the thread this loop is proven. See `EvidenceSchema`. */
    evidence: EvidenceSchema,

    state: StateSchema,

    register: RegisterSchema,

    /**
     * Optional labeler note. Reserved for genuinely ambiguous calls — the ones
     * written up in corpus/LABELING.md. Not read by any metric; it exists so a
     * disputed label carries its own reasoning instead of that reasoning living
     * only in a reviewer's head.
     */
    notes: z.string().min(1).optional(),
  })
  .refine((loop) => loop.counterparty !== SUBJECT, {
    path: ["counterparty"],
    message: `counterparty must not be "${SUBJECT}" — that id is reserved for the benchmark subject`,
  })
  .describe("One labeled open loop");

export type Loop = z.infer<typeof LoopSchema>;
