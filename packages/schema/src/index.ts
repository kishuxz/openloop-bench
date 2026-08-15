/**
 * @openloop-bench/schema: the single source of truth for the benchmark.
 *
 * Every package downstream (corpus, extractor, eval, web) imports its types
 * from here and nowhere else. If a shape is redeclared anywhere else in the
 * monorepo, that is a bug: the corpus and the thing being measured would be
 * free to drift apart, and the numbers would stop meaning anything.
 */

export {
  CHANNELS,
  CERTAINTIES,
  DIRECTIONS,
  REGISTERS,
  SPLITS,
  STATES,
  SUBJECT,
  ChannelSchema,
  CertaintySchema,
  DirectionSchema,
  RegisterSchema,
  SplitSchema,
  StateSchema,
  isSubject,
  type Certainty,
  type Channel,
  type Direction,
  type Register,
  type Split,
  type State,
} from "./enums.js";

export { IsoDateSchema, IsoTimestampSchema, isCalendarDate, isTimestamp } from "./temporal.js";

export { MessageSchema, type Message } from "./message.js";

export {
  DeadlineSchema,
  EvidenceSchema,
  LoopSchema,
  SpanSchema,
  type Deadline,
  type Evidence,
  type Loop,
  type Span,
} from "./loop.js";

export {
  CorpusSchema,
  ThreadSchema,
  ThreadShapeSchema,
  deadlineText,
  resolveEvidence,
  resolveSpan,
  splitsSurrogatePair,
  type Corpus,
  type HasMessages,
  type Thread,
  type ThreadShape,
} from "./thread.js";

export { formatIssues, formatPath } from "./format.js";
