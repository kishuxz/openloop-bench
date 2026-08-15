/**
 * validate — the gate on every corpus edit.
 *
 * Four checks, reported as separate classes because they fail for different
 * reasons and get fixed in different ways:
 *
 *   1. Schema. Shape, enums, per-loop consistency.
 *   2. Grounding. Every span — evidence, resolution, deadline — re-resolved
 *      against the message it references. `ThreadSchema` already enforces this;
 *      doing it again here, through the same `resolveSpan` the eval package
 *      will use, means the guarantee is asserted by the tool a human runs and
 *      not only by a refinement they have to trust.
 *   3. Filesystem. `thread_id` equals the filename; the bucket prefix is known.
 *   4. Corpus. Thread ids unique across all files.
 *
 * Output is one `path: message` line per problem, grouped by file, so it greps
 * and diffs. Exits non-zero on any failure. This output is a user interface.
 */

import { CorpusSchema, formatIssues, resolveSpan, type Loop, type Thread } from "@openloop-bench/schema";
import { bucketOf, BUCKET_PREFIXES } from "../buckets.js";
import { filenameMismatch, loadThreads, THREADS_DIR } from "../load.js";

/** Every span a loop carries, labelled for error messages. */
function spansOf(loop: Loop): Array<{ label: string; span: { msg_index: number; start: number; end: number } }> {
  const spans = [{ label: "evidence", span: loop.evidence }];
  if (loop.resolution) spans.push({ label: "resolution", span: loop.resolution });
  if (loop.deadline.span) spans.push({ label: "deadline.span", span: loop.deadline.span });
  return spans;
}

/** Re-resolve every span independently of the schema refinement. */
function groundingProblems(thread: Thread): string[] {
  const problems: string[] = [];
  thread.loops.forEach((loop, i) => {
    for (const { label, span } of spansOf(loop)) {
      const text = resolveSpan(thread.messages, span);
      if (text === null) {
        problems.push(
          `loops.${i}.${label}: span [${span.start}, ${span.end}) in message ${span.msg_index} does not resolve to text`,
        );
      }
    }
  });
  return problems;
}

function main(): void {
  const { loaded, failures } = loadThreads();

  const report = new Map<string, string[]>();
  const add = (file: string, problems: string[]): void => {
    if (problems.length === 0) return;
    report.set(file, [...(report.get(file) ?? []), ...problems]);
  };

  for (const failure of failures) add(failure.file, failure.problems);

  let spanCount = 0;

  for (const { file, thread } of loaded) {
    const problems: string[] = [];

    const mismatch = filenameMismatch(file, thread);
    if (mismatch) problems.push(mismatch);

    if (bucketOf(thread.thread_id) === null) {
      problems.push(
        `(file): thread_id "${thread.thread_id}" has no known bucket prefix (expected one of ${BUCKET_PREFIXES.join(", ")})`,
      );
    }

    problems.push(...groundingProblems(thread));
    for (const loop of thread.loops) spanCount += spansOf(loop).length;

    add(file, problems);
  }

  // Corpus-level: ids unique across files.
  const corpus = CorpusSchema.safeParse(loaded.map((l) => l.thread));
  if (!corpus.success) add("(corpus)", formatIssues(corpus.error));

  const loopCount = loaded.reduce((n, l) => n + l.thread.loops.length, 0);

  console.log(`openloop-bench validate — ${THREADS_DIR}`);
  console.log("");

  if (report.size === 0) {
    console.log(`  ${loaded.length} threads, ${loopCount} loops, ${spanCount} spans — all resolve.`);
    console.log("");
    console.log("PASS");
    return;
  }

  for (const [file, problems] of [...report].sort()) {
    console.log(`FAIL  ${file}`);
    for (const problem of problems) console.log(`        ${problem}`);
    console.log("");
  }

  const total = [...report.values()].reduce((n, p) => n + p.length, 0);
  console.log(`FAIL — ${total} problem(s) across ${report.size} file(s); ${loaded.length} thread(s) parsed cleanly`);
  process.exitCode = 1;
}

main();
