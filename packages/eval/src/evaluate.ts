/**
 * evaluate — the run: corpus in, prediction file in, metrics and match log out.
 *
 * Three refusals live here, and they are the reason this file exists as
 * something other than glue.
 *
 * **It will not score against a corpus that has not validated in the same run.**
 * Not "validated recently", not "validated in CI". The threads are parsed and
 * grounded by the same call that produces the numbers, because the alternative
 * has happened in this repo before: a corpus edit broke a span, the build went
 * red, and a previously-computed score stayed on screen and was read as
 * current.
 *
 * **It will not score a prediction file whose corpus hash differs from the
 * corpus on disk.** Predictions are offsets into specific message strings. Move
 * a comma in a thread and every span after it means something slightly
 * different, while still resolving — so the failure is silent, and the number
 * it produces is a comparison between two corpora presented as a comparison
 * between two configs.
 *
 * **It will not score a file that does not cover the split.** A prediction file
 * missing forty threads scores as if the extractor confidently found nothing in
 * them, which flatters precision and is indistinguishable from a crashed run
 * that wrote a partial file. Coverage is exact: every thread in the split,
 * once, and nothing else.
 */

import { corpusHash, loadThreads, THREADS_DIR } from "@openloop-bench/corpus";
import { formatIssues, resolveSpan, type Split, type Thread } from "@openloop-bench/schema";
import { DEFAULT_COST_MATRIX, type CostMatrix } from "./cost.js";
import { IOU_THRESHOLDS, matchThread, type ThreadMatch } from "./match.js";
import {
  computeBreakdowns,
  computeMetrics,
  outcomesOf,
  type Breakdowns,
  type MetricSet,
  type Outcome,
} from "./metrics.js";
import {
  hasOffsets,
  normalizePredictionFile,
  PredictionFileSchema,
  UNMAPPABLE,
  readPredictionJson,
  type PredictedLoop,
  type PredictedSpan,
  type PredictionFile,
  type RunMeta,
} from "./prediction.js";

/** Artifact schema version, bumped when the results files change shape. */
export const RESULTS_FORMAT = 1;

export interface ThresholdResult {
  readonly iou_threshold: number;
  readonly overall: MetricSet;
  readonly breakdowns: Breakdowns;
}

export interface EvalRun {
  readonly format: number;
  readonly meta: RunMeta;
  readonly corpus_hash: string;
  readonly threads: number;
  readonly cost_matrix: CostMatrix;
  readonly iou_thresholds: number[];
  readonly thresholds: ThresholdResult[];
}

/** Parse a prediction file, with the same one-line-per-problem output style. */
export function readPredictionFile(path: string): PredictionFile {
  const json = readPredictionJson(path);

  const parsed = PredictionFileSchema.safeParse(json);
  if (parsed.success) return parsed.data;

  try {
    return normalizePredictionFile(json);
  } catch (error) {
    throw new Error(`${path}: does not match the prediction format:\n  ${formatIssues(parsed.error).join("\n  ")}\n  ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/**
 * Load and validate the corpus, or throw with a pointer at the tool whose job
 * is to explain what is wrong. Never returns a partially-parsed corpus.
 */
export function loadValidatedCorpus(dir: string = THREADS_DIR): Thread[] {
  const { loaded, failures } = loadThreads(dir);
  if (failures.length > 0) {
    const detail = failures.map((f) => `${f.file}: ${f.problems.join("; ")}`).join("\n  ");
    throw new Error(
      `eval refuses to score against a corpus that does not validate. ${failures.length} file(s) failed:\n  ${detail}\nRun \`pnpm validate\`.`,
    );
  }
  return loaded.map((l) => l.thread);
}

/** Every thread in the split, in id order. Deterministic input to everything. */
export function threadsForSplit(threads: readonly Thread[], split: Split): Thread[] {
  return threads.filter((t) => t.split === split).sort((a, b) => a.thread_id.localeCompare(b.thread_id));
}

/**
 * Coverage check: the file must name every thread in the split exactly once and
 * nothing else. Returns one line per problem, empty when the file is complete.
 */
export function coverageProblems(threads: readonly Thread[], file: PredictionFile): string[] {
  const expected = new Set(threads.map((t) => t.thread_id));
  const seen = new Set<string>();
  const problems: string[] = [];

  for (const prediction of file.predictions) {
    if (seen.has(prediction.thread_id)) {
      problems.push(`thread "${prediction.thread_id}" appears more than once`);
      continue;
    }
    seen.add(prediction.thread_id);
    if (!expected.has(prediction.thread_id)) {
      problems.push(
        `thread "${prediction.thread_id}" is not in the ${file.meta.split} split (or does not exist)`,
      );
    }
  }

  const missing = [...expected].filter((id) => !seen.has(id)).sort();
  if (missing.length > 0) {
    problems.push(
      `${missing.length} thread(s) in the ${file.meta.split} split have no entry: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}`,
    );
  }

  return problems;
}

