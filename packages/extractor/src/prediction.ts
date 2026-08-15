import { z } from "zod";
import {
  CertaintySchema,
  DirectionSchema,
  LoopSchema,
  RegisterSchema,
  StateSchema,
  type Loop,
  type Split,
  type Span,
} from "@openloop-bench/schema";
import { PROMPT_VERSION } from "./prompts/v1.js";
import type { ModelConfig } from "./config.js";
import type { ModelCallResult, TokenCounts } from "./provider.js";
import type { ExtractionThread } from "./loader.js";
import { mapRedactedSpanToOriginal, type OffsetMap } from "./redaction.js";

const RawDeadlineSchema = z.strictObject({
  quote: z.string().min(1).nullable(),
  msg_index: z.int().min(0).nullable(),
  resolved: z.string().nullable(),
  certainty: CertaintySchema,
});

const RawLoopSchema = z.strictObject({
  statement: z.string().min(1),
  direction: DirectionSchema,
  counterparty: z.string().min(1),
  deadline: RawDeadlineSchema,
  evidence_quote: z.string().min(1),
  evidence_msg_index: z.int().min(0),
  resolution_quote: z.string().min(1).nullable(),
  resolution_msg_index: z.int().min(0).nullable(),
  state: StateSchema,
  register: RegisterSchema,
});

const ModelResponseSchema = z.strictObject({
  loops: z.array(RawLoopSchema),
});

export interface PredictionModelMetadata {
  readonly provider: ModelConfig["provider"];
  readonly id: string;
  readonly version: string;
  readonly sampling: ModelConfig["sampling"];
  readonly json_mode: boolean;
}

export interface ParseFailure {
  readonly message: string;
}

export interface PredictionUnmappableSpan {
  readonly loop_index: number;
  readonly field: string;
  readonly span: Span;
  readonly reason: "missing_message_map" | "inside_redaction" | "invalid_span";
}

export interface PredictionGroundingFailure {
  readonly loop_index: number;
  readonly field: string;
  readonly quote: string;
  readonly msg_index: number | null;
  readonly reason: "message_missing" | "quote_missing";
}

export interface PredictionAmbiguousQuote {
  readonly loop_index: number;
  readonly field: string;
  readonly quote: string;
  readonly msg_index: number;
  readonly matches: number;
}

export interface ThreadPrediction {
  readonly thread_id: string;
  readonly model_thread_id: string;
  readonly config: ModelConfig["config"];
  readonly prompt_version: string;
  readonly model: PredictionModelMetadata;
  readonly raw_model_response: string;
  readonly parsed_loops: readonly Loop[];
  readonly grounding_failures: readonly PredictionGroundingFailure[];
  readonly ambiguous_quotes: readonly PredictionAmbiguousQuote[];
  readonly unmappable_spans: readonly PredictionUnmappableSpan[];
  readonly latency_ms: number;
  readonly token_counts: TokenCounts | null;
  readonly parse_failure: ParseFailure | null;
  readonly provider_error: string | null;
}

export interface PredictionFile {
  readonly schema_version: 1;
  readonly run: {
    readonly config: ModelConfig["config"];
    readonly split: Split;
    readonly prompt_version: string;
    readonly corpus_hash: string;
    readonly created_at: string;
    readonly cache_hits: number;
    readonly cache_misses: number;
  };
  readonly model: PredictionModelMetadata;
  readonly predictions: readonly ThreadPrediction[];
}

function modelMetadata(config: ModelConfig): PredictionModelMetadata {
  return {
    provider: config.provider,
    id: config.modelId,
    version: config.modelVersion,
    sampling: config.sampling,
    json_mode: config.jsonMode,
  };
}

