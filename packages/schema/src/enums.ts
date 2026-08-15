/**
 * enums — the closed vocabularies of the benchmark.
 *
 * Every one of these is deliberately closed. An open string here would let a
 * labeler (or a future extractor) invent a category, and the moment a category
 * can be invented the metric stops being comparable across runs. If a real
 * case does not fit, the fix is to widen the enum here in one place and
 * re-validate the whole corpus — not to special-case it at a call site.
 */

import { z } from "zod";

/** Transport the thread was captured from. Affects register and message shape. */
export const CHANNELS = ["whatsapp", "email", "slack", "imessage"] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

/**
 * Who owes whom — read from the benchmark subject's point of view.
 *
 *   blocked_on_them — the counterparty owes the subject.
 *   blocked_on_you  — the subject owes the counterparty.
 *   mutual          — neither side can move without the other (a scheduling
 *                     handshake, a "let's find a time" that both must answer).
 *
 * This field is the autonomy boundary, not a display label. A downstream system
 * may eventually auto-nudge on `blocked_on_them`. It must never act
 * autonomously on `blocked_on_you` — that would be the system speaking for the
 * subject to a third party. A direction error is therefore a safety error, not
 * a ranking error, and the eval package must report it separately.
 */
export const DIRECTIONS = ["blocked_on_them", "blocked_on_you", "mutual"] as const;
export const DirectionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * Lifecycle of the commitment as of the END of the thread.
 *
 *   open       — still outstanding when the thread ends.
 *   closed     — the thing that was promised actually happened, in-thread.
 *   superseded — the commitment was cancelled, delegated away, or overwritten
 *                by a later commitment. The obligation as originally stated no
 *                longer exists, and nothing in the thread proves it was met.
 *
 * `superseded` is the headline metric of this benchmark. Naive extractors read
 * the promise, never read the retraction four messages later, and report a live
 * loop. See corpus/LABELING.md for the closed-vs-superseded rule.
 */
export const STATES = ["open", "closed", "superseded"] as const;
export const StateSchema = z.enum(STATES);
export type State = z.infer<typeof StateSchema>;

/**
 * Language register of the span the loop was extracted from — not of the thread.
 * One thread can contain loops of different registers.
 *
 *   en    — English.
 *   hi-en — Hindi/English code-mixing, romanized ("kal tak bhej dunga").
 *   ta-en — Tamil/English code-mixing, romanized ("naaliki anuppiduven").
 *   other — anything else, including other Indic code-mixes.
 */
export const REGISTERS = ["en", "hi-en", "ta-en", "other"] as const;
export const RegisterSchema = z.enum(REGISTERS);
export type Register = z.infer<typeof RegisterSchema>;

/**
 * How firmly the deadline was stated.
 *
 *   explicit — a date or a named time the sender committed to ("by Friday",
 *              "kal tak", "before the 14th").
 *   implied  — a deadline the surrounding context forces but nobody stated
 *              ("before the board call" where the call's date is known).
 *   none     — no deadline at all. Requires raw === null and resolved === null.
 */
export const CERTAINTIES = ["explicit", "implied", "none"] as const;
export const CertaintySchema = z.enum(CERTAINTIES);
export type Certainty = z.infer<typeof CertaintySchema>;

/**
 * The reserved sender id for the benchmark subject — the person whose open
 * loops are being measured. Every other sender string is a counterparty name.
 */
export const SUBJECT = "user" as const;

/** True if `sender` is the benchmark subject rather than a counterparty. */
export function isSubject(sender: string): boolean {
  return sender === SUBJECT;
}
