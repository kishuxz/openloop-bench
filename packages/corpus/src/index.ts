/**
 * @openloop-bench/corpus: the labeled threads, and the tools that keep them
 * honest.
 *
 * Consumers want one of two things: every thread (`loadCorpusOrThrow`), or
 * every thread plus the failures (`loadThreads`). The eval package will want
 * the first and refuse to score a corpus that does not load; the validator
 * wants the second, because reporting all forty failures at once is the whole
 * point of it.
 */

export { BUCKETS, BUCKET_PREFIXES, bucketOf, type Bucket } from "./buckets.js";

export { DEV_SHARE_RANGE, checkComposition } from "./composition.js";

export {
  MIN_THREADS,
  corpusHash,
  formatReport,
  separability,
  separabilityReport,
  threadTokens,
  tokenize,
  type Sample,
  type SeparabilityReport,
  type SeparabilityResult,
} from "./separability.js";

export {
  THREADS_DIR,
  filenameMismatch,
  loadCorpusOrThrow,
  loadThreads,
  threadFiles,
  type LoadFailure,
  type LoadResult,
  type LoadedThread,
} from "./load.js";
