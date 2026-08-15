/**
 * separability — can a bag-of-words classifier tell a loop-bearing thread from
 * a negative, using thread text alone?
 *
 * If it can, the corpus leaks. Surface vocabulary would be standing in for the
 * judgment the benchmark is supposed to measure, and an extractor could score
 * well by learning which words appear in this corpus's negatives rather than by
 * detecting commitments.
 *
 * This replaces a hand-authored cue list that asserted every negative contains
 * "commitment-shaped language". That list failed on a different Tamil
 * construction in three consecutive batches — literals, then the necessitative
 * `-anum`, then the hortative `-alam` and availability offers — and each fix
 * was authored from English intuition about what Tamil ought to look like.
 * Three failures across three grammars is evidence the approach was wrong, not
 * that coverage was incomplete. Nothing here knows what language it is reading.
 *
 * Deliberately simple: token counts, a Bernoulli naive Bayes, and a permutation
 * test. No embeddings, no external models, no vocabulary anyone wrote by hand.
 */

import type { Thread } from "@openloop-bench/schema";

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

/** Deterministic PRNG — CI must not flake, and a seed makes the run reproducible. */
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

  // Weights from the full sample, for reporting only — these name the leak.
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
