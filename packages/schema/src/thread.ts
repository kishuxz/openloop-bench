/**
 * thread: a conversation plus its ground-truth labels.
 *
 * This file is where the benchmark's anti-fabrication guarantees are actually
 * enforced, because every one of them is a cross-field check: a Loop on its own
 * cannot see the text it claims to be grounded in.
 *
 * `ThreadSchema` refuses to produce a Thread whose spans do not resolve. All
 * three of them, evidence, resolution and deadline. That is deliberate: it
 * means "parsed successfully" and "grounded in real text" are the same event,
 * and no downstream consumer has to remember to run a second check.
 * `ThreadShapeSchema` is the unrefined shape, exported for tooling that needs
 * to report shape errors and grounding errors separately.
 */

import { z } from "zod";
import { ChannelSchema, SplitSchema } from "./enums.js";
import { LoopSchema, type Loop, type Span } from "./loop.js";
import { MessageSchema, type Message } from "./message.js";

/** `thread_id` must be a lowercase slug, because it is also the filename on disk. */
const THREAD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Structural shape only: types, enums, per-object consistency. Says nothing
 * about whether the labels are grounded in the text.
 */
export const ThreadShapeSchema = z
  .strictObject({
    /** Stable id, lowercase-kebab, matching the file's basename. */
    thread_id: z.string().regex(THREAD_ID, "thread_id must be lowercase-kebab-case"),

    channel: ChannelSchema,

    /**
     * Which half of the benchmark this thread belongs to. Prompt iteration
     * happens against `dev`; `test` is scored and must not be read while
     * tuning. Roughly 40/60 dev/test, with every distribution bucket present
     * in both. A split that holds all the negatives, or all the code-mixed
     * threads, would make the two halves measure different things.
     */
    split: SplitSchema,

    /**
     * Which authoring batch this thread was written in. Phase 1 is batch 0.
     *
     * Stored rather than derived from the id, because deriving it means
     * hard-coding per-bucket id ranges in every consumer, and the first
     * consumer that did so got `sup-07..09` and `del-07..08` wrong, because they read
     * as Phase 1 by their numbers and are not. The drift protocol compares
     * distributions between consecutive batches, so a wrong batch number
     * silently invalidates the comparison that exists to catch silent errors.
     */
    batch: z.int().min(0),

    messages: z.array(MessageSchema).min(1),

    /** Ground truth. Empty is a valid and important label; see the negatives. */
    loops: z.array(LoopSchema),
  })
  .describe("A conversation plus its ground-truth open-loop labels");

/** Shape-only thread. Prefer `Thread`, which is additionally grounded. */
export type ThreadShape = z.infer<typeof ThreadShapeSchema>;

/** Anything carrying the messages a span could point into. */
export interface HasMessages {
  readonly messages: readonly Message[];
}

/**
 * True if slicing `text` at `offset` would cut a surrogate pair in half.
 *
 * Offsets are UTF-16 code units, so a span boundary can land between the two
 * halves of an astral character (an emoji, most commonly). Such a span still
 * "resolves", to a lone surrogate that renders as a replacement character.
 * Rejecting it keeps every span in the corpus sliceable into real text.
 */
export function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const at = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && at >= 0xdc00 && at <= 0xdfff;
}

/**
 * Resolve a span to the text it points at, or null if it does not resolve.
 * The single implementation of "what does this span say", used by the
 * validator, the tests, and (later) the eval package's grounding check.
 */
export function resolveSpan(messages: readonly Message[], span: Span): string | null {
  const message = messages[span.msg_index];
  if (!message) return null;
  if (span.end > message.text.length) return null;
  if (span.start >= span.end) return null;
  if (splitsSurrogatePair(message.text, span.start)) return null;
  if (splitsSurrogatePair(message.text, span.end)) return null;
  return message.text.slice(span.start, span.end);
}

/** `resolveSpan` under the name that reads right at the evidence call site. */
export function resolveEvidence(messages: readonly Message[], evidence: Span): string | null {
  return resolveSpan(messages, evidence);
}

