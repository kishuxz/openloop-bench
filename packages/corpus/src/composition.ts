/**
 * composition — the corpus distribution, as assertions rather than prose.
 *
 * Kept out of the CLI so tests can call it without executing a CLI, and so the
 * eval package can re-assert composition before it reports a number computed
 * over a corpus that quietly drifted.
 */

import type { Thread } from "@openloop-bench/schema";
import { BUCKETS, bucketOf } from "./buckets.js";

/** Intended dev share of the corpus, as a fraction. */
export const DEV_SHARE_RANGE = [0.3, 0.5] as const;

const SPLITS = ["dev", "test"] as const;

/**
 * Returns one line per composition problem, empty when the corpus matches
 * what the benchmark claims. Returning rather than printing keeps the tests
 * and the CLI honest about the same rules.
 */
export function checkComposition(threads: readonly Thread[]): string[] {
  const failures: string[] = [];

  for (const bucket of BUCKETS) {
    const inBucket = threads.filter((t) => bucketOf(t.thread_id) === bucket.prefix);

    if (inBucket.length !== bucket.target) {
      failures.push(
        `bucket "${bucket.prefix}" (${bucket.label}) has ${inBucket.length} thread(s), specified target is ${bucket.target}`,
      );
    }

    for (const split of SPLITS) {
      if (inBucket.filter((t) => t.split === split).length === 0) {
        failures.push(
          `bucket "${bucket.prefix}" (${bucket.label}) is empty in the ${split} split — every bucket must appear in both`,
        );
      }
    }
  }

  for (const orphan of threads.filter((t) => bucketOf(t.thread_id) === null)) {
    failures.push(`thread "${orphan.thread_id}" belongs to no known bucket`);
  }

  const devShare = threads.filter((t) => t.split === "dev").length / (threads.length || 1);
  const [low, high] = DEV_SHARE_RANGE;
  if (devShare < low || devShare > high) {
    failures.push(
      `dev split is ${(devShare * 100).toFixed(1)}% of the corpus, outside the intended ${low * 100}-${high * 100}% band`,
    );
  }

  return failures;
}
