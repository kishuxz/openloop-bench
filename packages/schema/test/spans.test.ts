/**
 * Span resolution. `resolveSpan` is the one implementation of "what does this
 * span say": the validator, the tests and the eval package all go through it,
 * so its edge cases are worth pinning down precisely.
 */

import { describe, expect, test } from "vitest";
import { ThreadSchema, deadlineText, resolveEvidence, resolveSpan, splitsSurrogatePair } from "../src/index.js";
import { messages, thread } from "./helpers.js";

const msgs = messages();

describe("resolveSpan", () => {
  test("returns exactly the characters the offsets name", () => {
    expect(resolveSpan(msgs, { msg_index: 1, start: 0, end: 31 })).toBe("ill send it by tomorrow evening");
    expect(resolveSpan(msgs, { msg_index: 1, start: 12, end: 31 })).toBe("by tomorrow evening");
  });

  test("a span ending exactly at the end of the text resolves", () => {
    expect(resolveSpan(msgs, { msg_index: 0, start: 0, end: 12 })).toBe("deck update?");
  });

  test("one character past the end does not", () => {
    expect(resolveSpan(msgs, { msg_index: 0, start: 0, end: 13 })).toBeNull();
  });

  test("an out-of-range message does not", () => {
    expect(resolveSpan(msgs, { msg_index: 9, start: 0, end: 4 })).toBeNull();
  });

  test("a reversed or zero-width span does not", () => {
    expect(resolveSpan(msgs, { msg_index: 0, start: 5, end: 5 })).toBeNull();
    expect(resolveSpan(msgs, { msg_index: 0, start: 8, end: 3 })).toBeNull();
  });

  test("resolveEvidence is the same function under a name that reads better", () => {
    const span = { msg_index: 1, start: 0, end: 11 };
    expect(resolveEvidence(msgs, span)).toBe(resolveSpan(msgs, span));
  });
});

describe("surrogate pairs", () => {
  const emoji = [{ index: 0, sender: "user", text: "ok 🙏 thanks", ts: "2026-03-02T11:04:00+05:30" }];

  test("a boundary inside a pair is refused rather than returning a lone surrogate", () => {
    expect(splitsSurrogatePair(emoji[0]!.text, 4)).toBe(true);
    expect(resolveSpan(emoji, { msg_index: 0, start: 0, end: 4 })).toBeNull();
    expect(resolveSpan(emoji, { msg_index: 0, start: 4, end: 6 })).toBeNull();
  });

  test("boundaries either side of the pair are fine", () => {
    expect(splitsSurrogatePair(emoji[0]!.text, 3)).toBe(false);
    expect(splitsSurrogatePair(emoji[0]!.text, 5)).toBe(false);
    expect(resolveSpan(emoji, { msg_index: 0, start: 0, end: 5 })).toBe("ok 🙏");
  });

  test("the string boundaries are never treated as a split", () => {
    expect(splitsSurrogatePair(emoji[0]!.text, 0)).toBe(false);
    expect(splitsSurrogatePair(emoji[0]!.text, emoji[0]!.text.length)).toBe(false);
  });
});

describe("deadlineText", () => {
  test("returns the phrasing exactly as typed", () => {
    const parsed = ThreadSchema.parse(thread());
    expect(deadlineText(parsed, parsed.loops[0]!)).toBe("by tomorrow evening");
  });

  test("returns null when no deadline was stated", () => {
    const t = thread();
    t.loops[0]!.deadline = { span: null, resolved: null, certainty: "none" };
    const parsed = ThreadSchema.parse(t);
    expect(deadlineText(parsed, parsed.loops[0]!)).toBeNull();
  });

  test("resolves against the message the deadline is in, not the evidence message", () => {
    const t = thread();
    // Deadline negotiated a turn later, in a different message than the promise.
    t.messages[2]!.text = "ok but i need it by friday";
    t.loops[0]!.resolution = { msg_index: 2, start: 0, end: 2 };
    t.loops[0]!.deadline = { span: { msg_index: 2, start: 17, end: 26 }, resolved: "2026-03-06", certainty: "explicit" };
    const parsed = ThreadSchema.parse(t);
    expect(deadlineText(parsed, parsed.loops[0]!)).toBe("by friday");
  });
});
