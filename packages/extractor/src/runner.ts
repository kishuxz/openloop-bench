import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Split } from "@openloop-bench/schema";
import { PROMPT_VERSION } from "./prompts/v1.js";
import { WORKSPACE_ROOT, cacheKey, readCachedCall, writeCachedCall, type CacheStats } from "./cache.js";
import { CONFIG_NAMES, configByName, type ExtractorConfigName, type ModelConfig } from "./config.js";
import { loadSplitForExtraction } from "./loader.js";
import { predictionFile, predictionFromModelCall, type PredictionFile, type ThreadPrediction } from "./prediction.js";
import { callModel } from "./provider.js";
import { redactThread } from "./redaction.js";

export interface ExtractOptions {
  readonly split: Split;
  readonly configs: readonly ExtractorConfigName[];
  readonly noCache: boolean;
  readonly final: boolean;
}

export interface ExtractRunResult {
  readonly files: readonly string[];
  readonly cacheHits: number;
  readonly cacheMisses: number;
}

const PREDICTIONS_DIR = join(WORKSPACE_ROOT, "predictions");

function existingTestPrediction(): string | null {
  try {
    const files = readdirSync(PREDICTIONS_DIR);
    const existing = files.find((file) => /^.+-test(?:-.+)?\.json$/.test(file));
    return existing ? relative(WORKSPACE_ROOT, join(PREDICTIONS_DIR, existing)) : null;
  } catch {
    return null;
  }
}

function assertTestSplitAllowed(options: ExtractOptions): void {
  if (options.split !== "test") return;
  if (!options.final) {
    throw new Error("Refusing to run test split without --final.");
  }
  const existing = existingTestPrediction();
  if (existing) {
    throw new Error(`Refusing to run test split because ${existing} already exists. Delete it by hand to overwrite.`);
  }
}

async function predictionForThread(input: {
  readonly config: ModelConfig;
  readonly corpusHash: string;
  readonly originalThreadId: string;
  readonly opaqueThreadId: string;
  readonly thread: ReturnType<typeof loadSplitForExtraction>["records"][number]["thread"];
  readonly noCache: boolean;
  readonly stats: CacheStats;
}): Promise<ThreadPrediction> {
  const redacted = input.config.redact ? redactThread(input.thread) : null;
  const modelThread = redacted?.thread ?? input.thread;
  const key = cacheKey({
    corpusHash: input.corpusHash,
    threadId: input.originalThreadId,
    config: input.config.config,
    modelId: input.config.modelId,
  });

  const cached = input.noCache ? null : readCachedCall(key);
  const call = cached ?? await callModel(input.config, modelThread);
  if (cached) input.stats.hits++;
  else {
    input.stats.misses++;
    writeCachedCall(key, call);
  }

  return predictionFromModelCall({
    originalThreadId: input.originalThreadId,
    opaqueThreadId: input.opaqueThreadId,
    thread: modelThread,
    config: input.config,
    call,
    redactionMaps: redacted?.messageMaps ?? null,
  });
}

async function runConfig(input: {
  readonly configName: ExtractorConfigName;
  readonly split: Split;
  readonly noCache: boolean;
  readonly corpusHash: string;
  readonly records: ReturnType<typeof loadSplitForExtraction>["records"];
}): Promise<{ readonly path: string; readonly file: PredictionFile; readonly stats: CacheStats }> {
  const config = configByName(input.configName);
  const stats: CacheStats = { hits: 0, misses: 0 };
  const predictions: ThreadPrediction[] = [];

  for (const record of input.records) {
    predictions.push(
      await predictionForThread({
        config,
        corpusHash: input.corpusHash,
        originalThreadId: record.originalThreadId,
        opaqueThreadId: record.opaqueThreadId,
        thread: record.thread,
        noCache: input.noCache,
        stats,
      }),
    );
  }

  const file = predictionFile({
    config,
    split: input.split,
    corpusHash: input.corpusHash,
    createdAt: new Date().toISOString(),
    cacheHits: stats.hits,
    cacheMisses: stats.misses,
    predictions,
  });
  const path = join(PREDICTIONS_DIR, `${config.config}-${input.split}.json`);
  mkdirSync(PREDICTIONS_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  return { path: relative(WORKSPACE_ROOT, path), file, stats };
}

export async function extract(options: ExtractOptions): Promise<ExtractRunResult> {
  assertTestSplitAllowed(options);
  if (options.split === "dev") {
    console.warn("WARNING: test runs remaining: one.");
  }

  const { corpusHash, records } = loadSplitForExtraction(options.split);
  const files: string[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const configName of options.configs) {
    const result = await runConfig({
      configName,
      split: options.split,
      noCache: options.noCache,
      corpusHash,
      records,
    });
    files.push(result.path);
    cacheHits += result.stats.hits;
    cacheMisses += result.stats.misses;
    console.log(
      `${configName}: wrote ${result.path} (${result.file.predictions.length} threads, cache hits ${result.stats.hits}, misses ${result.stats.misses}, prompt ${PROMPT_VERSION})`,
    );
  }

  console.log(`cache hits ${cacheHits}, misses ${cacheMisses}`);
  return { files, cacheHits, cacheMisses };
}

export const DEFAULT_CONFIGS = CONFIG_NAMES;
