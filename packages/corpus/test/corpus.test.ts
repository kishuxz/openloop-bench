/**
 * Corpus tests. Two jobs:
 *
 *   1. Every shipped thread is valid and grounded. This duplicates
 *      `pnpm validate` on purpose — a validator nobody runs in CI is a
 *      validator that rots.
 *   2. The composition is what the benchmark claims it is. A distribution
 *      stated only in a README drifts the first time somebody adds a thread.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { resolveSpan, type Loop, type Thread } from "@openloop-bench/schema";
import { BUCKETS, bucketOf } from "../src/buckets.js";
import { loadThreads, threadFiles, THREADS_DIR } from "../src/load.js";

const { loaded, failures } = loadThreads();
const threads: Thread[] = loaded.map((l) => l.thread);
const loops: Loop[] = threads.flatMap((t) => t.loops);
const SPLITS = ["dev", "test"] as const;

describe("every thread file", () => {
  test("parses and grounds", () => {
    expect(failures.map((f) => `${f.file}: ${f.problems.join("; ")}`)).toEqual([]);
    expect(threads.length).toBeGreaterThan(0);
  });

  test("has a thread_id matching its filename", () => {
    for (const { file, thread } of loaded) {
      expect(thread.thread_id).toBe(basename(file, ".json"));
    }
  });

  test("belongs to a declared bucket", () => {
    for (const thread of threads) {
      expect(bucketOf(thread.thread_id), thread.thread_id).not.toBeNull();
    }
  });

  test("is formatted as 2-space JSON with a trailing newline", () => {
    for (const file of threadFiles()) {
      const raw = readFileSync(join(THREADS_DIR, file), "utf-8");
      const thread: unknown = JSON.parse(raw);
      expect(raw, file).toBe(`${JSON.stringify(thread, null, 2)}\n`);
    }
  });
});

describe("every span resolves to real text", () => {
  test("evidence", () => {
    for (const thread of threads) {
      for (const loop of thread.loops) {
        expect(resolveSpan(thread.messages, loop.evidence), `${thread.thread_id}: ${loop.statement}`).not.toBeNull();
      }
    }
  });

  test("resolution", () => {
    for (const thread of threads) {
      for (const loop of thread.loops) {
        if (!loop.resolution) continue;
        expect(resolveSpan(thread.messages, loop.resolution), `${thread.thread_id}: ${loop.statement}`).not.toBeNull();
      }
    }
  });

  test("deadline", () => {
    for (const thread of threads) {
      for (const loop of thread.loops) {
        if (!loop.deadline.span) continue;
        expect(resolveSpan(thread.messages, loop.deadline.span), `${thread.thread_id}: ${loop.statement}`).not.toBeNull();
      }
    }
  });

  test("and points at something a reader could use — no single-character evidence", () => {
    for (const thread of threads) {
      for (const loop of thread.loops) {
        const text = resolveSpan(thread.messages, loop.evidence) ?? "";
        expect(text.trim().length, `${thread.thread_id}: ${loop.statement}`).toBeGreaterThan(3);
      }
    }
  });
});

describe("composition", () => {
  test("holds exactly the threads the bucket targets specify", () => {
    const total = BUCKETS.reduce((n, b) => n + b.target, 0);
    expect(threads.length).toBe(total);
    for (const bucket of BUCKETS) {
      const count = threads.filter((t) => bucketOf(t.thread_id) === bucket.prefix).length;
      expect(count, bucket.label).toBe(bucket.target);
    }
  });

  test("puts every bucket in both splits", () => {
    for (const bucket of BUCKETS) {
      for (const split of SPLITS) {
        const count = threads.filter((t) => bucketOf(t.thread_id) === bucket.prefix && t.split === split).length;
        expect(count, `${bucket.label} in ${split}`).toBeGreaterThan(0);
      }
    }
  });

  test("splits roughly 40/60 dev/test", () => {
    const dev = threads.filter((t) => t.split === "dev").length;
    expect(dev / threads.length).toBeGreaterThanOrEqual(0.3);
    expect(dev / threads.length).toBeLessThanOrEqual(0.5);
  });

  test("carries its full quota of negative threads, and they are genuinely empty", () => {
    const negatives = threads.filter((t) => bucketOf(t.thread_id) === "neg");
    expect(negatives.length).toBe(BUCKETS.find((b) => b.prefix === "neg")?.target);
    for (const thread of negatives) {
      expect(thread.loops, thread.thread_id).toEqual([]);
    }
  });

  test("puts every state, direction and certainty in both splits", () => {
    // Iterating on prompts against a dev split with no closed loops in it
    // would leave the closed-vs-superseded distinction untestable until the
    // scored run, which is exactly the wrong time to discover it.
    const dimensions = {
      state: (l: Loop) => l.state,
      direction: (l: Loop) => l.direction,
      certainty: (l: Loop) => l.deadline.certainty,
    };
    for (const [name, pluck] of Object.entries(dimensions)) {
      const values = new Set(loops.map(pluck));
      for (const value of values) {
        for (const split of SPLITS) {
          const count = threads
            .filter((t) => t.split === split)
            .flatMap((t) => t.loops)
            .filter((l) => pluck(l) === value).length;
          expect(count, `${name}=${value} in ${split}`).toBeGreaterThan(0);
        }
      }
    }
  });

  test("carries code-mixed loops in both hi-en and ta-en", () => {
    expect(loops.filter((l) => l.register === "hi-en").length).toBeGreaterThanOrEqual(5);
    expect(loops.filter((l) => l.register === "ta-en").length).toBeGreaterThanOrEqual(5);
  });

  test("carries superseded loops well beyond the sup bucket", () => {
    // Supersession is the headline metric. If it only ever appeared in threads
    // whose id starts with "sup", an extractor could learn the filename.
    const superseded = threads.filter((t) => t.loops.some((l) => l.state === "superseded"));
    const buckets = new Set(superseded.map((t) => bucketOf(t.thread_id)));
    expect(buckets.size).toBeGreaterThan(1);
    expect(superseded.length).toBeGreaterThanOrEqual(Math.floor(threads.length / 4));
  });

  test("labels at least one loop against an off-thread counterparty", () => {
    const offThread = threads.flatMap((t) =>
      t.loops.filter((l) => !t.messages.some((m) => m.sender === l.counterparty)),
    );
    expect(offThread.length).toBeGreaterThan(0);
  });
});

describe("labels stay honest", () => {
  test("no loop resolves a deadline it never stated and never implied", () => {
    for (const loop of loops) {
      if (loop.deadline.certainty === "none") expect(loop.deadline.resolved).toBeNull();
    }
  });

  test("statements are descriptions, not pasted quotes", () => {
    for (const thread of threads) {
      for (const loop of thread.loops) {
        const evidence = resolveSpan(thread.messages, loop.evidence) ?? "";
        expect(loop.statement, thread.thread_id).not.toBe(evidence);
      }
    }
  });

  test("notes, where present, say something", () => {
    for (const loop of loops) {
      if (loop.notes === undefined) continue;
      expect(loop.notes.length).toBeGreaterThan(20);
    }
  });
});

describe("the corpus is not trivially separable", () => {
  test("both positive and negative threads contain commitment-shaped language", () => {
    // If negatives were only distinguishable by length or by the absence of
    // future-tense verbs, the benchmark would measure keyword matching.
    const negatives = threads.filter((t) => t.loops.length === 0);
    // Construction families, not a keyword list: first-person volitionals in
    // each register, hortatives, and the modal-obligation phrasings that carry
    // most English near-misses. The original list was English-centric and
    // failed four code-mixed negatives that are commitment-shaped in Hindi or
    // Tamil — see DRIFT.md, batch 1.
    const cue = new RegExp(
      [
        "\\b(i'?ll|we'?ll|will|won'?t|lets|let'?s|shall|should|gonna)\\b",
        "\\b(happy to|anytime|whenever|at some point|sometime)\\b",
        "\\b(dunga|dungi|doonga|karunga|karungi|sochunga|bhejta|deta hu|dekhta hu|dijiye|dijiyega|milte)\\b",
        "\\b(panren|pandren|panduven|panniduven|mudichiduven|anuppuren|varen|pogalam|pesalam|kandippa)\\b",
        // Tamil necessitative -anum ("paakanum", "pannanum") is the direct
        // analogue of English "should", and carries the same near-miss weight.
        "\\b\\w{2,}anum\\b",
        "\\b(yaaravadhu|yaarachum|koi)\\b",
      ].join("|"),
      "i",
    );
    for (const thread of negatives) {
      const hasCue = thread.messages.some((m) => cue.test(m.text));
      expect(hasCue, `${thread.thread_id} has no commitment-shaped language`).toBe(true);
    }
  });

  test("negative threads are not obviously shorter than positive ones", () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const negLength = mean(threads.filter((t) => t.loops.length === 0).map((t) => t.messages.length));
    const posLength = mean(threads.filter((t) => t.loops.length > 0).map((t) => t.messages.length));
    expect(Math.abs(negLength - posLength)).toBeLessThan(1.5);
  });
});
