/**
 * format — turn a ZodError into lines a human can act on without opening a
 * debugger.
 *
 * `pnpm validate` is the gate on every corpus edit, so its failure output is a
 * user interface. One issue per line, dotted path first, so the output greps
 * and diffs cleanly: `thread-07.json  loops.2.evidence.end  span [4, 91) overruns...`
 */

import type { z } from "zod";

/** Render a zod issue path as `loops.2.evidence.end`, or `(root)` if empty. */
export function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path.map(String).join(".");
}

/** One `path: message` line per issue, in source order. */
export function formatIssues(error: z.ZodError, indent = ""): string[] {
  return error.issues.map((issue) => `${indent}${formatPath(issue.path)}: ${issue.message}`);
}
