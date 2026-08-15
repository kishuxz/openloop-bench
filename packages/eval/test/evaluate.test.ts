/**
 * End-to-end tests, and the three refusals.
 *
 * The refusals are the load-bearing part: an eval that scores a stale corpus,
 * a mismatched hash or a partial prediction file produces numbers that look
 * exactly like real ones. They are tested here rather than trusted.
 *
 * The end-to-end tests exploit the fact that the fixtures are *generated* with
 * declared damage (see `src/fixtures.ts`): the eval's output can be checked
 * against what was injected. A matcher that quietly loses pairs would still
 * produce plausible precision and recall, and this is what catches it.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { corpusHash } from "@openloop-bench/corpus";
import {
  buildMatchLog,
  coverageProblems,
  loadValidatedCorpus,
  readPredictionFile,
  scoreRun,
  threadsForSplit,
} from "../src/evaluate.js";
import { FIXTURE_SPECS, generateFixture } from "../src/fixtures.js";
import { FIXTURE_PREDICTIONS_DIR, matchesPath, metricsPath, writeJson } from "../src/paths.js";
import { DEFAULT_IOU, IOU_THRESHOLDS } from "../src/match.js";

const corpus = loadValidatedCorpus();
const dev = threadsForSplit(corpus, "dev");
const hash = corpusHash();

const fixturePath = (config: string): string => join(FIXTURE_PREDICTIONS_DIR, `${config}.json`);

describe("the corpus gate", () => {
  test("the corpus validates, and every dev thread is present", () => {
    expect(dev.length).toBeGreaterThan(0);
    expect(dev.every((t) => t.split === "dev")).toBe(true);
  });

  test("threads come back in a fixed order, so every artifact is reproducible", () => {
    const ids = dev.map((t) => t.thread_id);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("refuses to score across corpus versions", () => {
  test("a prediction file carrying a different corpus hash is refused, not scored", () => {
    const file = readPredictionFile(fixturePath("fixture-dev"));
    const stale = { ...file, meta: { ...file.meta, corpus_hash: "deadbeefdeadbeef" } };
    expect(() => scoreRun(stale)).toThrow(/corpus hash mismatch/);
  });

  test("the error names both hashes so the fix is obvious", () => {
    const file = readPredictionFile(fixturePath("fixture-dev"));
    const stale = { ...file, meta: { ...file.meta, corpus_hash: "deadbeefdeadbeef" } };
    expect(() => scoreRun(stale)).toThrow(new RegExp(hash));
  });
});

describe("refuses to score a file that does not cover the split", () => {
  const file = readPredictionFile(fixturePath("fixture-dev"));

  test("a missing thread is a problem, not a silent zero", () => {
    const short = { ...file, predictions: file.predictions.slice(1) };
    expect(coverageProblems(dev, short)).toHaveLength(1);
    expect(() => scoreRun(short)).toThrow(/does not cover the dev split/);
  });

  test("a thread from the other split is a problem", () => {
    const wrong = {
      ...file,
      predictions: [...file.predictions, { thread_id: "en-02", loops: [] }],
    };
    expect(coverageProblems(dev, wrong).join(" ")).toMatch(/not in the dev split/);
  });

  test("a duplicated thread is a problem", () => {
    const first = file.predictions[0];
    if (!first) throw new Error("fixture has no predictions");
    const duplicated = { ...file, predictions: [...file.predictions, first] };
    expect(coverageProblems(dev, duplicated).join(" ")).toMatch(/more than once/);
  });

  test("the shipped fixtures cover the split exactly", () => {
    expect(coverageProblems(dev, file)).toEqual([]);
  });
});

describe("scoring the shipped fixtures", () => {
  const scored = FIXTURE_SPECS.map((spec) => ({
    spec,
    run: scoreRun(readPredictionFile(fixturePath(spec.config))),
    injected: generateFixture(dev, spec, hash).injected,
  }));

  test("every fixture scores at all three thresholds", () => {
    for (const { run } of scored) {
      expect(run.run.thresholds.map((t) => t.iou_threshold)).toEqual([...IOU_THRESHOLDS]);
    }
  });

  test("no loop is counted twice: TP + FN is always the corpus's loop count", () => {
    const truthLoops = dev.reduce((n, t) => n + t.loops.length, 0);
    for (const { run } of scored) {
      for (const threshold of run.run.thresholds) {
        const d = threshold.overall.detection;
        expect(d.tp + d.fn).toBe(truthLoops);
      }
    }
  });

  test("TP + FP + unmappable is always the number of predictions in the file", () => {
    for (const { run, injected } of scored) {
      for (const threshold of run.run.thresholds) {
        const m = threshold.overall;
        expect(m.detection.tp + m.detection.fp + m.unmappable.predictions).toBe(injected.predictions);
      }
    }
  });

  test("every injected miss shows up as a false negative", () => {
    for (const { run, injected } of scored) {
      const at50 = run.run.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU);
      expect(at50?.overall.detection.fn).toBeGreaterThanOrEqual(injected.dropped);
    }
  });

  test("with intact spans, the false negatives are exactly what was injected", () => {
    // fixture-strict keeps its spans inside the 0.5 bar and injects no split or
    // ungrounded damage, so nothing else can cost it a match. If this number
    // drifts, the matcher is losing pairs it should have made.
    const strict = scored.find((s) => s.spec.config === "fixture-strict");
    if (!strict) throw new Error("fixture-strict missing");
    const at50 = strict.run.run.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU);
    expect(at50?.overall.detection.fn).toBe(strict.injected.dropped + strict.injected.unmappable);
  });

  test("injected supersession errors are recovered, and never over-counted", () => {
    for (const { run, injected } of scored) {
      const at50 = run.run.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU);
      const reported = at50?.overall.state.superseded_as_open.count ?? 0;
      expect(reported).toBeGreaterThan(0);
      expect(reported).toBeLessThanOrEqual(injected.superseded_as_open);
    }
  });

  test("injected direction flips are recovered as inversions", () => {
    for (const { run, injected } of scored) {
      const at50 = run.run.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU);
      const inverted = at50?.overall.cost.by_kind.direction_inverted.count ?? 0;
      expect(inverted).toBeGreaterThan(0);
      expect(inverted).toBeGreaterThanOrEqual(Math.min(1, injected.flipped));
    }
  });

  test("injected unmappable spans land in the unmappable column and nowhere else", () => {
    for (const { run, injected } of scored) {
      for (const threshold of run.run.thresholds) {
        expect(threshold.overall.unmappable.predictions).toBe(injected.unmappable);
      }
    }
  });

  test("recall falls as the threshold rises; the bar is doing something", () => {
    for (const { run } of scored) {
      const recalls = run.run.thresholds.map((t) => t.overall.detection.recall);
      expect(recalls[0]).toBeGreaterThanOrEqual(recalls[recalls.length - 1] ?? 0);
    }
  });

  test("scoring is deterministic", () => {
    for (const { spec, run } of scored) {
      const again = scoreRun(readPredictionFile(fixturePath(spec.config)));
      expect(writeJson(again.run)).toBe(writeJson(run.run));
    }
  });
});

describe("committed artifacts are current", () => {
  // The report is generated from these files. If they can go stale unnoticed,
  // every number in REPORT.md is unverifiable.
  for (const spec of FIXTURE_SPECS) {
    test(`${spec.config} regenerates byte-for-byte`, () => {
      const generated = generateFixture(dev, spec, hash);
      expect(writeJson(generated.file)).toBe(readFileSync(fixturePath(spec.config), "utf-8"));
    });

    test(`${spec.config} metrics and match log on disk match a fresh run`, () => {
      const scored = scoreRun(readPredictionFile(fixturePath(spec.config)));
      expect(readFileSync(metricsPath(spec.config, "dev"), "utf-8")).toBe(writeJson(scored.run));
      expect(readFileSync(matchesPath(spec.config, "dev"), "utf-8")).toBe(writeJson(buildMatchLog(scored)));
    });
  }
});

describe("the match log", () => {
  const scored = scoreRun(readPredictionFile(fixturePath("fixture-dev")));
  const log = buildMatchLog(scored);

  test("covers every threshold", () => {
    expect(log.thresholds.map((t) => t.iou_threshold)).toEqual([...IOU_THRESHOLDS]);
  });

  test("carries the corpus hash and the run date", () => {
    expect(log.corpus_hash).toBe(hash);
    expect(log.generated_at).toBe(scored.run.meta.generated_at);
  });

  test("records both sides of a match with the text each span resolves to", () => {
    const threshold = log.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU);
    const withMatch = threshold?.threads.find((t) => t.matched.length > 0);
    const first = withMatch?.matched[0];
    expect(first?.truth.evidence).not.toBe("unmappable");
    expect(first?.iou).toBeGreaterThan(0);
    if (first && first.truth.evidence !== "unmappable") {
      expect(typeof first.truth.evidence.text).toBe("string");
    }
  });

  test("records near misses, which is the point of the file", () => {
    const threshold = log.thresholds.find((t) => t.iou_threshold === 0.7);
    const misses = (threshold?.threads ?? []).flatMap((t) => t.near_misses);
    expect(misses.length).toBeGreaterThan(0);
    expect(misses.every((m) => m.reason === "below_threshold" || m.reason === "lost_contest")).toBe(true);
  });
});
