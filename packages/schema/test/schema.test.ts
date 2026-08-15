/**
 * Schema invariants. Each test names the failure it prevents, because a
 * schema test that only asserts "valid input parses" would pass against a
 * schema with every refinement deleted.
 */

import { describe, expect, test } from "vitest";
import {
  DeadlineSchema,
  LoopSchema,
  MessageSchema,
  SpanSchema,
  ThreadSchema,
  isCalendarDate,
  isTimestamp,
  isSubject,
} from "../src/index.js";
import { loop, thread } from "./helpers.js";

/** Collect issue messages so a test can assert on the reason, not just failure. */
function reasons(result: { success: boolean; error?: { issues: readonly { message: string }[] } }): string {
  return (result.error?.issues ?? []).map((i) => i.message).join(" | ");
}

describe("thread", () => {
  test("a well-formed thread parses", () => {
    expect(ThreadSchema.safeParse(thread()).success).toBe(true);
  });

  test("rejects unknown keys anywhere; the schema is a contract, not a suggestion", () => {
    const extra = { ...thread(), urgency: "high" };
    expect(ThreadSchema.safeParse(extra).success).toBe(false);
  });

  test("rejects a message whose index disagrees with its array position", () => {
    const t = thread();
    t.messages[2]!.index = 7;
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("does not match array position");
  });

  test("rejects messages out of chronological order", () => {
    const t = thread();
    t.messages[2]!.ts = "2026-03-01T09:00:00+05:30";
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("chronological");
  });

  test("accepts a thread with zero loops; the negatives are ground truth too", () => {
    expect(ThreadSchema.safeParse({ ...thread(), loops: [] }).success).toBe(true);
  });

  test("rejects two loops with identical evidence, statement and direction", () => {
    const t = thread();
    t.loops = [loop(), loop()];
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("duplicate loop");
  });

  test("rejects a thread_id that is not a lowercase slug", () => {
    expect(ThreadSchema.safeParse({ ...thread(), thread_id: "Fixture_01" }).success).toBe(false);
  });
});

describe("span grounding", () => {
  test("rejects a span that overruns the message", () => {
    const t = thread();
    t.loops[0]!.evidence.end = 999;
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("overruns message");
  });

  test("rejects a msg_index past the end of the thread", () => {
    const t = thread();
    t.loops[0]!.evidence.msg_index = 42;
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("out of range");
  });

  test("rejects a whitespace-only span; evidence must point at words", () => {
    const t = thread();
    t.loops[0]!.evidence = { msg_index: 1, start: 3, end: 4 };
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("only whitespace");
  });

  test("rejects a zero-width span", () => {
    expect(SpanSchema.safeParse({ msg_index: 0, start: 5, end: 5 }).success).toBe(false);
  });

  test("rejects non-integer offsets", () => {
    expect(SpanSchema.safeParse({ msg_index: 0, start: 1.5, end: 4 }).success).toBe(false);
  });

  test("checks the resolution span, not only the evidence span", () => {
    const t = thread();
    t.loops[0]!.resolution = { msg_index: 2, start: 0, end: 5000 };
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("resolution");
  });

  test("checks the deadline span, not only the evidence span", () => {
    const t = thread();
    t.loops[0]!.deadline.span = { msg_index: 1, start: 0, end: 5000 };
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("deadline");
  });

  test("rejects a boundary that splits a surrogate pair", () => {
    const t = thread();
    // "ok 🙏 thanks": the emoji occupies two UTF-16 code units at 3 and 4.
    t.messages[2]!.text = "ok 🙏 thanks";
    t.loops[0]!.resolution = { msg_index: 2, start: 0, end: 4 };
    const result = ThreadSchema.safeParse(t);
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("surrogate pair");
  });

  test("accepts a span that contains a whole surrogate pair", () => {
    const t = thread();
    t.messages[2]!.text = "ok 🙏 thanks";
    t.loops[0]!.resolution = { msg_index: 2, start: 0, end: 5 };
    expect(ThreadSchema.safeParse(t).success).toBe(true);
  });
});

