import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROMPT_VERSION } from "./prompts/v1.js";
import type { ExtractorConfigName } from "./config.js";
import type { ModelCallResult } from "./provider.js";

export interface CacheKeyInput {
  readonly corpusHash: string;
  readonly threadId: string;
  readonly config: ExtractorConfigName;
  readonly modelId: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
}

export const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
export const CACHE_DIR = join(WORKSPACE_ROOT, ".cache/extractor");

export function cacheKey(input: CacheKeyInput): string {
  return createHash("sha256")
    .update(input.corpusHash)
    .update("\0")
    .update(input.threadId)
    .update("\0")
    .update(input.config)
    .update("\0")
    .update(PROMPT_VERSION)
    .update("\0")
    .update(input.modelId)
    .digest("hex");
}

export function readCachedCall(key: string): ModelCallResult | null {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (typeof parsed !== "object" || parsed === null) return null;
  const value = parsed as ModelCallResult;
  if (typeof value.rawModelResponse !== "string") return null;
  if (typeof value.latencyMs !== "number") return null;
  if (!("providerError" in value)) return null;
  return value;
}

export function writeCachedCall(key: string, result: ModelCallResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), `${JSON.stringify(result, null, 2)}\n`);
}
