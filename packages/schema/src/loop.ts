/**
 * loop — one labeled open loop: a commitment outstanding between two people.
 *
 * The design constraint behind this file is that a label must be checkable
 * without asking a human whether it looks right. Every claim a label makes
 * about the text is therefore a character span, never a quoted string. A quote
 * can be typed from memory, paraphrased, or hallucinated wholesale and still
 * read as plausible; an offset pair either resolves to real characters in the
 * referenced message or it does not, and the validator decides, not a
 * reviewer's patience.
 *
 * A loop carries three spans, and each one answers a different question:
 *
 *   evidence        — where the loop was CREATED. Always present.
 *   resolution      — where it was closed or superseded. Null iff state "open".
 *   deadline.span   — where the due date was STATED, which is frequently not
 *                     the same message as the commitment: deadlines get
 *                     negotiated a few turns later ("can you do friday?"
 *                     "ok friday").
 *
 * Cross-field checks that need the whole thread (span resolution, message
 * bounds) live in `thread.ts` — a Loop in isolation cannot see its own text.
 * Checks that only need the loop live here.
 */

import { z } from "zod";
import { CertaintySchema, DirectionSchema, RegisterSchema, StateSchema, SUBJECT } from "./enums.js";
import { IsoDateSchema } from "./temporal.js";

/**
 * A half-open character span `[start, end)` into `thread.messages[msg_index].text`,
 * measured in UTF-16 code units — i.e. exactly what `String.prototype.slice`
 * takes. Offsets are validated against the referenced message in `thread.ts`,
 * including a guard against a boundary landing inside a surrogate pair.
 */
export const SpanSchema = z
  .strictObject({
    msg_index: z.int().min(0),
    start: z.int().min(0),
    end: z.int().min(0),
  })
  .refine((s) => s.start < s.end, {
    path: ["end"],
    message: "end must be greater than start (a zero-width span grounds nothing)",
  })
  .describe("A half-open character span into one message's text");

export type Span = z.infer<typeof SpanSchema>;

/** The span proving the loop was created. Same shape as any other span. */
export const EvidenceSchema = SpanSchema.describe(
  "Character span proving the commitment was made",
);
export type Evidence = Span;

/**
 * When the commitment is due.
 *
 * There is no `raw` string field. The source phrasing is `span` resolved
 * against the text, so "kal tak" is recoverable exactly as typed and cannot
 * drift from the message it came from — a labeler cannot quietly upgrade it to
 * "by tomorrow" and delete the code-mixed temporal expression this benchmark
 * exists to measure. Use `deadlineText()` rather than slicing by hand.
 *
 * Consistency rules, enforced here because they need no thread context:
 *   - "explicit" requires a span. Somebody said a time; point at where.
 *   - "implied" requires span === null. The whole meaning of implied is that
 *     nobody stated it — if there is a phrase to point at, it is explicit.
 *   - "none" requires span === null and resolved === null.
 *   - "explicit" may still have resolved === null: "agle hafte" is real
 *     phrasing that does not name a day. Resolving it anyway would be the
 *     labeler inventing a date, which is the failure mode this benchmark
 *     measures rather than commits.
 */
export const DeadlineSchema = z
  .strictObject({
    /** Where the due date was stated. Null unless certainty is "explicit". */
    span: SpanSchema.nullable(),

    /**
     * The deadline grounded to a day, resolved against the timestamp of the
     * message it was stated in. Null when nothing resolves to a date.
     */
    resolved: IsoDateSchema.nullable(),

    certainty: CertaintySchema,
  })
  .superRefine((deadline, ctx) => {
    if (deadline.certainty === "explicit") {
      if (deadline.span === null) {
        ctx.addIssue({
          code: "custom",
          path: ["span"],
          message:
            'certainty "explicit" requires a span pointing at the stated deadline; use "implied" if nobody said it',
        });
      }
      return;
    }

    if (deadline.span !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["span"],
        message: `certainty "${deadline.certainty}" requires span to be null; a phrase you can point at makes it "explicit"`,
      });
    }
    if (deadline.certainty === "none" && deadline.resolved !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["resolved"],
        message: 'certainty "none" requires resolved to be null (nothing to resolve from)',
      });
    }
  })
  .describe("When the commitment is due, and how firmly that was stated");

export type Deadline = z.infer<typeof DeadlineSchema>;

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

    /** Where the commitment was created. See the file header. */
    evidence: EvidenceSchema,

    /**
     * Where the commitment stopped being outstanding — the delivery, the
     * cancellation, the handoff. Null iff `state` is "open".
     *
     * This is what makes `superseded` auditable rather than an opinion: a
     * label claiming a loop was retracted must point at the retraction, in a
     * message strictly later than the one that created the loop.
     */
    resolution: SpanSchema.nullable(),

    state: StateSchema,

    register: RegisterSchema,

    /**
     * Labeler metadata. Free-text reasoning for the genuinely ambiguous calls,
     * the ones written up in corpus/LABELING.md.
     *
     * NEVER put this in an extractor prompt, and NEVER compare it during eval.
     * It is a human's private reasoning about a hard call, which means it
     * frequently states the answer outright ("counted as superseded because
     * Ravi sent it instead"). Feeding it to a model under test would leak the
     * label; scoring against it would score prose, not extraction. It exists
     * so a disputed label carries its own justification instead of that
     * justification living only in a reviewer's head.
     */
    notes: z.string().min(1).optional(),
  })
  .superRefine((loop, ctx) => {
    if (loop.counterparty === SUBJECT) {
      ctx.addIssue({
        code: "custom",
        path: ["counterparty"],
        message: `counterparty must not be "${SUBJECT}" — that id is reserved for the benchmark subject`,
      });
    }

    if (loop.state === "open") {
      if (loop.resolution !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["resolution"],
          message: 'state "open" requires resolution to be null — an open loop has not been resolved',
        });
      }
      return;
    }

    if (loop.resolution === null) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: `state "${loop.state}" requires a resolution span pointing at the message that ${
          loop.state === "closed" ? "delivered" : "cancelled, delegated or overtook"
        } it`,
      });
      return;
    }

    // A commitment cannot be resolved by the message that created it, nor by
    // one that came earlier. Without this, "superseded" would be assertable
    // against any text in the thread.
    if (loop.resolution.msg_index <= loop.evidence.msg_index) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution", "msg_index"],
        message: `resolution must be in a message strictly later than the evidence (resolution ${loop.resolution.msg_index} <= evidence ${loop.evidence.msg_index})`,
      });
    }
  })
  .describe("One labeled open loop");

export type Loop = z.infer<typeof LoopSchema>;
