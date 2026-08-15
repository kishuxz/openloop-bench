/**
 * fixtures — synthetic prediction files, generated from the dev ground truth by
 * declared perturbations.
 *
 * Phase 4 has to be finished and trustworthy before Phase 3 produces a single
 * real prediction, which raises the obvious question of what the eval is
 * supposed to be run against in the meantime. Hand-written fixture files were
 * the first answer and are the wrong one: they go stale the moment a thread is
 * edited, their spans have to be hand-counted (the exact failure the corpus
 * authoring rules exist to prevent), and nobody can say what the "right" score
 * for them is, so they cannot tell you the eval is correct — only that it runs.
 *
 * Instead the fixtures are *derived*: take the dev labels and damage them in
 * ways that are declared up front. Every perturbation is a counter rule
 * ("every 7th loop is dropped"), so the file is a pure function of the corpus,
 * regenerable, and — the point — the eval's output can be checked against what
 * was injected. If 14 direction flips go in and the confusion matrix reports
 * 11, the matcher is losing pairs, and the fixture is what says so.
 *
 * The three configurations are shaped to be *interestingly* different rather
 * than realistically different:
 *
 *   fixture-dev     — the reference. Moderate errors of every kind, spans a
 *                     little wide, including the ungrounded and unmappable
 *                     spans that no hand-written fixture would think to add.
 *   fixture-greedy  — over-fires. Evidence spans swallow the whole message and
 *                     it invents loops in threads that have none. It exists to
 *                     make the IoU threshold bite: whole-message spans clear
 *                     0.3 and fail 0.7, so this config's ranking is expected to
 *                     move, which is the thing the report has to be able to
 *                     notice.
 *   fixture-strict  — under-fires. Drops one loop in three and keeps its spans
 *                     tight. High precision, poor recall — the shape the cost
 *                     model deliberately prefers.
 *
 * None of these is a claim about how any model behaves. They are test vectors.
 */

import { corpusHash, THREADS_DIR } from "@openloop-bench/corpus";
import type { Direction, Loop, Span, State, Thread } from "@openloop-bench/schema";
import {
  PREDICTION_FORMAT,
  UNMAPPABLE,
  type PredictedDeadline,
  type PredictedLoop,
  type PredictedOffsets,
  type PredictedSpan,
  type PredictionFile,
} from "./prediction.js";

/**
 * Date stamped into every generated fixture. Fixed, not read from the clock:
 * `pnpm report` must produce the same bytes tomorrow, and the report prints the
 * run date it was given.
 */
export const FIXTURE_DATE = "2026-08-14";

/** How a predicted evidence span relates to the true one. */
export type SpanStyle = "exact" | "tight" | "wide" | "whole-message";

export interface FixtureSpec {
  readonly config: string;
  readonly model_id: string;
  readonly prompt_version: string;
  readonly sampling: Record<string, string | number | boolean | null>;
  readonly notes: string;

  readonly span: SpanStyle;
  /** Drop every nth true loop. 0 disables. Produces false negatives. */
  readonly dropEvery: number;
  /** Fabricate a loop in every nth thread. Produces false positives. */
  readonly fabricateEvery: number;
  /** Report every nth kept loop as two overlapping predictions. */
  readonly splitEvery: number;
  /** Invert direction on every nth kept loop. */
  readonly flipEvery: number;
  /** Report every nth superseded loop as still open. */
  readonly supersededAsOpenEvery: number;
  /** Point every nth kept loop's evidence past the end of its message. */
  readonly ungroundEvery: number;
  /** Mark every nth kept loop's evidence unmappable. */
  readonly unmappableEvery: number;
  /** Damage the deadline on every nth kept loop. */
  readonly deadlineEvery: number;
  /** Damage the resolution span on every nth kept loop. */
  readonly resolutionEvery: number;
}

const SAMPLING = {
  temperature: 0,
  top_p: 1,
  max_output_tokens: 4096,
  seed: 20260814,
} as const;

