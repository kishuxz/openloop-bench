export const CONFIG_NAMES = ["hosted-large", "hosted-redacted", "local"] as const;
export type ExtractorConfigName = (typeof CONFIG_NAMES)[number];

export interface SamplingParameters {
  readonly temperature: 0;
  readonly seed: number;
  readonly max_retries: number;
  readonly request_delay_ms: number;
}

export interface ModelConfig {
  readonly config: ExtractorConfigName;
  readonly provider: "groq" | "ollama";
  readonly modelId: string;
  readonly modelVersion: string;
  readonly sampling: SamplingParameters;
  readonly jsonMode: boolean;
  readonly redact: boolean;
}

const SEED = 20260815;
const MAX_RETRIES = 5;
const REQUEST_DELAY_MS = 1500;
const sampling = { temperature: 0, seed: SEED, max_retries: MAX_RETRIES, request_delay_ms: REQUEST_DELAY_MS } as const;

export function configByName(config: ExtractorConfigName): ModelConfig {
  switch (config) {
    case "hosted-large": {
      const modelId = process.env.OPENLOOP_HOSTED_MODEL ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
      return {
        config,
        provider: "groq",
        modelId,
        modelVersion: process.env.OPENLOOP_HOSTED_MODEL_VERSION ?? modelId,
        sampling,
        jsonMode: true,
        redact: false,
      };
    }
    case "hosted-redacted": {
      const modelId = process.env.OPENLOOP_REDACTED_MODEL ?? process.env.OPENLOOP_HOSTED_MODEL ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
      return {
        config,
        provider: "groq",
        modelId,
        modelVersion: process.env.OPENLOOP_REDACTED_MODEL_VERSION ?? modelId,
        sampling,
        jsonMode: true,
        redact: true,
      };
    }
    case "local": {
      const modelId = process.env.OPENLOOP_LOCAL_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
      return {
        config,
        provider: "ollama",
        modelId,
        modelVersion: process.env.OPENLOOP_LOCAL_MODEL_VERSION ?? modelId,
        sampling,
        jsonMode: false,
        redact: false,
      };
    }
  }
}

export function isConfigName(value: string): value is ExtractorConfigName {
  return (CONFIG_NAMES as readonly string[]).includes(value);
}