function findQuote(input: {
  readonly thread: ExtractionThread;
  readonly loopIndex: number;
  readonly field: string;
  readonly quote: string;
  readonly msgIndex: number | null;
}): {
  readonly span: Span | null;
  readonly failure: PredictionGroundingFailure | null;
  readonly ambiguous: PredictionAmbiguousQuote | null;
} {
  if (input.msgIndex === null) {
    return {
      span: null,
      failure: {
        loop_index: input.loopIndex,
        field: input.field,
        quote: input.quote,
        msg_index: null,
        reason: "message_missing",
      },
      ambiguous: null,
    };
  }

  const message = input.thread.messages[input.msgIndex];
  if (!message) {
    return {
      span: null,
      failure: {
        loop_index: input.loopIndex,
        field: input.field,
        quote: input.quote,
        msg_index: input.msgIndex,
        reason: "message_missing",
      },
      ambiguous: null,
    };
  }

  const matches: number[] = [];
  let cursor = message.text.indexOf(input.quote);
  while (cursor !== -1) {
    matches.push(cursor);
    cursor = message.text.indexOf(input.quote, cursor + 1);
  }

  if (matches.length === 0) {
    return {
      span: null,
      failure: {
        loop_index: input.loopIndex,
        field: input.field,
        quote: input.quote,
        msg_index: input.msgIndex,
        reason: "quote_missing",
      },
      ambiguous: null,
    };
  }

  const start = matches[0]!;
  return {
    span: { msg_index: input.msgIndex, start, end: start + input.quote.length },
    failure: null,
    ambiguous: matches.length > 1
      ? {
          loop_index: input.loopIndex,
          field: input.field,
          quote: input.quote,
          msg_index: input.msgIndex,
          matches: matches.length,
        }
      : null,
  };
}

function parseRawResponse(raw: string, thread: ExtractionThread): {
  readonly loops: readonly Loop[];
  readonly failure: ParseFailure | null;
  readonly groundingFailures: readonly PredictionGroundingFailure[];
  readonly ambiguousQuotes: readonly PredictionAmbiguousQuote[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      loops: [],
      failure: { message: `malformed JSON: ${(error as Error).message}` },
      groundingFailures: [],
      ambiguousQuotes: [],
    };
  }

  const result = ModelResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      loops: [],
      failure: { message: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") },
      groundingFailures: [],
      ambiguousQuotes: [],
    };
  }

  const loops: Loop[] = [];
  const groundingFailures: PredictionGroundingFailure[] = [];
  const ambiguousQuotes: PredictionAmbiguousQuote[] = [];

  result.data.loops.forEach((loop, loopIndex) => {
    const evidence = findQuote({
      thread,
      loopIndex,
      field: "evidence",
      quote: loop.evidence_quote,
      msgIndex: loop.evidence_msg_index,
    });
    if (evidence.failure) groundingFailures.push(evidence.failure);
    if (evidence.ambiguous) ambiguousQuotes.push(evidence.ambiguous);

    const resolution = loop.resolution_quote === null
      ? { span: null, failure: null, ambiguous: null }
      : findQuote({
          thread,
          loopIndex,
          field: "resolution",
          quote: loop.resolution_quote,
          msgIndex: loop.resolution_msg_index,
        });
    if (resolution.failure) groundingFailures.push(resolution.failure);
    if (resolution.ambiguous) ambiguousQuotes.push(resolution.ambiguous);

    const deadline = loop.deadline.quote === null
      ? { span: null, failure: null, ambiguous: null }
      : findQuote({
          thread,
          loopIndex,
          field: "deadline.span",
          quote: loop.deadline.quote,
          msgIndex: loop.deadline.msg_index,
        });
    if (deadline.failure) groundingFailures.push(deadline.failure);
    if (deadline.ambiguous) ambiguousQuotes.push(deadline.ambiguous);

    if (evidence.span === null) return;
    const candidate = LoopSchema.safeParse({
      statement: loop.statement,
      direction: loop.direction,
      counterparty: loop.counterparty,
      deadline: {
        span: deadline.span,
        resolved: loop.deadline.resolved,
        certainty: loop.deadline.certainty,
      },
      evidence: evidence.span,
      resolution: resolution.span,
      state: loop.state,
      register: loop.register,
    });
    if (!candidate.success) {
      groundingFailures.push({
        loop_index: loopIndex,
        field: "loop",
        quote: loop.statement,
        msg_index: null,
        reason: "quote_missing",
      });
      return;
    }
    loops.push(candidate.data);
  });

  return {
    loops,
    failure: groundingFailures.length > 0
      ? { message: groundingFailures.map((failure) => `${failure.field}: ${failure.reason}`).join("; ") }
      : null,
    groundingFailures,
    ambiguousQuotes,
  };
}

