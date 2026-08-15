/**
 * separability: a diagnostic, not a gate.
 *
 * Trains a bag-of-tokens classifier to predict "does this thread contain at
 * least one loop" from thread text alone. If it succeeds, the corpus leaks:
 * surface vocabulary is standing in for the judgment the benchmark measures,
 * and an extractor could score well by learning this corpus rather than the
 * task.
 *
 * ## Why this does not fail a build
 *
 * It used to assert that observed balanced accuracy sat below the permutation
 * null's 95th percentile. That assertion is gone, and deliberately not merely
 * relaxed.
 *
 * The number is too unstable to gate on. Fixing the first leak moved p from
 * 0.030 to 0.119 through a change that reassigned threads between `dev` and
 * `test` and altered no label and no message. A statistic that swings that far
 * on a split reassignment will, if it can fail a build, eventually be made to
 * pass, and the only lever available is the corpus itself. That is the corpus
 * being tuned toward its own checker, which is a worse defect than the leak it
 * would be papering over, and an invisible one.
 *
 * The value here was never the verdict. It is the ranked feature list and the
 * per-thread margins: they name which threads to rewrite, and they are exactly
 * as informative at p = 0.4 as at p = 0.01.
 *
 * **The bar, stated as judgment rather than as a threshold:** keep remediating
 * while the top-weighted features are obviously authorial habit, a word you
 * reached for whenever you wrote negatives, a topic you only ever gave to one
 * side. Stop when what remains looks like the genuine language of commitment,
 * because at that point the classifier is picking up the phenomenon the corpus
 * exists to capture, and driving it lower would mean removing that.
 *
 * ## What it still fails on
 *
 * Real errors. A corpus that does not validate, or too few threads to
 * cross-validate, throw. There is no cached-score path and no stale-read path:
 * `separabilityReport` validates the corpus in the same run, computes, or
 * throws. Every score it returns carries the content hash it was computed
 * from, because a number without one is a number you cannot trace to a corpus.
 *
 * Deliberately simple: token counts, a Bernoulli naive Bayes, a permutation
 * test. No embeddings, no external models, no vocabulary anyone wrote by hand.
 * The cue list this replaced failed on a different Tamil construction in
 * three consecutive batches, every fix authored from English intuition about
 * what other grammars ought to look like.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Thread } from "@openloop-bench/schema";
import { loadThreads, THREADS_DIR, threadFiles } from "./load.js";

/** Lowercased alphanumeric runs. Unicode-aware, so Devanagari and Tamil survive. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** One thread's full text as a set of distinct tokens. */
export function threadTokens(thread: Thread): Set<string> {
  const tokens = new Set<string>();
  for (const message of thread.messages) for (const t of tokenize(message.text)) tokens.add(t);
  return tokens;
}

export interface Sample {
  readonly tokens: Set<string>;
  /** True if the thread contains at least one loop. */
  readonly label: boolean;
}

/** Bernoulli naive Bayes: per-token log odds of appearing in a positive thread. */
export interface Model {
  readonly weights: ReadonlyMap<string, number>;
  readonly prior: number;
}

export function train(samples: readonly Sample[], vocabulary: readonly string[]): Model {
  const pos = samples.filter((s) => s.label).length;
  const neg = samples.length - pos;
  const weights = new Map<string, number>();

  for (const token of vocabulary) {
    const inPos = samples.filter((s) => s.label && s.tokens.has(token)).length;
    const inNeg = samples.filter((s) => !s.label && s.tokens.has(token)).length;
    // Laplace smoothing keeps a token seen once from carrying infinite weight.
    const pPos = (inPos + 1) / (pos + 2);
    const pNeg = (inNeg + 1) / (neg + 2);
    weights.set(token, Math.log(pPos / pNeg));
  }

  const prior = Math.log((pos + 1) / (neg + 1));
  return { weights, prior };
}

export function score(model: Model, tokens: Set<string>): number {
  let total = model.prior;
  for (const token of tokens) total += model.weights.get(token) ?? 0;
  return total;
}

/** Deterministic PRNG: CI must not flake, and a seed makes the run reproducible. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * Balanced accuracy under stratified k-fold cross-validation.
 *
 * Balanced rather than raw accuracy because the corpus is 80% positive by
 * construction: a classifier that answers "loop" every time scores 0.80 on raw
 * accuracy and 0.50 here, which is the honest number. Chance is 0.5.
 */
export function crossValidate(samples: readonly Sample[], folds: number, seed: number): number {
  const next = rng(seed);
  const positives = shuffle(samples.filter((s) => s.label), next);
  const negatives = shuffle(samples.filter((s) => !s.label), next);

  let truePos = 0;
  let falseNeg = 0;
  let trueNeg = 0;
  let falsePos = 0;

  for (let fold = 0; fold < folds; fold++) {
    const heldOut = [
      ...positives.filter((_, i) => i % folds === fold),
      ...negatives.filter((_, i) => i % folds === fold),
    ];
    const train_ = samples.filter((s) => !heldOut.includes(s));
    if (train_.length === 0 || heldOut.length === 0) continue;

    const vocabulary = [...new Set(train_.flatMap((s) => [...s.tokens]))];
    const model = train(train_, vocabulary);

    for (const sample of heldOut) {
      const predicted = score(model, sample.tokens) > 0;
      if (sample.label && predicted) truePos++;
      else if (sample.label) falseNeg++;
      else if (predicted) falsePos++;
      else trueNeg++;
    }
  }

  const sensitivity = truePos + falseNeg === 0 ? 0 : truePos / (truePos + falseNeg);
  const specificity = trueNeg + falsePos === 0 ? 0 : trueNeg / (trueNeg + falsePos);
  return (sensitivity + specificity) / 2;
}