export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  {
    config: "fixture-dev",
    model_id: "fixture://reference-v1",
    prompt_version: "fixture-0",
    sampling: { ...SAMPLING },
    notes: "Reference fixture. Moderate errors of every scored kind, spans slightly wide.",
    span: "wide",
    dropEvery: 9,
    fabricateEvery: 6,
    splitEvery: 17,
    flipEvery: 11,
    supersededAsOpenEvery: 3,
    ungroundEvery: 23,
    unmappableEvery: 19,
    deadlineEvery: 5,
    resolutionEvery: 7,
  },
  {
    config: "fixture-greedy",
    model_id: "fixture://greedy-v1",
    prompt_version: "fixture-0",
    sampling: { ...SAMPLING, temperature: 0.7 },
    notes: "Over-fires: whole-message evidence spans and invented loops. Expected to lose ranking as IoU rises.",
    span: "whole-message",
    dropEvery: 0,
    fabricateEvery: 2,
    splitEvery: 8,
    flipEvery: 13,
    supersededAsOpenEvery: 2,
    ungroundEvery: 29,
    unmappableEvery: 31,
    deadlineEvery: 4,
    resolutionEvery: 6,
  },
  {
    config: "fixture-strict",
    model_id: "fixture://strict-v1",
    prompt_version: "fixture-0",
    sampling: { ...SAMPLING },
    notes: "Under-fires: drops one loop in three, keeps spans tight, rarely invents anything.",
    span: "tight",
    dropEvery: 3,
    fabricateEvery: 25,
    splitEvery: 0,
    flipEvery: 19,
    supersededAsOpenEvery: 5,
    ungroundEvery: 0,
    // Coprime with dropEvery, or the rule would only ever select loops that
    // were already dropped and inject nothing.
    unmappableEvery: 37,
    deadlineEvery: 7,
    resolutionEvery: 11,
  },
];

/** What a generator run put into a file. Printed, and asserted against in tests. */
export interface Injected {
  dropped: number;
  fabricated: number;
  split: number;
  flipped: number;
  superseded_as_open: number;
  ungrounded: number;
  unmappable: number;
  deadline_damaged: number;
  resolution_damaged: number;
  predictions: number;
}

