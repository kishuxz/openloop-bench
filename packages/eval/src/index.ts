/**
 * @openloop-bench/eval: the matcher, the metrics, the cost model, the report.
 *
 * Read `match.ts` first. Everything else in this package is arithmetic over its
 * output; the decision about when a predicted loop IS a ground-truth loop is
 * the only judgment call, and it is documented there.
 */

export {
  PREDICTION_FORMAT,
  PredictedDeadlineSchema,
  PredictedLoopSchema,
  PredictedOffsetsSchema,
  PredictedSpanSchema,
  PredictionFileSchema,
  RunMetaSchema,
  ThreadPredictionSchema,
  UNMAPPABLE,
  allPredictedLoops,
  hasOffsets,
  predictionRunAttempt,
  readPredictionJson,
  type PredictedDeadline,
  type PredictedLoop,
  type PredictedOffsets,
  type PredictedSpan,
  type PredictionFile,
  type PredictionRunAttempt,
  type RunMeta,
  type ThreadPrediction,
} from "./prediction.js";

export {
  DEFAULT_IOU,
  IOU_THRESHOLDS,
  groundedEvidence,
  matchThread,
  spanIoU,
  type MatchDecision,
  type NearMiss,
  type NearMissReason,
  type ThreadMatch,
} from "./match.js";

export {
  COST_KINDS,
  DEFAULT_COST_MATRIX,
  costOfError,
  isInverted,
  summariseCost,
  type CostBreakdown,
  type CostKind,
  type CostMatrix,
  type CostedError,
} from "./cost.js";

export {
  ERROR_CATEGORIES,
  LENGTH_BINS,
  LOOPS_BINS,
  categorise,
  computeBreakdowns,
  computeMetrics,
  costedErrors,
  lengthBin,
  loopsBin,
  outcomesOf,
  predictedSpanText,
  rate,
  type Breakdown,
  type Breakdowns,
  type Confusion,
  type Detection,
  type ErrorCategory,
  type MetricSet,
  type Outcome,
  type OutcomeKind,
} from "./metrics.js";

export {
  RESULTS_FORMAT,
  buildMatchLog,
  coverageProblems,
  loadValidatedCorpus,
  readPredictionFile,
  scoreRun,
  threadsForSplit,
  type EvalRun,
  type MatchLog,
  type ScoreOptions,
  type ScoredRun,
  type ThresholdResult,
} from "./evaluate.js";

export {
  FIXTURE_DATE,
  FIXTURE_SPECS,
  generateAll,
  generateFixture,
  type FixtureSpec,
  type GeneratedFixture,
  type Injected,
  type SpanStyle,
} from "./fixtures.js";

export {
  FIXTURE_PREDICTIONS_DIR,
  PREDICTIONS_DIR,
  REPORT_PATH,
  REPO_ROOT,
  RESULTS_DIR,
  matchesPath,
  metricsPath,
  writeJson,
} from "./paths.js";

export { renderReport, type ReportInputs } from "./report.js";

export {
  DEFAULT_MAX_PROVIDER_FAILURE_RATE,
  PROVIDER_FAILURE_RATE_ENV,
  formatRate,
  incompleteRun,
  parseProviderFailureThreshold,
  type IncompleteRun,
  type PublishGate,
} from "./quality.js";
