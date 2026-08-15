/**
 * stats: what the corpus is actually made of.
 *
 * Every breakdown is reported per split as well as overall, because the split
 * is only meaningful if both halves contain the same kinds of thread. A `test`
 * split holding all the negatives and a `dev` split holding none would produce
 * two numbers that cannot be compared, and nothing in the schema would notice.
 *
 * `--check` turns the same composition into assertions and exits non-zero:
 * no bucket empty in either split, bucket counts matching their specified
 * targets, and the dev share staying near the intended 40%.
 *
 * `--by-batch` reports each authoring batch separately and flags any dimension
 * that moved more than 15 points against the previous batch. Cumulative totals
 * cannot show this: a batch labelled to a different standard is averaged into
 * 200 threads and disappears. The certainty distribution moved 42 points
 * between Phase 1 and batch 1 and two consecutive audits missed it, because
 * both compared rule interpretation thread by thread and neither compared
 * distributions.
 */

import type { Thread } from "@openloop-bench/schema";
import { CHANNELS, DIRECTIONS, REGISTERS, STATES, CERTAINTIES } from "@openloop-bench/schema";
import { BUCKETS, bucketOf } from "../buckets.js";
import { checkComposition } from "../composition.js";
import { loadCorpusOrThrow } from "../load.js";

/** Count of `key` over all threads, dev threads and test threads. */
interface Row {
  label: string;
  all: number;
  dev: number;
  test: number;
}

function tally<T>(
  threads: Thread[],
  keys: readonly string[],
  pluck: (thread: Thread) => T[],
  label: (item: T) => string,
): Row[] {
  const counts = new Map<string, { all: number; dev: number; test: number }>();
  for (const key of keys) counts.set(key, { all: 0, dev: 0, test: 0 });

  for (const thread of threads) {
    for (const item of pluck(thread)) {
      const key = label(item);
      const row = counts.get(key) ?? { all: 0, dev: 0, test: 0 };
      row.all += 1;
      row[thread.split] += 1;
      counts.set(key, row);
    }
  }

  return [...counts].map(([label_, c]) => ({ label: label_, ...c }));
}

function table(title: string, rows: Row[], extra?: { header: string; value: (row: Row) => string }): void {
  const width = Math.max(title.length, ...rows.map((r) => r.label.length));
  const head = `${title.toUpperCase().padEnd(width)}   all   dev  test${extra ? `   ${extra.header}` : ""}`;
  console.log(head);
  console.log("-".repeat(head.length));
  for (const row of rows) {
    const base = `${row.label.padEnd(width)} ${String(row.all).padStart(5)} ${String(row.dev).padStart(5)} ${String(row.test).padStart(5)}`;
    console.log(extra ? `${base} ${extra.value(row).padStart(String(extra.header).length + 2)}` : base);
  }
  console.log("");
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;
}

function ratio(part: number, whole: number): string {
  return whole === 0 ? "n/a" : (part / whole).toFixed(2);
}

function bucketRows(threads: Thread[]): Row[] {
  return BUCKETS.map((bucket) => {
    const inBucket = threads.filter((t) => bucketOf(t.thread_id) === bucket.prefix);
    return {
      label: `${bucket.prefix.padEnd(4)}${bucket.label}`,
      all: inBucket.length,
      dev: inBucket.filter((t) => t.split === "dev").length,
      test: inBucket.filter((t) => t.split === "test").length,
    };
  });
}

/** Percentage-point shift that counts as drift worth diagnosing. */
const DRIFT_THRESHOLD = 15;

/** Per-batch shares of one dimension, with the batch-over-batch delta flagged. */
function byBatch(threads: Thread[]): void {
  const batches = [...new Set(threads.map((t) => t.batch))].sort((a, b) => a - b);

  const dimensions: Array<[string, readonly string[], (t: Thread) => string[]]> = [
    ["certainty", CERTAINTIES, (t) => t.loops.map((l) => l.deadline.certainty)],
    ["state", STATES, (t) => t.loops.map((l) => l.state)],
    ["direction", DIRECTIONS, (t) => t.loops.map((l) => l.direction)],
    ["register", REGISTERS, (t) => t.loops.map((l) => l.register)],
  ];

  console.log("openloop-bench stats --by-batch");
  console.log("");
  console.log("  batch   threads   loops");
  for (const b of batches) {
    const inBatch = threads.filter((t) => t.batch === b);
    const loops = inBatch.reduce((n, t) => n + t.loops.length, 0);
    console.log(`  ${String(b).padEnd(7)} ${String(inBatch.length).padStart(7)} ${String(loops).padStart(7)}`);
  }
  console.log("");

  const flags: string[] = [];

  for (const [name, keys, pluck] of dimensions) {
    const header = `${name.toUpperCase().padEnd(12)}` + batches.map((b) => `batch ${b}`.padStart(10)).join("");
    console.log(header);
    console.log("-".repeat(header.length));

    const shares = new Map<string, number[]>();
    for (const key of keys) {
      const row = batches.map((b) => {
        const values = threads.filter((t) => t.batch === b).flatMap(pluck);
        return values.length === 0 ? 0 : (values.filter((v) => v === key).length / values.length) * 100;
      });
      shares.set(key, row);
      if (row.some((v) => v > 0)) {
        console.log(key.padEnd(12) + row.map((v) => `${v.toFixed(0)}%`.padStart(10)).join(""));
      }
    }
    console.log("");

    for (const [key, row] of shares) {
      for (let i = 1; i < row.length; i++) {
        const delta = (row[i] ?? 0) - (row[i - 1] ?? 0);
        if (Math.abs(delta) > DRIFT_THRESHOLD) {
          flags.push(
            `${name}=${key}: batch ${batches[i - 1]} -> ${batches[i]} moved ${delta > 0 ? "+" : ""}${delta.toFixed(0)} points`,
          );
        }
      }
    }
  }

  if (flags.length === 0) {
    console.log(`  no dimension moved more than ${DRIFT_THRESHOLD} points between consecutive batches.`);
    return;
  }
  console.log(`  DRIFT: ${flags.length} dimension(s) moved more than ${DRIFT_THRESHOLD} points:`);
  for (const flag of flags) console.log(`    ${flag}`);
  console.log("");
  console.log("  Diagnose each before writing more threads: labeling drift (the same");
  console.log("  judgment made differently) or thread-writing drift (different threads).");
}

