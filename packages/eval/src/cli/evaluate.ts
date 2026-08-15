/**
 * eval — score every prediction file and write the results artifacts.
 *
 * Reads `predictions/*.json` (or the files named on the command line)
 * and writes, per configuration:
 *
 *   results/metrics-{config}-{split}.json   every metric at every threshold
 *   results/matches-{config}-{split}.json   every match decision, for review
 *
 * The corpus is loaded and validated in this same process before any of it
 * happens, and any prediction file whose corpus hash disagrees with the corpus
 * on disk is refused rather than scored. See `src/evaluate.ts`.
 *
 * Exits non-zero if any file fails, and reports all of them rather than the
 * first — the same tolerant-read posture the corpus validator takes.
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_IOU } from "../match.js";
import { buildMatchLog, readPredictionFile, scoreRun } from "../evaluate.js";
import { matchesPath, metricsPath, PREDICTIONS_DIR, RESULTS_DIR, writeJson } from "../paths.js";
import { predictionRunAttempt, readPredictionJson } from "../prediction.js";
import {
  PROVIDER_FAILURE_RATE_ENV,
  formatRate,
  incompleteRun,
  parseProviderFailureThreshold,
} from "../quality.js";

interface Args {
  readonly files: string[];
  readonly maxProviderFailureRate: number;
}

function parseArgs(args: string[]): Args {
  const files: string[] = [];
  let threshold = process.env[PROVIDER_FAILURE_RATE_ENV];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--max-provider-failure-rate") {
      threshold = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--max-provider-failure-rate=")) {
      threshold = arg.slice("--max-provider-failure-rate=".length);
      continue;
    }
    files.push(arg);
  }

  return { files, maxProviderFailureRate: parseProviderFailureThreshold(threshold) };
}

function predictionFiles(args: string[]): string[] {
  if (args.length > 0) return args;
  return readdirSync(PREDICTIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(PREDICTIONS_DIR, f));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function removeIfExists(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.log(`eval: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const files = predictionFiles(args.files);
  mkdirSync(RESULTS_DIR, { recursive: true });

  console.log(`openloop-bench eval — ${files.length} prediction file(s)`);
  console.log(`provider failure publish threshold: ${formatRate(args.maxProviderFailureRate)} (override with ${PROVIDER_FAILURE_RATE_ENV} or --max-provider-failure-rate)`);
  console.log("");

  const failures: string[] = [];

  for (const path of files) {
    let summary: string[];
    try {
      const raw = readPredictionJson(path);
      const attempt = predictionRunAttempt(raw);
      const incomplete = incompleteRun(attempt, { max_provider_failure_rate: args.maxProviderFailureRate });
      const file = readPredictionFile(path);

      if (incomplete) {
        removeIfExists(metricsPath(file.meta.config, file.meta.split));
        removeIfExists(matchesPath(file.meta.config, file.meta.split));
        summary = [
          `SKIP  ${file.meta.config}  (${file.meta.split}, ${attempt.attempted_threads} threads attempted)`,
          `      provider failure rate ${formatRate(attempt.provider_failure_rate)} exceeds publish threshold ${formatRate(args.maxProviderFailureRate)}`,
          `      provider failures ${attempt.provider_failures}; parse failures ${attempt.parse_failures}; threads with parsed loops ${attempt.threads_with_parsed_loops}`,
          "      metrics and match log not written; any stale artifacts were removed",
        ];
        for (const line of summary) console.log(line);
        console.log("");
        continue;
      }

      const scored = scoreRun(file);

      writeFileSync(metricsPath(file.meta.config, file.meta.split), writeJson(scored.run));
      writeFileSync(matchesPath(file.meta.config, file.meta.split), writeJson(buildMatchLog(scored)));

      summary = [
        `PASS  ${file.meta.config}  (${file.meta.split}, ${scored.run.threads} threads, corpus ${scored.run.corpus_hash})`,
        ...scored.run.thresholds.map((t) => {
          const d = t.overall.detection;
          const headline = t.overall.state.superseded_as_open;
          const flag = t.iou_threshold === DEFAULT_IOU ? "*" : " ";
          return (
            `      IoU ${t.iou_threshold.toFixed(1)}${flag} P ${pct(d.precision)}  R ${pct(d.recall)}  F1 ${pct(d.f1)}` +
            `   sup→open ${headline.count}/${headline.of}   cost ${t.overall.cost.total} (${t.overall.cost.per_thread.toFixed(2)}/thread)`
          );
        }),
      ];
    } catch (error) {
      failures.push(path);
      summary = [`FAIL  ${path}`, ...String((error as Error).message).split("\n").map((l) => `      ${l}`)];
    }

    for (const line of summary) console.log(line);
    console.log("");
  }

  console.log(`  * = default threshold (IoU ${DEFAULT_IOU.toFixed(1)}); all three are reported everywhere.`);
  console.log("");

  if (failures.length > 0) {
    console.log(`FAIL — ${failures.length} of ${files.length} prediction file(s) could not be scored`);
    process.exitCode = 1;
    return;
  }

  console.log(`Written to ${RESULTS_DIR}. Run \`pnpm report\` to render REPORT.md.`);
}

main();
