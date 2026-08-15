import type { PredictionRunAttempt } from "./prediction.js";

/** Default publish guard: provider failures must be at or below 20%. */
export const DEFAULT_MAX_PROVIDER_FAILURE_RATE = 0.2;
export const PROVIDER_FAILURE_RATE_ENV = "OPENLOOP_MAX_PROVIDER_FAILURE_RATE";

export interface PublishGate {
  readonly max_provider_failure_rate: number;
}

export interface IncompleteRun {
  readonly config: string;
  readonly split: string;
  readonly reason: "provider_failure_rate";
  readonly attempted_threads: number;
  readonly provider_failures: number;
  readonly parse_failures: number;
  readonly threads_with_parsed_loops: number;
  readonly parsed_loops: number;
  readonly provider_failure_rate: number;
  readonly max_provider_failure_rate: number;
}

export function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function parseProviderFailureThreshold(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_MAX_PROVIDER_FAILURE_RATE;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`provider failure threshold must be a number from 0 to 1; received ${raw}`);
  }
  return value;
}

export function incompleteRun(attempt: PredictionRunAttempt, gate: PublishGate): IncompleteRun | null {
  if (attempt.provider_failure_rate <= gate.max_provider_failure_rate) return null;
  return {
    config: attempt.config,
    split: attempt.split,
    reason: "provider_failure_rate",
    attempted_threads: attempt.attempted_threads,
    provider_failures: attempt.provider_failures,
    parse_failures: attempt.parse_failures,
    threads_with_parsed_loops: attempt.threads_with_parsed_loops,
    parsed_loops: attempt.parsed_loops,
    provider_failure_rate: attempt.provider_failure_rate,
    max_provider_failure_rate: gate.max_provider_failure_rate,
  };
}
