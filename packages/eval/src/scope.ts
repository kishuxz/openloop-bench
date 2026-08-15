/**
 * scope: the one statement of what the published results cover.
 *
 * This text had three copies once: the report generator, the viewer JSON, and
 * the README. Two of them drifted, and the drift was invisible because nothing
 * compared them. There is now exactly one copy. `report.ts` renders it into
 * REPORT.md, and `apps/web/lib/results.ts` imports it for the three viewer
 * pages, so the site and the report cannot disagree about what was run.
 *
 * The README states it in prose as well. That copy is prose a human maintains,
 * not a rendered string, so it is not imported from here; `report.test.ts`
 * pins the sentences that name configurations, which is the part that goes
 * stale when a run is added.
 *
 * Deliberately plain sentences: no semicolons, no em or en dashes. A scope
 * statement is the part of a results page a skeptical reader goes to first,
 * and semicolon-chained clauses read as hedging.
 *
 * **This is hand-maintained, not derived.** It names `hosted-large` and
 * `local` explicitly. Adding or removing a reported configuration means
 * editing it, and the test named above fails until someone does.
 */

/** One sentence per claim, in the order they should be read. */
export const SCOPE_SENTENCES = [
  "Results cover the dev split only, with two configurations reported: hosted large and local.",
  "A single prompt version was used with no iteration against dev results.",
  "The held out test split has not been run.",
  "The hosted redacted run was attempted and did not complete.",
] as const;

/** The configurations `SCOPE_SENTENCES` claims are reported, for the staleness guard. */
export const SCOPE_REPORTED_CONFIGS = ["hosted-large", "local"] as const;

/** The whole statement as one paragraph. */
export const SCOPE_TEXT: string = SCOPE_SENTENCES.join(" ");
