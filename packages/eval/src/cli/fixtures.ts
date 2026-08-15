/**
 * fixtures:gen — regenerate `fixtures/predictions/*.json` from the corpus.
 *
 * The fixtures are derived, not authored (see `src/fixtures.ts`), so this is
 * how they are kept in step with the corpus: edit a thread, run this, and the
 * prediction files carry the new corpus hash and spans that still point at real
 * text. There is deliberately no "restamp the hash" shortcut — the hash gate
 * exists to catch predictions that were computed against different message
 * strings, and a tool that only updates the hash would defeat it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateAll } from "../fixtures.js";
import { loadValidatedCorpus, threadsForSplit } from "../evaluate.js";
import { PREDICTIONS_DIR, writeJson } from "../paths.js";

function main(): void {
  const corpus = loadValidatedCorpus();
  const dev = threadsForSplit(corpus, "dev");

  mkdirSync(PREDICTIONS_DIR, { recursive: true });

  console.log(`openloop-bench fixtures — ${dev.length} dev threads, ${dev.reduce((n, t) => n + t.loops.length, 0)} loops`);
  console.log("");

  for (const { spec, generated } of generateAll(dev)) {
    const path = join(PREDICTIONS_DIR, `${spec.config}.json`);
    writeFileSync(path, writeJson(generated.file));

    const injected = generated.injected;
    console.log(`  ${spec.config.padEnd(16)} ${injected.predictions} predictions`);
    console.log(
      `  ${" ".repeat(16)} injected: ${Object.entries(injected)
        .filter(([key, value]) => key !== "predictions" && value > 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("  ")}`,
    );
    console.log("");
  }

  console.log(`Written to ${PREDICTIONS_DIR}`);
}

main();