function every(n: number, counter: number): boolean {
  return n > 0 && counter % n === 0;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The evidence span an extractor of this shape would have emitted. */
function styleSpan(style: SpanStyle, span: Span, textLength: number): Span {
  switch (style) {
    case "exact":
      return span;
    case "tight": {
      const room = Math.floor((span.end - span.start) / 6);
      return { msg_index: span.msg_index, start: span.start + room, end: span.end - room };
    }
    case "wide":
      return {
        msg_index: span.msg_index,
        start: clamp(span.start - 5, 0, textLength),
        end: clamp(span.end + 7, 0, textLength),
      };
    case "whole-message":
      return { msg_index: span.msg_index, start: 0, end: textLength };
  }
}

function flip(direction: Direction): Direction {
  if (direction === "blocked_on_you") return "blocked_on_them";
  if (direction === "blocked_on_them") return "blocked_on_you";
  return "blocked_on_them";
}

function messageLength(thread: Thread, index: number): number {
  return thread.messages[index]?.text.length ?? 0;
}

/** A prediction that reproduces the truth exactly, before any damage. */
function faithful(thread: Thread, truth: Loop, style: SpanStyle): PredictedLoop {
  return {
    statement: truth.statement,
    direction: truth.direction,
    counterparty: truth.counterparty,
    deadline: {
      span: truth.deadline.span,
      resolved: truth.deadline.resolved,
      certainty: truth.deadline.certainty,
    },
    evidence: styleSpan(style, truth.evidence, messageLength(thread, truth.evidence.msg_index)),
    resolution: truth.resolution,
    state: truth.state,
    register: truth.register,
  };
}

/**
 * A loop nobody made, grounded in a message that carries no true evidence, so
 * it is unambiguously a false positive at every threshold rather than a
 * near-miss whose classification depends on the constant under test.
 */
function fabricate(thread: Thread, direction: Direction): PredictedLoop | null {
  const taken = new Set(thread.loops.map((l) => l.evidence.msg_index));
  const message = thread.messages.find((m) => !taken.has(m.index) && m.text.trim().length >= 12);
  if (!message) return null;

  const text = message.text;
  const start = Math.floor(text.length / 4);
  const end = Math.max(start + 8, Math.floor((text.length * 3) / 4));

  return {
    statement: `follow up on "${text.slice(start, Math.min(end, start + 40)).trim()}"`,
    direction,
    counterparty: thread.messages.find((m) => m.sender !== "user")?.sender ?? "them",
    deadline: { span: null, resolved: null, certainty: "none" },
    evidence: { msg_index: message.index, start, end: Math.min(end, text.length) },
    resolution: null,
    state: "open",
    register: thread.loops[0]?.register ?? "en",
  };
}

export interface GeneratedFixture {
  readonly file: PredictionFile;
  readonly injected: Injected;
}

/**
 * Build one fixture file from the dev threads.
 *
 * Counters run across the whole split rather than per thread, so a rule like
 * "every 9th loop" spreads its damage over the corpus instead of clustering it
 * in the threads that happen to be long.
 */
export function generateFixture(
  threads: readonly Thread[],
  spec: FixtureSpec,
  hash: string,
): GeneratedFixture {
  const injected: Injected = {
    dropped: 0,
    fabricated: 0,
    split: 0,
    flipped: 0,
    superseded_as_open: 0,
    ungrounded: 0,
    unmappable: 0,
    deadline_damaged: 0,
    resolution_damaged: 0,
    predictions: 0,
  };

  let loopCounter = 0;
  let threadCounter = 0;
  let supersededCounter = 0;

  const predictions = threads.map((thread) => {
    threadCounter += 1;
    const loops: PredictedLoop[] = [];

    for (const truth of thread.loops) {
      loopCounter += 1;

      if (every(spec.dropEvery, loopCounter)) {
        injected.dropped += 1;
        continue;
      }

      const prediction = faithful(thread, truth, spec.span);
      let evidence: PredictedOffsets = styleSpan(
        spec.span,
        truth.evidence,
        messageLength(thread, truth.evidence.msg_index),
      );
      let direction: Direction = prediction.direction;
      let state: State = prediction.state;
      let resolution: PredictedSpan | null = prediction.resolution;
      let deadline: PredictedDeadline = prediction.deadline;

      if (every(spec.flipEvery, loopCounter)) {
        direction = flip(direction);
        injected.flipped += 1;
      }

      if (truth.state === "superseded") {
        supersededCounter += 1;
        if (every(spec.supersededAsOpenEvery, supersededCounter)) {
          state = "open";
          resolution = null;
          injected.superseded_as_open += 1;
        }
      }

      if (every(spec.deadlineEvery, loopCounter)) {
        deadline =
          truth.deadline.certainty === "explicit"
            ? { span: null, resolved: null, certainty: "implied" }
            : { span: null, resolved: truth.deadline.resolved, certainty: "implied" };
        injected.deadline_damaged += 1;
      }

      if (every(spec.resolutionEvery, loopCounter)) {
        if (resolution && resolution !== UNMAPPABLE) {
          const next = resolution.msg_index + 1;
          resolution =
            next < thread.messages.length
              ? { msg_index: next, start: 0, end: Math.min(12, messageLength(thread, next)) }
              : null;
        } else if (state === "open") {
          const last = thread.messages.length - 1;
          resolution = { msg_index: last, start: 0, end: Math.min(12, messageLength(thread, last)) };
        }
        injected.resolution_damaged += 1;
      }

      // Grounding damage is applied last: an unmappable or fabricated-offset
      // span replaces whatever the styles produced.
      if (every(spec.unmappableEvery, loopCounter)) {
        loops.push({ ...prediction, direction, state, resolution, deadline, evidence: UNMAPPABLE });
        injected.unmappable += 1;
        continue;
      }

      if (every(spec.ungroundEvery, loopCounter)) {
        const length = messageLength(thread, evidence.msg_index);
        evidence = { msg_index: evidence.msg_index, start: length + 3, end: length + 11 };
        injected.ungrounded += 1;
      }

      if (every(spec.splitEvery, loopCounter) && evidence.end - evidence.start >= 10) {
        // Two overlapping reports of one commitment, each covering 60% of the
        // span and sharing its middle fifth. What that does to the match is the
        // point: depending on the style and the threshold, both halves clear the
        // bar (one match, one false positive, counted as a split), or only one
        // does, or neither does and the loop is missed entirely.
        const width = evidence.end - evidence.start;
        const cut = Math.round(width * 0.6);
        loops.push(
          { ...prediction, direction, state, resolution, deadline, evidence: { ...evidence, end: evidence.start + cut } },
          { ...prediction, direction, state, resolution, deadline, evidence: { ...evidence, start: evidence.end - cut } },
        );
        injected.split += 1;
        continue;
      }

      loops.push({ ...prediction, direction, state, resolution, deadline, evidence });
    }

    if (every(spec.fabricateEvery, threadCounter)) {
      const invented = fabricate(thread, threadCounter % 4 === 0 ? "blocked_on_them" : "blocked_on_you");
      if (invented) {
        loops.push(invented);
        injected.fabricated += 1;
      }
    }

    injected.predictions += loops.length;
    return { thread_id: thread.thread_id, loops };
  });

  return {
    file: {
      format: PREDICTION_FORMAT,
      meta: {
        config: spec.config,
        model_id: spec.model_id,
        prompt_version: spec.prompt_version,
        sampling: spec.sampling,
        corpus_hash: hash,
        split: "dev",
        generated_at: FIXTURE_DATE,
        notes: spec.notes,
      },
      predictions,
    },
    injected,
  };
}

/** Generate every fixture against the corpus on disk. */
export function generateAll(
  threads: readonly Thread[],
  dir: string = THREADS_DIR,
): Array<{ spec: FixtureSpec; generated: GeneratedFixture }> {
  const hash = corpusHash(dir);
  return FIXTURE_SPECS.map((spec) => ({ spec, generated: generateFixture(threads, spec, hash) }));
}