export interface ScoreOptions {
  readonly matrix?: CostMatrix;
  readonly thresholds?: readonly number[];
  readonly corpusDir?: string;
}

export interface ScoredRun {
  readonly run: EvalRun;
  readonly threads: Thread[];
  readonly predictionsByThread: Map<string, PredictedLoop[]>;
  /** Match results per threshold, in the same order as `run.thresholds`. */
  readonly matchesByThreshold: Array<{ iou_threshold: number; matches: ThreadMatch[] }>;
  readonly outcomesByThreshold: Array<{ iou_threshold: number; outcomes: Outcome[] }>;
}

/**
 * Score one prediction file against the corpus at every threshold.
 *
 * The whole run happens at 0.3, 0.5 and 0.7 rather than at a chosen one. The
 * threshold is the single most load-bearing constant in the eval and it was
 * picked by judgment; running all three is what keeps that judgment visible,
 * and it is what makes "does the ranking of these configs survive the
 * threshold" a question the report can answer rather than a caveat.
 */
export function scoreRun(file: PredictionFile, options: ScoreOptions = {}): ScoredRun {
  const dir = options.corpusDir ?? THREADS_DIR;
  const matrix = options.matrix ?? DEFAULT_COST_MATRIX;
  const thresholds = options.thresholds ?? IOU_THRESHOLDS;

  const corpus = loadValidatedCorpus(dir);
  const hash = corpusHash(dir);

  if (file.meta.corpus_hash !== hash) {
    throw new Error(
      `corpus hash mismatch: predictions were generated against ${file.meta.corpus_hash}, the corpus on disk is ${hash}. ` +
        "Scoring across corpus versions compares two benchmarks and calls it one. Regenerate the predictions.",
    );
  }

  const threads = threadsForSplit(corpus, file.meta.split);
  const problems = coverageProblems(threads, file);
  if (problems.length > 0) {
    throw new Error(
      `prediction file does not cover the ${file.meta.split} split:\n  ${problems.join("\n  ")}`,
    );
  }

  const predictionsByThread = new Map<string, PredictedLoop[]>(
    file.predictions.map((p) => [p.thread_id, p.loops]),
  );

  const matchesByThreshold: ScoredRun["matchesByThreshold"] = [];
  const outcomesByThreshold: ScoredRun["outcomesByThreshold"] = [];
  const results: ThresholdResult[] = [];

  for (const iou of thresholds) {
    const matches: ThreadMatch[] = [];
    const outcomes: Outcome[] = [];

    for (const thread of threads) {
      const predictions = predictionsByThread.get(thread.thread_id) ?? [];
      const match = matchThread(thread, predictions, iou);
      matches.push(match);
      outcomes.push(...outcomesOf(thread, predictions, match));
    }

    matchesByThreshold.push({ iou_threshold: iou, matches });
    outcomesByThreshold.push({ iou_threshold: iou, outcomes });
    results.push({
      iou_threshold: iou,
      overall: computeMetrics(outcomes, threads.length, matrix),
      breakdowns: computeBreakdowns(outcomes, threads, matrix),
    });
  }

  return {
    run: {
      format: RESULTS_FORMAT,
      meta: file.meta,
      corpus_hash: hash,
      threads: threads.length,
      cost_matrix: matrix,
      iou_thresholds: [...thresholds],
      thresholds: results,
    },
    threads,
    predictionsByThread,
    matchesByThreshold,
    outcomesByThreshold,
  };
}

// ---------------------------------------------------------------------------
// The match log
// ---------------------------------------------------------------------------

/**
 * `results/matches-{config}-{split}.json` — the file that makes hand-review
 * possible, and the reason the matcher can be argued with.
 *
 * Every decision is in it: what matched what and at what IoU, every prediction
 * that matched nothing, every true loop nothing reached, and every near miss —
 * the pairs that overlapped and fell under the threshold, and the pairs that
 * cleared it and lost the one-to-one contest. Both spans are written with the
 * text they resolve to, so checking a disputed decision means reading two
 * quoted fragments rather than counting characters in a message.
 */
export interface MatchLog {
  readonly format: number;
  readonly config: string;
  readonly split: Split;
  readonly corpus_hash: string;
  readonly generated_at: string;
  readonly iou_thresholds: number[];
  readonly note: string;
  readonly thresholds: Array<{
    readonly iou_threshold: number;
    readonly threads_with_no_decisions: number;
    readonly threads: ThreadMatchLog[];
  }>;
}

interface SpanLog {
  readonly msg_index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string | null;
}

interface LoopLog {
  readonly statement: string;
  readonly direction: string;
  readonly state: string;
  readonly register: string;
  readonly evidence: SpanLog | "unmappable";
}

