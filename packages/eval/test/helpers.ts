/**
 * Test fixtures for the eval package.
 *
 * Threads are built through `ThreadSchema.parse`, not hand-typed as objects, so
 * a test can never be written against a thread the corpus itself would reject —
 * which would let the matcher be tested on inputs it will never see.
 */

import { ThreadSchema, type Loop, type Thread } from "@openloop-bench/schema";
import type { PredictedLoop, PredictedSpan } from "../src/prediction.js";

/** Message 1 is the one every test points at. Its text is 36 characters. */
export const MESSAGES = [
  { index: 0, sender: "Priya", text: "can you send the updated cap table?", ts: "2026-03-02T11:04:00+05:30" },
  { index: 1, sender: "user", text: "yes ill send the cap table tonight", ts: "2026-03-02T11:31:00+05:30" },
  { index: 2, sender: "Priya", text: "no rush, ravi already sent it over", ts: "2026-03-02T16:45:00+05:30" },
] as const;

/** [4, 34) — "ill send the cap table tonight", 30 characters. */
export const EVIDENCE = { msg_index: 1, start: 4, end: 34 } as const;

export function truthLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    statement: "send Priya the updated cap table",
    direction: "blocked_on_you",
    counterparty: "Priya",
    deadline: { span: null, resolved: null, certainty: "none" },
    evidence: { ...EVIDENCE },
    resolution: null,
    state: "open",
    register: "en",
    ...overrides,
  } as Loop;
}

export function makeThread(loops: Loop[], overrides: Partial<Thread> = {}): Thread {
  return ThreadSchema.parse({
    thread_id: "en-01",
    channel: "whatsapp",
    split: "dev",
    batch: 0,
    messages: MESSAGES.map((m) => ({ ...m })),
    loops,
    ...overrides,
  });
}

export function predicted(overrides: Partial<PredictedLoop> = {}): PredictedLoop {
  return {
    statement: "send the cap table to Priya",
    direction: "blocked_on_you",
    counterparty: "Priya",
    deadline: { span: null, resolved: null, certainty: "none" },
    evidence: { ...EVIDENCE },
    resolution: null,
    state: "open",
    register: "en",
    ...overrides,
  };
}

/** A prediction pointing at a given range in message 1. */
export function at(start: number, end: number, overrides: Partial<PredictedLoop> = {}): PredictedLoop {
  return predicted({ evidence: { msg_index: 1, start, end }, ...overrides });
}

export function withEvidence(span: PredictedSpan, overrides: Partial<PredictedLoop> = {}): PredictedLoop {
  return predicted({ evidence: span, ...overrides });
}
