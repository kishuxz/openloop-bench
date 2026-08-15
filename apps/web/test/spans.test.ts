import { describe, expect, it } from "vitest";
import { results } from "../lib/results";
import { spanMatchesText } from "../lib/spans";

describe("failure gallery spans", () => {
  it("matches every fixture evidence span to its source text", () => {
    for (const failure of results.failures) {
      for (const label of [failure.true_label, failure.prediction]) {
        if (label.evidence === null) continue;
        expect(spanMatchesText(failure.thread.messages, label.evidence), failure.id).toBe(true);
      }
    }
  });
});
