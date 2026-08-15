/**
 * Report tests.
 *
 * Two things are worth asserting about a generated document. First that it is
 * deterministic — the claim on its own first page — and that the copy committed
 * to the repo is the copy this code produces, so a reader can trust the file
 * rather than having to re-run the generator to find out.
 *
 * Second that the things the brief requires to be *visible* are visible: the
 * matching threshold, the cost weights, the provenance block, the fact that
 * both are judgment calls, and a failure gallery that states its cap and its
 * totals. Those are the properties that stop the report from being a scoreboard
 * with the assumptions filed off.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { corpusHash } from "@openloop-bench/corpus";
import { readPredictionFile, scoreRun } from "../src/evaluate.js";
import { predictionRunAttempt, readPredictionJson } from "../src/prediction.js";
import { IOU_THRESHOLDS } from "../src/match.js";
import { DEFAULT_COST_MATRIX } from "../src/cost.js";
import { PREDICTIONS_DIR, REPORT_PATH } from "../src/paths.js";
import { GALLERY_CAP, renderReport } from "../src/report.js";
import { DEFAULT_MAX_PROVIDER_FAILURE_RATE, incompleteRun } from "../src/quality.js";

const hash = corpusHash();
const REPORT_CONFIGS = ["hosted-large-dev", "local-dev"];
const runs = REPORT_CONFIGS.map((config) => scoreRun(readPredictionFile(join(PREDICTIONS_DIR, `${config}.json`))));
const hostedRedactedAttempt = predictionRunAttempt(readPredictionJson(join(PREDICTIONS_DIR, "hosted-redacted-dev.json")));
const hostedRedactedIncomplete = incompleteRun(hostedRedactedAttempt, {
  max_provider_failure_rate: DEFAULT_MAX_PROVIDER_FAILURE_RATE,
});
if (!hostedRedactedIncomplete) throw new Error("hosted-redacted should be guarded as incomplete");
const incompleteRuns = [hostedRedactedIncomplete];
const report = renderReport({ runs, corpusHash: hash, incompleteRuns });

describe("determinism", () => {
  test("rendering twice produces identical bytes", () => {
    expect(renderReport({ runs, corpusHash: hash, incompleteRuns })).toBe(report);
  });

  test("the committed REPORT.md is what this code generates", () => {
    expect(readFileSync(REPORT_PATH, "utf-8")).toBe(report);
  });

  test("nothing in it is read from the clock — the run date comes from the inputs", () => {
    for (const run of runs) expect(report).toContain(run.run.meta.generated_at);
  });
});

describe("provenance is on the page, not in a commit message", () => {
  test("carries the corpus hash", () => {
    expect(report).toContain(hash);
  });

  test("carries every model id, prompt version and sampling parameter", () => {
    for (const run of runs) {
      expect(report).toContain(run.run.meta.model_id);
      expect(report).toContain(run.run.meta.prompt_version);
      for (const [key, value] of Object.entries(run.run.meta.sampling)) {
        expect(report).toContain(`${key}=${String(value)}`);
      }
    }
  });

  test("states that it refuses to score across corpus versions", () => {
    expect(report).toMatch(/refuses.*corpus hash/s);
  });
});

describe("the judgment calls are visible", () => {
  test("every threshold the eval ran at is printed", () => {
    for (const iou of IOU_THRESHOLDS) expect(report).toContain(iou.toFixed(1));
  });

  test("the threshold is named as a judgment call", () => {
    expect(report).toMatch(/threshold is a judgment call/);
  });

  test("every cost weight is printed", () => {
    expect(report).toContain(`| ${DEFAULT_COST_MATRIX.false_negative} |`);
    expect(report).toContain(`| ${DEFAULT_COST_MATRIX.false_positive.blocked_on_them} |`);
    expect(report).toContain(`| ${DEFAULT_COST_MATRIX.superseded_as_open} |`);
  });

  test("the cost weights are named as a judgment call, not a measurement", () => {
    expect(report).toMatch(/judgment call, not a measurement/);
  });

  test("the ranking question is answered explicitly, either way", () => {
    expect(report).toMatch(/Does the ranking survive the threshold\?/);
    expect(report).toMatch(/(Finding: the ranking is not stable|ordering is the same at every threshold)/);
  });
});

describe("the metrics the benchmark exists for are present", () => {
  test("supersession is reported separately and prominently", () => {
    expect(report).toContain("## Supersession");
    expect(report).toMatch(/superseded → open|superseded reported open/i);
  });

  test("direction is reported as a safety boundary with a 3x3 matrix", () => {
    expect(report).toContain("## Direction");
    expect(report).toContain("| truth ↓ / predicted → | blocked_on_them | blocked_on_you | mutual |");
  });

  test("span tightness is reported separately from detection", () => {
    expect(report).toContain("## Span Tightness");
    expect(report).toMatch(/containment-first matching/);
  });

  test("unmappable spans are counted apart from right and wrong", () => {
    expect(report).toContain("## Unmappable spans");
    expect(report).toMatch(/neither correct nor\s+incorrect/);
    expect(report).toContain("FN ceiling");
  });

  test("all four breakdowns are rendered", () => {
    for (const heading of ["By register", "By bucket", "By thread length", "By loops per thread"]) {
      expect(report).toContain(`### ${heading}`);
    }
  });

  test("the loops-per-thread breakdown is named as within-thread recall", () => {
    expect(report).toMatch(/within-thread recall/);
  });
});

describe("the failure gallery", () => {
  test("is generated and says so", () => {
    expect(report).toMatch(/Generated, never curated/);
  });

  test("states the cap and the total wherever it truncates", () => {
    const truncations = report.match(/Showing the \d+ worst by cost weight of \d+\./g) ?? [];
    expect(truncations.length).toBeGreaterThan(0);
    for (const line of truncations) {
      const [, shown, total] = line.match(/Showing the (\d+) worst by cost weight of (\d+)\./) ?? [];
      expect(Number(shown)).toBe(GALLERY_CAP);
      expect(Number(total)).toBeGreaterThan(GALLERY_CAP);
    }
  });

  test("prints a per-category count for every category it shows", () => {
    const headings = report.match(/^#### .* — \d+$/gm) ?? [];
    expect(headings.length).toBeGreaterThan(0);
  });

  test("shows both sides of a failure, with the evidence spans of each", () => {
    expect(report).toMatch(/ {2}- truth evidence: msg \d+ \[\d+, \d+\)/);
    expect(report).toMatch(/ {2}- predicted evidence: (msg \d+ \[\d+, \d+\)|`unmappable`)/);
  });

  test("prints predicted evidence for reviewable failures", () => {
    expect(report).toMatch(/ {2}- predicted evidence: (msg \d+ \[\d+, \d+\)|`unmappable`)/);
  });
});

describe("what the report refuses to claim", () => {
  test("states the measured scope", () => {
    expect(report).toMatch(/Dev split only; two configs reported/);
    expect(report).toMatch(/held-out test split not run/);
    expect(report).toMatch(/`hosted-redacted` attempted and incomplete/);
  });

  test("keeps incomplete hosted-redacted as evidence but out of scored tables", () => {
    expect(report).toMatch(/Attempted, incomplete\. 80 threads attempted, 67 provider failures, 70 parse failures, 10 threads with parsed loops/);
    expect(report).not.toContain("| `hosted-redacted` | 58.8%");
  });

  test("keeps the corpus's own limitations attached to the numbers", () => {
    expect(report).toMatch(/mutual` is thin|`mutual` is thin/);
    expect(report).toMatch(/Single annotator/);
  });
});
