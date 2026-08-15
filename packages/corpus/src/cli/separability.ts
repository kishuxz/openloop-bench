/**
 * separability — print the leakage diagnostic.
 *
 * Exits zero whatever the score says. It exits non-zero only when it cannot
 * honestly produce a number: a corpus that does not validate, or too few
 * threads to cross-validate. See `src/separability.ts` for why the score
 * itself does not gate.
 */

import { formatReport, separabilityReport } from "../separability.js";

function main(): void {
  console.log("openloop-bench separability — diagnostic, not a gate");
  console.log("");
  for (const line of formatReport(separabilityReport())) console.log(line);
  console.log("");
}

main();