export interface SeparabilityResult {
  /** Balanced accuracy on the real labels. 0.5 is chance. */
  readonly observed: number;
  /** Balanced accuracy the same procedure reaches on shuffled labels. */
  readonly nullMean: number;
  readonly null95: number;
  /** Fraction of shuffles scoring at least as high as the real labels. */
  readonly pValue: number;
  /** Tokens most predictive of a thread containing a loop, and of it not. */
  readonly topPositive: ReadonlyArray<readonly [string, number]>;
  readonly topNegative: ReadonlyArray<readonly [string, number]>;
}

/**
 * Run the check. The permutation test is what makes the verdict meaningful at
 * this sample size: with ~64 threads and 20% negatives, a fixed threshold like
 * "0.65 is too high" is guesswork, whereas comparing against the same procedure
 * on shuffled labels measures how much of the score is structure and how much
 * is small-sample noise.
 */
export function separability(threads: readonly Thread[], permutations = 200, seed = 20260815): SeparabilityResult {
  const samples: Sample[] = threads.map((t) => ({ tokens: threadTokens(t), label: t.loops.length > 0 }));
  const folds = 5;

  const observed = crossValidate(samples, folds, seed);

  const next = rng(seed ^ 0x5eed);
  const nulls: number[] = [];
  for (let i = 0; i < permutations; i++) {
    const labels = shuffle(samples.map((s) => s.label), next);
    const shuffled = samples.map((s, j) => ({ tokens: s.tokens, label: labels[j] ?? false }));
    nulls.push(crossValidate(shuffled, folds, seed + i + 1));
  }
  nulls.sort((a, b) => a - b);

  const nullMean = nulls.reduce((a, b) => a + b, 0) / nulls.length;
  const null95 = nulls[Math.floor(nulls.length * 0.95)] ?? 1;
  const pValue = (nulls.filter((v) => v >= observed).length + 1) / (nulls.length + 1);

  // Weights from the full sample, for reporting only. These name the leak.
  const vocabulary = [...new Set(samples.flatMap((s) => [...s.tokens]))];
  const full = train(samples, vocabulary);
  const ranked = [...full.weights]
    .filter(([token]) => samples.filter((s) => s.tokens.has(token)).length >= 3)
    .sort((a, b) => b[1] - a[1]);

  return {
    observed,
    nullMean,
    null95,
    pValue,
    topPositive: ranked.slice(0, 12),
    topNegative: ranked.slice(-12).reverse(),
  };
}

/** Fewer than this and cross-validation folds stop being meaningful. */
export const MIN_THREADS = 20;

export interface SeparabilityReport extends SeparabilityResult {
  /** Content hash of the corpus these numbers were computed from. */
  readonly corpusHash: string;
  readonly threads: number;
  readonly positives: number;
  readonly negatives: number;
}

/** SHA-256 over every thread file, in filename order. Traceability, not security. */
export function corpusHash(dir: string = THREADS_DIR): string {
  const hash = createHash("sha256");
  for (const file of threadFiles(dir)) {
    hash.update(file);
    hash.update(readFileSync(join(dir, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * The only supported entry point. Validates the corpus, then computes, or
 * throws. There is no third state.
 *
 * The validation step is not decoration. A broken evidence span once left the
 * build failing while a previously-computed separability number stayed on
 * screen, and it was read as current. Deriving the score in the same run as the
 * parse makes that arrangement impossible rather than merely discouraged.
 */
export function separabilityReport(dir: string = THREADS_DIR, permutations = 200): SeparabilityReport {
  const { loaded, failures } = loadThreads(dir);
  if (failures.length > 0) {
    const detail = failures.map((f) => `${f.file}: ${f.problems.join("; ")}`).join("\n  ");
    throw new Error(
      `separability refuses to run against a corpus that does not validate. ${failures.length} file(s) failed:\n  ${detail}`,
    );
  }

  const dev = loaded.map((l) => l.thread).filter((t) => t.split === "dev");
  if (dev.length < MIN_THREADS) {
    throw new Error(`separability needs at least ${MIN_THREADS} dev threads to cross-validate; found ${dev.length}`);
  }
  const positives = dev.filter((t) => t.loops.length > 0).length;
  const negatives = dev.length - positives;
  if (positives < 5 || negatives < 5) {
    throw new Error(`separability needs at least 5 threads per class in dev; found ${positives} with loops, ${negatives} without`);
  }

  return {
    ...separability(dev, permutations),
    corpusHash: corpusHash(dir),
    threads: dev.length,
    positives,
    negatives,
  };
}

/** Human-readable rendering. The feature lists are the point, not the score. */
export function formatReport(report: SeparabilityReport): string[] {
  return [
    `corpus ${report.corpusHash}   dev split: ${report.threads} threads, ${report.positives} with loops, ${report.negatives} without`,
    "",
    `  balanced accuracy   ${report.observed.toFixed(3)}   (0.500 is chance)`,
    `  permutation null    ${report.nullMean.toFixed(3)} mean, ${report.null95.toFixed(3)} at p95`,
    `  p-value             ${report.pValue.toFixed(3)}`,
    "",
    "  leaks toward HAVING a loop:",
    `    ${report.topPositive.map(([t, w]) => `${t}(${w.toFixed(2)})`).join(" ")}`,
    "  leaks toward NO loop:",
    `    ${report.topNegative.map(([t, w]) => `${t}(${w.toFixed(2)})`).join(" ")}`,
    "",
    "  Diagnostic only. This never fails a build. Remediate while the features",
    "  above are obviously authorial habit; stop when what remains reads like the",
    "  genuine language of commitment.",
  ];
}