/**
 * The deadline exactly as it was typed, so "kal tak", "parso", "by EOD friday",
 * or null when no deadline was stated. Always use this rather than slicing:
 * the deadline span routinely sits in a different message than the evidence,
 * and hand-slicing against the wrong message is the easiest way to silently
 * fabricate source phrasing.
 */
export function deadlineText(thread: HasMessages, loop: Loop): string | null {
  const { span } = loop.deadline;
  if (span === null) return null;
  return resolveSpan(thread.messages, span);
}

/**
 * The full contract: shape + grounding. Parsing this successfully is the
 * benchmark's definition of a well-formed labeled thread.
 */
export const ThreadSchema = ThreadShapeSchema.superRefine((thread, ctx) => {
  const { messages, loops } = thread;

  // --- Message integrity -------------------------------------------------
  messages.forEach((message, i) => {
    if (message.index !== i) {
      ctx.addIssue({
        code: "custom",
        path: ["messages", i, "index"],
        message: `index ${message.index} does not match array position ${i}; spans reference messages by index, so the two must agree`,
      });
    }
  });

  for (let i = 1; i < messages.length; i++) {
    const previous = messages[i - 1];
    const current = messages[i];
    if (!previous || !current) continue;
    if (Date.parse(current.ts) < Date.parse(previous.ts)) {
      ctx.addIssue({
        code: "custom",
        path: ["messages", i, "ts"],
        message: `timestamp ${current.ts} precedes message ${i - 1} (${previous.ts}); threads must be in chronological order`,
      });
    }
  }

  // --- Span grounding ----------------------------------------------------
  /** Report every way a span can fail to point at real text. */
  const checkSpan = (span: Span, path: (string | number)[], label: string): void => {
    const message = messages[span.msg_index];

    if (!message) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "msg_index"],
        message: `${label}: msg_index ${span.msg_index} is out of range; thread has ${messages.length} message(s)`,
      });
      return;
    }

    if (span.end > message.text.length) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "end"],
        message: `${label}: span [${span.start}, ${span.end}) overruns message ${span.msg_index}, which is ${message.text.length} characters long`,
      });
      return;
    }

    if (splitsSurrogatePair(message.text, span.start) || splitsSurrogatePair(message.text, span.end)) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `${label}: span [${span.start}, ${span.end}) splits a surrogate pair in message ${span.msg_index}`,
      });
      return;
    }

    if (message.text.slice(span.start, span.end).trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `${label}: span [${span.start}, ${span.end}) in message ${span.msg_index} is only whitespace; a span must point at words`,
      });
    }
  };

  const seen = new Set<string>();

  loops.forEach((loop, i) => {
    checkSpan(loop.evidence, ["loops", i, "evidence"], "evidence");
    if (loop.resolution) {
      checkSpan(loop.resolution, ["loops", i, "resolution"], "resolution");
    }
    if (loop.deadline.span) {
      checkSpan(loop.deadline.span, ["loops", i, "deadline", "span"], "deadline");
    }

    const fingerprint = [
      loop.evidence.msg_index,
      loop.evidence.start,
      loop.evidence.end,
      loop.statement,
      loop.direction,
    ].join(" ");
    if (seen.has(fingerprint)) {
      ctx.addIssue({
        code: "custom",
        path: ["loops", i],
        message:
          "duplicate loop: same evidence span, statement and direction as an earlier loop in this thread",
      });
    }
    seen.add(fingerprint);
  });
});

/** A well-formed, fully grounded labeled thread. */
export type Thread = z.infer<typeof ThreadSchema>;

/**
 * The whole corpus. Thread ids must be unique, because they key every per-thread
 * metric the eval package will emit, and a silent collision would average two
 * different threads into one number.
 */
export const CorpusSchema = z.array(ThreadSchema).superRefine((threads, ctx) => {
  const seen = new Map<string, number>();
  threads.forEach((thread, i) => {
    const first = seen.get(thread.thread_id);
    if (first !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [i, "thread_id"],
        message: `duplicate thread_id "${thread.thread_id}" (also used at index ${first})`,
      });
      return;
    }
    seen.set(thread.thread_id, i);
  });
});

export type Corpus = z.infer<typeof CorpusSchema>;
