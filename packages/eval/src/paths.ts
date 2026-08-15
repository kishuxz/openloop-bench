/**
 * paths — where the artifacts live, in one place.
 *
 * Predictions are inputs and live in `predictions/`; results are outputs and
 * live in `results/`. Both are committed: the report is generated from committed
 * files so that a number in REPORT.md can be traced to the exact prediction that
 * produced it, by anyone, without re-running a model.
 */

import { join } from "node:path";

/** Repo root, resolved from this file rather than from the process cwd. */
export const REPO_ROOT = join(import.meta.dirname, "../../..");

/** Real prediction files, one per configuration. Inputs to `pnpm eval`. */
export const PREDICTIONS_DIR = join(REPO_ROOT, "predictions");

/** Generated evaluator fixtures used by tests and `pnpm fixtures:gen`. */
export const FIXTURE_PREDICTIONS_DIR = join(REPO_ROOT, "fixtures/predictions");

/** Metrics, match logs and REPORT.md. Outputs of `pnpm eval` and `pnpm report`. */
export const RESULTS_DIR = join(REPO_ROOT, "results");

export function metricsPath(config: string, split: string): string {
  return join(RESULTS_DIR, `metrics-${config}-${split}.json`);
}

export function matchesPath(config: string, split: string): string {
  return join(RESULTS_DIR, `matches-${config}-${split}.json`);
}

export const REPORT_PATH = join(RESULTS_DIR, "REPORT.md");

/** JSON exactly as every artifact in this repo writes it: 2 spaces, one newline. */
export function writeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
