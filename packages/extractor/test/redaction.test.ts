import { describe, expect, test } from "vitest";
import {
  buildRedactionPlan,
  mapOriginalOffsetToRedacted,
  mapRedactedSpanToOriginal,
  redactText,
} from "../src/redaction.js";

function mustMap(offset: ReturnType<typeof mapOriginalOffsetToRedacted>): number {
  expect(offset.ok).toBe(true);
  if (!offset.ok) throw new Error(offset.reason);
  return offset.offset;
}

describe("redaction offset maps", () => {
  test("maps a span back when a redaction sits before it", () => {
    const original = "Priya will send the deck before Friday";
    const plan = buildRedactionPlan(["Priya"]);
    const redacted = redactText(original, plan);
    const originalSpan = {
      msg_index: 0,
      start: original.indexOf("before"),
      end: original.length,
    };
    const redactedSpan = {
      msg_index: 0,
      start: mustMap(mapOriginalOffsetToRedacted(redacted.offsetMap, originalSpan.start)),
      end: mustMap(mapOriginalOffsetToRedacted(redacted.offsetMap, originalSpan.end)),
    };

    const mapped = mapRedactedSpanToOriginal(new Map([[0, redacted.offsetMap]]), redactedSpan, "evidence");

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(original.slice(mapped.span.start, mapped.span.end)).toBe(original.slice(originalSpan.start, originalSpan.end));
  });

  test("maps a span back when a redaction sits inside it", () => {
    const original = "send Priya the deck";
    const plan = buildRedactionPlan(["Priya"]);
    const redacted = redactText(original, plan);
    const originalSpan = { msg_index: 0, start: 0, end: original.length };
    const redactedSpan = {
      msg_index: 0,
      start: mustMap(mapOriginalOffsetToRedacted(redacted.offsetMap, originalSpan.start)),
      end: mustMap(mapOriginalOffsetToRedacted(redacted.offsetMap, originalSpan.end)),
    };

    const mapped = mapRedactedSpanToOriginal(new Map([[0, redacted.offsetMap]]), redactedSpan, "evidence");

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(original.slice(mapped.span.start, mapped.span.end)).toBe(original.slice(originalSpan.start, originalSpan.end));
  });

  test("marks a span unmappable when its boundary falls inside a redaction", () => {
    const original = "send Priya the deck";
    const plan = buildRedactionPlan(["Priya"]);
    const redacted = redactText(original, plan);
    const segment = redacted.offsetMap.segments[0];
    expect(segment).toBeDefined();
    if (!segment) throw new Error("missing redaction segment");

    const mapped = mapRedactedSpanToOriginal(
      new Map([[0, redacted.offsetMap]]),
      {
        msg_index: 0,
        start: segment.redactedStart + 1,
        end: segment.redactedEnd,
      },
      "evidence",
    );

    expect(mapped.ok).toBe(false);
    if (mapped.ok) throw new Error("span unexpectedly mapped");
    expect(mapped.reason).toBe("inside_redaction");
  });
});