function mapSpan(
  maps: ReadonlyMap<number, OffsetMap>,
  loopIndex: number,
  field: string,
  span: Span,
): { readonly span: Span | null; readonly unmappable: PredictionUnmappableSpan | null } {
  const mapped = mapRedactedSpanToOriginal(maps, span, field);
  if (!mapped.ok) {
    return {
      span: null,
      unmappable: {
        loop_index: loopIndex,
        field,
        span,
        reason: mapped.reason,
      },
    };
  }
  return { span: mapped.span, unmappable: null };
}

function remapLoops(loops: readonly Loop[], maps: ReadonlyMap<number, OffsetMap> | null): {
  readonly loops: readonly Loop[];
  readonly unmappable: readonly PredictionUnmappableSpan[];
} {
  if (maps === null) return { loops, unmappable: [] };

  const mappedLoops: Loop[] = [];
  const unmappable: PredictionUnmappableSpan[] = [];

  loops.forEach((loop, loopIndex) => {
    const evidence = mapSpan(maps, loopIndex, "evidence", loop.evidence);
    if (evidence.unmappable) unmappable.push(evidence.unmappable);

    const resolution = loop.resolution === null ? { span: null, unmappable: null } : mapSpan(maps, loopIndex, "resolution", loop.resolution);
    if (resolution.unmappable) unmappable.push(resolution.unmappable);

    const deadline = loop.deadline.span === null
      ? { span: null, unmappable: null }
      : mapSpan(maps, loopIndex, "deadline.span", loop.deadline.span);
    if (deadline.unmappable) unmappable.push(deadline.unmappable);

    if (evidence.unmappable || resolution.unmappable || deadline.unmappable) return;
    if (evidence.span === null) return;

    mappedLoops.push({
      ...loop,
      evidence: evidence.span,
      resolution: resolution.span,
      deadline: {
        ...loop.deadline,
        span: deadline.span,
      },
    });
  });

  return { loops: mappedLoops, unmappable };
}

export function predictionFromModelCall(input: {
  readonly originalThreadId: string;
  readonly opaqueThreadId: string;
  readonly thread: ExtractionThread;
  readonly config: ModelConfig;
  readonly call: ModelCallResult;
  readonly redactionMaps: ReadonlyMap<number, OffsetMap> | null;
}): ThreadPrediction {
  const parsed = parseRawResponse(input.call.rawModelResponse, input.thread);
  const remapped = parsed.failure === null ? remapLoops(parsed.loops, input.redactionMaps) : { loops: [], unmappable: [] };
  return {
    thread_id: input.originalThreadId,
    model_thread_id: input.opaqueThreadId,
    config: input.config.config,
    prompt_version: PROMPT_VERSION,
    model: modelMetadata(input.config),
    raw_model_response: input.call.rawModelResponse,
    parsed_loops: remapped.loops,
    grounding_failures: parsed.groundingFailures,
    ambiguous_quotes: parsed.ambiguousQuotes,
    unmappable_spans: remapped.unmappable,
    latency_ms: input.call.latencyMs,
    token_counts: input.call.tokenCounts,
    parse_failure: input.call.providerError
      ? { message: `provider error: ${input.call.providerError}` }
      : parsed.failure,
    provider_error: input.call.providerError,
  };
}

export function predictionFile(input: {
  readonly config: ModelConfig;
  readonly split: Split;
  readonly corpusHash: string;
  readonly createdAt: string;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly predictions: readonly ThreadPrediction[];
}): PredictionFile {
  return {
    schema_version: 1,
    run: {
      config: input.config.config,
      split: input.split,
      prompt_version: PROMPT_VERSION,
      corpus_hash: input.corpusHash,
      created_at: input.createdAt,
      cache_hits: input.cacheHits,
      cache_misses: input.cacheMisses,
    },
    model: modelMetadata(input.config),
    predictions: input.predictions,
  };
}