describe("resolution", () => {
  test("an open loop must not carry a resolution", () => {
    const result = LoopSchema.safeParse({ ...loop(), state: "open" });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("open");
  });

  test("a superseded loop must carry a resolution", () => {
    const result = LoopSchema.safeParse({ ...loop(), resolution: null });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("resolution span");
  });

  test("a closed loop must carry a resolution", () => {
    const result = LoopSchema.safeParse({ ...loop(), state: "closed", resolution: null });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("resolution span");
  });

  test("resolution must come after the evidence, not before it", () => {
    const result = LoopSchema.safeParse({
      ...loop(),
      resolution: { msg_index: 0, start: 0, end: 4 },
    });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("strictly later");
  });

  test("resolution must come after the evidence, not in the same message", () => {
    const result = LoopSchema.safeParse({
      ...loop(),
      resolution: { msg_index: 1, start: 0, end: 4 },
    });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("strictly later");
  });
});

describe("deadline", () => {
  const deadline = (over: Record<string, unknown>) =>
    DeadlineSchema.safeParse({
      span: null,
      resolved: null,
      certainty: "none",
      ...over,
    });

  test('"explicit" requires a span, otherwise there is no source phrasing', () => {
    const result = deadline({ certainty: "explicit" });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("requires a span");
  });

  test('"implied" forbids a span; a phrase you can point at makes it explicit', () => {
    const result = deadline({ certainty: "implied", span: { msg_index: 1, start: 12, end: 31 } });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("null");
  });

  test('"implied" may still resolve to a date', () => {
    expect(deadline({ certainty: "implied", resolved: "2026-03-20" }).success).toBe(true);
  });

  test('"none" forbids a resolved date', () => {
    expect(deadline({ resolved: "2026-03-20" }).success).toBe(false);
  });

  test('"explicit" may resolve to null, since "agle hafte" names no day', () => {
    expect(deadline({ certainty: "explicit", span: { msg_index: 1, start: 12, end: 31 } }).success).toBe(true);
  });

  test("rejects a date that matches the format but is not a real day", () => {
    expect(deadline({ certainty: "implied", resolved: "2026-02-30" }).success).toBe(false);
  });
});

describe("loop fields", () => {
  test('counterparty must not be "user"; the subject is not their own counterparty', () => {
    const result = LoopSchema.safeParse({ ...loop(), counterparty: "user" });
    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("reserved");
  });

  test("counterparty may be someone who never sent a message (delegation)", () => {
    expect(LoopSchema.safeParse({ ...loop(), counterparty: "Arjun" }).success).toBe(true);
  });

  test("notes are optional", () => {
    expect(LoopSchema.safeParse({ ...loop(), notes: "close call" }).success).toBe(true);
  });

  test("rejects an unknown direction", () => {
    expect(LoopSchema.safeParse({ ...loop(), direction: "waiting" }).success).toBe(false);
  });

  test("rejects an unknown register", () => {
    expect(LoopSchema.safeParse({ ...loop(), register: "hinglish" }).success).toBe(false);
  });
});

describe("message", () => {
  test("requires a timestamp offset, because half this corpus is IST", () => {
    const base = { index: 0, sender: "user", text: "hi", ts: "2026-03-02T11:04:00" };
    expect(MessageSchema.safeParse(base).success).toBe(false);
    expect(MessageSchema.safeParse({ ...base, ts: "2026-03-02T11:04:00+05:30" }).success).toBe(true);
    expect(MessageSchema.safeParse({ ...base, ts: "2026-03-02T05:34:00Z" }).success).toBe(true);
  });

  test("rejects empty text", () => {
    expect(MessageSchema.safeParse({ index: 0, sender: "user", text: "", ts: "2026-03-02T11:04:00Z" }).success).toBe(
      false,
    );
  });
});

describe("temporal primitives", () => {
  test("isCalendarDate rejects days that do not exist", () => {
    expect(isCalendarDate("2026-03-31")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-3-1")).toBe(false);
  });

  test("2028 is a leap year and 2026 is not", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
  });

  test("isTimestamp requires an explicit offset", () => {
    expect(isTimestamp("2026-03-02T11:04:00+05:30")).toBe(true);
    expect(isTimestamp("2026-03-02T11:04:00Z")).toBe(true);
    expect(isTimestamp("2026-03-02T11:04:00")).toBe(false);
    expect(isTimestamp("2026-03-02")).toBe(false);
  });
});

describe("subject", () => {
  test('only "user" is the benchmark subject', () => {
    expect(isSubject("user")).toBe(true);
    expect(isSubject("Priya")).toBe(false);
    expect(isSubject("User")).toBe(false);
  });
});
