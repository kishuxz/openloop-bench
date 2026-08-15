/**
 * message — one line in a thread.
 *
 * `index` duplicates the array position on purpose. Evidence spans reference a
 * message by number, and a JSON array offers no way to assert that the number a
 * label points at is the message a human was looking at when they wrote it. The
 * thread validator asserts `messages[i].index === i`, so the redundancy is
 * checked rather than trusted, and a hand-edit that deletes a message can no
 * longer silently re-point every span after it.
 */

import { z } from "zod";
import { IsoTimestampSchema } from "./temporal.js";

export const MessageSchema = z
  .strictObject({
    /** 0-based position in `thread.messages`. Must equal the array index. */
    index: z.int().min(0),

    /**
     * `"user"` for the benchmark subject; otherwise the counterparty's display
     * name as it appears in the thread. Placeholder names only — no real
     * contact details anywhere in this corpus.
     */
    sender: z.string().min(1),

    /**
     * Verbatim message text. Never normalized: typos, missing capitals, double
     * spaces and trailing whitespace are all load-bearing, because evidence
     * spans are character offsets into exactly this string. Normalizing text
     * after labeling silently invalidates every span in the thread.
     */
    text: z.string().min(1),

    /** ISO 8601 instant with an explicit offset. */
    ts: IsoTimestampSchema,
  })
  .describe("One message in a thread");

export type Message = z.infer<typeof MessageSchema>;