function main(): void {
  const threads = loadCorpusOrThrow();
  const check = process.argv.includes("--check");

  if (process.argv.includes("--by-batch")) {
    byBatch(threads);
    return;
  }

  const loops = threads.flatMap((t) => t.loops);
  const zeroLoop = threads.filter((t) => t.loops.length === 0);
  const dev = threads.filter((t) => t.split === "dev").length;
  const test = threads.length - dev;

  if (check) {
    const failures = checkComposition(threads);
    console.log("openloop-bench stats --check");
    console.log("");
    if (failures.length === 0) {
      console.log(`  every bucket present in both splits; ${threads.length} threads, dev share ${pct(dev, threads.length)}.`);
      console.log("");
      console.log("PASS");
      return;
    }
    for (const failure of failures) console.log(`FAIL  ${failure}`);
    console.log("");
    console.log(`FAIL: ${failures.length} composition problem(s)`);
    process.exitCode = 1;
    return;
  }

  // Loop density is reported twice on purpose. A fifth of this corpus is
  // deliberately empty, so the all-threads mean is pulled down by threads that
  // were never meant to contain a loop, and reads as "sparsely labeled" when
  // the labeled threads are not sparse at all. Reporting only the non-empty
  // mean would hide the negatives instead, which is worse. Both, or neither.
  const nonEmpty = threads.length - zeroLoop.length;
  const summary: Array<[string, string]> = [
    ["threads", `${threads.length}`],
    ["loops", `${loops.length}`],
    ["zero-loop threads", `${zeroLoop.length}  (${pct(zeroLoop.length, threads.length)} of threads)`],
    ["dev / test", `${dev} / ${test}  (${pct(dev, threads.length)} / ${pct(test, threads.length)})`],
    ["loops per thread", `${ratio(loops.length, threads.length)}  (all threads)`],
    [
      "loops per non-empty thread",
      `${ratio(loops.length, nonEmpty)}  (excluding the ${zeroLoop.length} zero-loop threads)`,
    ],
  ];

  console.log("openloop-bench corpus stats");
  console.log("");
  for (const [label, value] of summary) console.log(`  ${label.padEnd(28)}${value}`);
  console.log("");

  table("bucket (threads)", bucketRows(threads), {
    header: "target",
    value: (row) => String(BUCKETS.find((b) => row.label.startsWith(b.prefix))?.target ?? "?"),
  });

  table(
    "channel (threads)",
    tally(threads, CHANNELS, (t) => [t.channel], (c) => c),
  );

  table(
    "direction (loops)",
    tally(threads, DIRECTIONS, (t) => t.loops, (l) => l.direction),
  );

  table(
    "state (loops)",
    tally(threads, STATES, (t) => t.loops, (l) => l.state),
  );

  table(
    "register (loops)",
    tally(threads, REGISTERS, (t) => t.loops, (l) => l.register),
  );

  table(
    "deadline certainty (loops)",
    tally(threads, CERTAINTIES, (t) => t.loops, (l) => l.deadline.certainty),
  );

  const resolved = loops.filter((l) => l.deadline.resolved !== null).length;
  const offThread = loops.filter(
    (loop) => !threads.some((t) => t.loops.includes(loop) && t.messages.some((m) => m.sender === loop.counterparty)),
  ).length;

  console.log(`  deadlines resolved to a date   ${resolved}/${loops.length}  (${pct(resolved, loops.length)})`);
  console.log(`  off-thread counterparties      ${offThread}/${loops.length}  (delegation targets who never sent a message)`);
  console.log("");
}

main();
