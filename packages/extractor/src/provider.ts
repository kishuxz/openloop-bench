import { PROMPT } from "./prompts/v1.js";
import type { ModelConfig } from "./config.js";
import type { ExtractionThread } from "./loader.js";

export interface TokenCounts {
  readonly input?: number;
  readonly output?: number;
  readonly total?: number;
}

type MutableTokenCounts = {
  input?: number;
  output?: number;
  total?: number;
};

export interface ModelCallResult {
  readonly rawModelResponse: string;
  readonly latencyMs: number;
  readonly tokenCounts: TokenCounts | null;
  readonly providerError: string | null;
}

function userPrompt(thread: ExtractionThread): string {
  return `Thread JSON:\n${JSON.stringify(thread, null, 2)}`;
}

function textFromOpenAIResponse(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const record = json as {
    output_text?: unknown;
    output?: unknown;
    choices?: unknown;
  };
  if (typeof record.output_text === "string") return record.output_text;

  if (Array.isArray(record.output)) {
    const chunks: string[] = [];
    for (const item of record.output) {
      if (typeof item !== "object" || item === null) continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") chunks.push(text);
      }
    }
    if (chunks.length > 0) return chunks.join("");
  }

  if (Array.isArray(record.choices)) {
    const first = record.choices[0];
    if (typeof first === "object" && first !== null) {
      const message = (first as { message?: unknown }).message;
      if (typeof message === "object" && message !== null) {
        const content = (message as { content?: unknown }).content;
        if (typeof content === "string") return content;
      }
    }
  }

  return "";
}

function tokenCountsFromOpenAIResponse(json: unknown): TokenCounts | null {
  if (typeof json !== "object" || json === null) return null;
  const usage = (json as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;
  const input = (usage as { input_tokens?: unknown; prompt_tokens?: unknown }).input_tokens;
  const prompt = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const output = (usage as { output_tokens?: unknown; completion_tokens?: unknown }).output_tokens;
  const completion = (usage as { completion_tokens?: unknown }).completion_tokens;
  const total = (usage as { total_tokens?: unknown }).total_tokens;
  const counts: MutableTokenCounts = {};
  if (typeof input === "number") counts.input = input;
  else if (typeof prompt === "number") counts.input = prompt;
  if (typeof output === "number") counts.output = output;
  else if (typeof completion === "number") counts.output = completion;
  if (typeof total === "number") counts.total = total;
  return counts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(config: ModelConfig, thread: ExtractionThread): Promise<ModelCallResult> {
  const started = Date.now();
  const apiKey = process.env.GROQ_API_KEY ?? process.env.OPENLOOP_GROQ_API_KEY;
  if (!apiKey) {
    return {
      rawModelResponse: "",
      latencyMs: Date.now() - started,
      tokenCounts: null,
      providerError: "GROQ_API_KEY is not set",
    };
  }

  for (let attempt = 0; attempt <= config.sampling.max_retries; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.modelId,
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: userPrompt(thread) },
          ],
          response_format: config.jsonMode ? { type: "json_object" } : undefined,
          temperature: config.sampling.temperature,
          seed: config.sampling.seed,
        }),
      });
      const json: unknown = await response.json();
      if (response.status === 429 && attempt < config.sampling.max_retries) {
        await sleep(config.sampling.request_delay_ms);
        continue;
      }
      if (!response.ok) {
        return {
          rawModelResponse: JSON.stringify(json),
          latencyMs: Date.now() - started,
          tokenCounts: tokenCountsFromOpenAIResponse(json),
          providerError: `Groq request failed with HTTP ${response.status}`,
        };
      }
      return {
        rawModelResponse: textFromOpenAIResponse(json),
        latencyMs: Date.now() - started,
        tokenCounts: tokenCountsFromOpenAIResponse(json),
        providerError: null,
      };
    } catch (error) {
      if (attempt < config.sampling.max_retries) {
        await sleep(config.sampling.request_delay_ms);
        continue;
      }
      return {
        rawModelResponse: "",
        latencyMs: Date.now() - started,
        tokenCounts: null,
        providerError: (error as Error).message,
      };
    }
  }

  return {
    rawModelResponse: "",
    latencyMs: Date.now() - started,
    tokenCounts: null,
    providerError: "Groq retry budget exhausted",
  };
}

async function callOllama(config: ModelConfig, thread: ExtractionThread): Promise<ModelCallResult> {
  const started = Date.now();
  const endpoint = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.modelId,
        prompt: `${PROMPT}\n\n${userPrompt(thread)}`,
        stream: false,
        options: {
          temperature: config.sampling.temperature,
          seed: config.sampling.seed,
        },
      }),
    });
    const json: unknown = await response.json();
    const raw = typeof json === "object" && json !== null && typeof (json as { response?: unknown }).response === "string"
      ? (json as { response: string }).response
      : JSON.stringify(json);
    const promptEval = typeof json === "object" && json !== null ? (json as { prompt_eval_count?: unknown }).prompt_eval_count : undefined;
    const evalCount = typeof json === "object" && json !== null ? (json as { eval_count?: unknown }).eval_count : undefined;
    if (!response.ok) {
      return {
        rawModelResponse: raw,
        latencyMs: Date.now() - started,
        tokenCounts: null,
        providerError: `Ollama request failed with HTTP ${response.status}`,
      };
    }
    const tokenCounts: MutableTokenCounts = {};
    if (typeof promptEval === "number") tokenCounts.input = promptEval;
    if (typeof evalCount === "number") tokenCounts.output = evalCount;
    if (typeof promptEval === "number" && typeof evalCount === "number") tokenCounts.total = promptEval + evalCount;
    return {
      rawModelResponse: raw,
      latencyMs: Date.now() - started,
      tokenCounts,
      providerError: null,
    };
  } catch (error) {
    return {
      rawModelResponse: "",
      latencyMs: Date.now() - started,
      tokenCounts: null,
      providerError: (error as Error).message,
    };
  }
}

export async function callModel(config: ModelConfig, thread: ExtractionThread): Promise<ModelCallResult> {
  if (config.provider === "groq") return callGroq(config, thread);
  return callOllama(config, thread);
}
