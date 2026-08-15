/**
 * stats — what the corpus is actually made of.
 *
 * Every breakdown is reported per split as well as overall, because the split
 * is only meaningful if both halves contain the same kinds of thread. A `test`
 * split holding all the negatives and a `dev` split holding none would produce
 * two numbers that cannot be compared, and nothing in the schema would notice.
 *
 * `--check` turns the same composition into assertions and exits non-zero:
 * no bucket empty in either split, bucket counts matching their specified
 * targets, and the dev share staying near the intended 40%.
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

function main(): void {
  const threads = loadCorpusOrThrow();
  const check = process.argv.includes("--check");

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
    console.log(`FAIL — ${failures.length} composition problem(s)`);
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
