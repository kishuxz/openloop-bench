/**
 * The validator's own tests, built on deliberately malformed fixtures.
 *
 * `test/fixtures/valid-control.json` is the same thread with nothing wrong
 * with it. Every malformed fixture is that control with exactly one fault
 * introduced, so a test that asserts "this fixture is rejected" is asserting
 * that the specific rule fires — not that the fixture happens to be broken in
 * some other way too. If the control ever stops parsing, every other
 * assertion in this file becomes meaningless, which is why it is checked
 * first.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ThreadSchema } from "@openloop-bench/schema";
import { checkComposition } from "../src/composition.js";
import { loadThreads } from "../src/load.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf-8"));
}

function rejectionReason(name: string): string {
  const result = ThreadSchema.safeParse(fixture(name));
  expect(result.success, `${name} was accepted; the validator has stopped catching it`).toBe(false);
  return result.success ? "" : result.error.issues.map((i) => i.message).join(" | ");
}

describe("the control fixture", () => {
  test("parses — without this, every rejection below proves nothing", () => {
    const result = ThreadSchema.safeParse(fixture("valid-control"));
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toEqual([]);
  });
});

describe("malformed fixtures are rejected, for the stated reason", () => {
  test("a span that overruns its message", () => {
    expect(rejectionReason("malformed-span-overruns")).toContain("overruns message");
  });

  test("a superseded loop with no resolution span", () => {
    expect(rejectionReason("malformed-superseded-without-resolution")).toContain("resolution span");
  });

  test("a resolution that precedes the commitment it claims to resolve", () => {
    expect(rejectionReason("malformed-resolution-before-evidence")).toContain("strictly later");
  });

  test("an implied deadline that points at a phrase", () => {
    expect(rejectionReason("malformed-implied-deadline-with-span")).toContain("null");
  });

  test("a message index that disagrees with its position", () => {
    expect(rejectionReason("malformed-message-index-mismatch")).toContain("does not match array position");
  });

  test("evidence pointing at whitespace", () => {
    expect(rejectionReason("malformed-whitespace-only-span")).toContain("whitespace");
  });
});

describe("the loader", () => {
  test("reports failures per file instead of throwing on the first one", () => {
    const { loaded, failures } = loadThreads(FIXTURES);
    expect(failures.length).toBe(6);
    expect(loaded.length).toBe(1);
    for (const failure of failures) {
      expect(failure.problems.length, failure.file).toBeGreaterThan(0);
      expect(failure.problems[0]).toMatch(/^[\w.()]+: /);
    }
  });

  test("survives a file that is not JSON at all", () => {
    const { failures } = loadThreads(join(import.meta.dirname, "fixtures-broken"));
    expect(failures.some((f) => f.problems.some((p) => p.includes("not valid JSON")))).toBe(true);
  });
});

describe("composition checks", () => {
  test("pass on the shipped corpus", () => {
    const { loaded } = loadThreads();
    expect(checkComposition(loaded.map((l) => l.thread))).toEqual([]);
  });

  test("catch a bucket that is empty in one split", () => {
    const { loaded } = loadThreads();
    const threads = loaded.map((l) => l.thread);
    const moved = threads.map((t) => (t.split === "dev" && t.thread_id.startsWith("neg-") ? { ...t, split: "test" as const } : t));
    const failures = checkComposition(moved);
    expect(failures.join(" ")).toContain("empty in the dev split");
  });

  test("catch a bucket that has drifted off its target count", () => {
    const { loaded } = loadThreads();
    const threads = loaded.map((l) => l.thread).filter((t) => t.thread_id !== "en-10");
    expect(checkComposition(threads).join(" ")).toContain('bucket "en"');
  });
});
