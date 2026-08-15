/**
 * load — read the thread files off disk and parse them against the schema.
 *
 * Tolerant read, in the sense that one broken file does not hide the other
 * thirty-nine: every file is attempted and every failure is collected, so a
 * single `pnpm validate` run reports the whole state of the corpus rather than
 * the first thing it tripped over. Deciding what to do about failures is the
 * caller's job — `validate` prints them all, `stats` refuses to compute.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ThreadSchema, formatIssues, type Thread } from "@openloop-bench/schema";

export const THREADS_DIR = join(import.meta.dirname, "../threads");

export interface LoadedThread {
  file: string;
  thread: Thread;
}

export interface LoadFailure {
  file: string;
  /** Lines of `path: message`, ready to print. */
  problems: string[];
}

export interface LoadResult {
  loaded: LoadedThread[];
  failures: LoadFailure[];
}

/** Every `*.json` in the threads directory, sorted, filename only. */
export function threadFiles(dir: string = THREADS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

/**
 * Parse every thread file. Never throws on bad data — a malformed corpus is a
 * result to report, not an exception to propagate.
 */
export function loadThreads(dir: string = THREADS_DIR): LoadResult {
  const loaded: LoadedThread[] = [];
  const failures: LoadFailure[] = [];

  for (const file of threadFiles(dir)) {
    const raw = readFileSync(join(dir, file), "utf-8");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      failures.push({
        file,
        problems: [`(file): not valid JSON — ${(error as Error).message}`],
      });
      continue;
    }

    const result = ThreadSchema.safeParse(json);
    if (!result.success) {
      failures.push({ file, problems: formatIssues(result.error) });
      continue;
    }

    loaded.push({ file, thread: result.data });
  }

  return { loaded, failures };
}

/**
 * Threads only, for consumers that have no story for bad data. Throws with a
 * pointer at the tool whose job is to explain what is wrong.
 */
export function loadCorpusOrThrow(dir: string = THREADS_DIR): Thread[] {
  const { loaded, failures } = loadThreads(dir);
  if (failures.length > 0) {
    const files = failures.map((f) => f.file).join(", ");
    throw new Error(`${failures.length} thread file(s) failed to parse (${files}). Run \`pnpm validate\`.`);
  }
  return loaded.map((l) => l.thread);
}

/** `thread_id` must equal the file's basename — the filename is an index. */
export function filenameMismatch(file: string, thread: Thread): string | null {
  const expected = basename(file, ".json");
  return thread.thread_id === expected
    ? null
    : `(file): thread_id "${thread.thread_id}" does not match filename "${expected}"`;
}