interface ThreadMatchLog {
  readonly thread_id: string;
  readonly matched: Array<{
    readonly iou: number;
    readonly pred_index: number;
    readonly truth_index: number;
    readonly truth: LoopLog;
    readonly prediction: LoopLog;
  }>;
  readonly false_positives: Array<{
    readonly pred_index: number;
    readonly grounded: boolean;
    readonly prediction: LoopLog;
  }>;
  readonly false_negatives: Array<{ readonly truth_index: number; readonly truth: LoopLog }>;
  readonly unmappable: Array<{ readonly pred_index: number; readonly prediction: LoopLog }>;
  readonly near_misses: Array<{
    readonly reason: string;
    readonly iou: number;
    readonly pred_index: number;
    readonly truth_index: number;
    readonly truth: LoopLog;
    readonly prediction: LoopLog;
  }>;
  readonly split_truths: Array<{ truth_index: number; pred_indices: number[] }>;
  readonly merged_predictions: Array<{ pred_index: number; truth_indices: number[] }>;
}

function spanLog(thread: Thread, span: PredictedSpan): SpanLog | "unmappable" {
  if (!hasOffsets(span)) return UNMAPPABLE;
  return {
    msg_index: span.msg_index,
    start: span.start,
    end: span.end,
    text: resolveSpan(thread.messages, span),
  };
}

function predictionLog(thread: Thread, loop: PredictedLoop): LoopLog {
  return {
    statement: loop.statement,
    direction: loop.direction,
    state: loop.state,
    register: loop.register,
    evidence: spanLog(thread, loop.evidence),
  };
}

function truthLog(thread: Thread, index: number): LoopLog {
  const loop = thread.loops[index];
  if (!loop) {
    return { statement: "(missing)", direction: "?", state: "?", register: "?", evidence: UNMAPPABLE };
  }
  return {
    statement: loop.statement,
    direction: loop.direction,
    state: loop.state,
    register: loop.register,
    evidence: spanLog(thread, loop.evidence),
  };
}

export function buildMatchLog(scored: ScoredRun): MatchLog {
  const byId = new Map(scored.threads.map((t) => [t.thread_id, t]));

  const thresholds = scored.matchesByThreshold.map(({ iou_threshold, matches }) => {
    const threads: ThreadMatchLog[] = [];
    let silent = 0;

    for (const match of matches) {
      const thread = byId.get(match.thread_id);
      if (!thread) continue;
      const predictions = scored.predictionsByThread.get(match.thread_id) ?? [];

      const decisions =
        match.matched.length +
        match.unmatched_predictions.length +
        match.unmatched_truths.length +
        match.unmappable_predictions.length +
        match.near_misses.length;
      if (decisions === 0) {
        silent += 1;
        continue;
      }

      const pred = (index: number): LoopLog => {
        const loop = predictions[index];
        return loop
          ? predictionLog(thread, loop)
          : { statement: "(missing)", direction: "?", state: "?", register: "?", evidence: UNMAPPABLE };
      };

      threads.push({
        thread_id: match.thread_id,
        matched: match.matched.map((m) => ({
          iou: round(m.iou),
          pred_index: m.pred_index,
          truth_index: m.truth_index,
          truth: truthLog(thread, m.truth_index),
          prediction: pred(m.pred_index),
        })),
        false_positives: match.unmatched_predictions.map((i) => ({
          pred_index: i,
          grounded: !match.ungrounded_predictions.includes(i),
          prediction: pred(i),
        })),
        false_negatives: match.unmatched_truths.map((i) => ({
          truth_index: i,
          truth: truthLog(thread, i),
        })),
        unmappable: match.unmappable_predictions.map((i) => ({ pred_index: i, prediction: pred(i) })),
        near_misses: match.near_misses.map((n) => ({
          reason: n.reason,
          iou: round(n.iou),
          pred_index: n.pred_index,
          truth_index: n.truth_index,
          truth: truthLog(thread, n.truth_index),
          prediction: pred(n.pred_index),
        })),
        split_truths: match.split_truths,
        merged_predictions: match.merged_predictions,
      });
    }

    return { iou_threshold, threads_with_no_decisions: silent, threads };
  });

  return {
    format: RESULTS_FORMAT,
    config: scored.run.meta.config,
    split: scored.run.meta.split,
    corpus_hash: scored.run.corpus_hash,
    generated_at: scored.run.meta.generated_at,
    iou_thresholds: scored.run.iou_thresholds,
    note:
      "Every match decision at every threshold. near_misses.reason: below_threshold = overlapped but " +
      "was neither contained nor over the IoU bar; lost_contest = matched the containment/IoU rule " +
      "but a higher-IoU pair took one of the two. " +
      "Threads where nothing was predicted and nothing was labeled are counted, not listed.",
    thresholds,
  };
}

/** Six decimals: enough to compare, few enough that the file diffs cleanly. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
