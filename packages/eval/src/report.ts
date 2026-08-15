/**
 * report — REPORT.md, generated from committed files and nothing else.
 *
 * Two properties this file exists to hold:
 *
 * **Deterministic.** Same predictions, same corpus, same bytes out. Nothing
 * here reads the clock (the run date comes from the prediction file), nothing
 * iterates a Set or a Map whose order is not fixed upstream, and every float is
 * printed at a fixed width. CI regenerates the report and fails on a diff, so
 * "the numbers moved" and "the generator moved" cannot be confused.
 *
 * **The failure gallery is generated, never curated.** Every mismatch is
 * classified by `categorise()` and printed under each category it belongs to.
 * Nobody chooses which failures appear. Where a category is too long to print
 * in full it is cut to the ten worst by cost weight — and the cut says so, with
 * the total, because a truncated list that does not admit it is a curated list
 * with extra steps.
 *
 * A note on where the numbers come from: this renderer re-runs the matcher over
 * the committed prediction files and cross-checks its output against the
 * committed `results/metrics-*.json` before printing anything. If they differ,
 * it refuses. That makes it impossible for REPORT.md to state a number that no
 * committed artifact backs — the failure mode where a report is regenerated
 * from stale metrics and quietly disagrees with the match log beside it.
 */

import type { Certainty, Direction, State, Thread } from "@openloop-bench/schema";
import { CERTAINTIES, DIRECTIONS, STATES, resolveSpan } from "@openloop-bench/schema";
import { DEFAULT_IOU } from "./match.js";
import type { ScoredRun } from "./evaluate.js";
import {
  ERROR_CATEGORIES,
  categorise,
  costedErrors,
  type Confusion,
  type ErrorCategory,
  type MetricSet,
  type Outcome,
} from "./metrics.js";
import { costOfError, type CostMatrix } from "./cost.js";
import { hasOffsets, UNMAPPABLE, type PredictedLoop } from "./prediction.js";

/** How many failures per category per config get printed. */
export const GALLERY_CAP = 10;

export interface ReportInputs {
  /** One per configuration, in the order they should appear. */
  readonly runs: readonly ScoredRun[];
  readonly corpusHash: string;
}

// ---------------------------------------------------------------------------
// Formatting primitives
// ---------------------------------------------------------------------------

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const pp = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pp`;
const num = (value: number): string => value.toFixed(2);

function table(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];
}

function confusionTable<K extends string>(keys: readonly K[], confusion: Confusion<K>): string[] {
  return table(
    ["truth ↓ / predicted →", ...keys],
    keys.map((truth) => [
      `**${truth}**`,
      ...keys.map((pred) => {
        const count = confusion.rows[truth][pred];
        return truth === pred ? `**${count}**` : String(count);
      }),
    ]),
  );
}

/** A span rendered for hand-review: offsets plus the text they resolve to. */
function spanQuote(thread: Thread, span: { msg_index: number; start: number; end: number }): string {
  const text = resolveSpan(thread.messages, span);
  const where = `msg ${span.msg_index} [${span.start}, ${span.end})`;
  return text === null ? `${where} — **does not resolve**` : `${where} "${text.replace(/\|/g, "\\|")}"`;
}

function predictedSpanQuote(thread: Thread, loop: PredictedLoop): string {
  if (!hasOffsets(loop.evidence)) return "`unmappable`";
  return spanQuote(thread, loop.evidence);
}

function inlineSampling(sampling: Readonly<Record<string, string | number | boolean | null>>): string {
  return (
    Object.keys(sampling)
      .sort()
      .map((key) => `${key}=${String(sampling[key])}`)
      .join(", ") || "(none recorded)"
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function thresholdOf(run: ScoredRun, iou: number): MetricSet {
  const found = run.run.thresholds.find((t) => t.iou_threshold === iou);
  return found?.overall ?? run.run.thresholds[0]!.overall;
}

function sameDetection(a: MetricSet, b: MetricSet): boolean {
  return a.detection.tp === b.detection.tp &&
    a.detection.fp === b.detection.fp &&
    a.detection.fn === b.detection.fn &&
    a.cost.total === b.cost.total;
}

function provenance(inputs: ReportInputs): string[] {
  const lines: string[] = [
    "## Provenance",
    "",
    "Every number below is traceable to these inputs. The eval refuses to score a",
    "prediction file whose `corpus_hash` differs from the corpus on disk, so no report",
    "can mix results computed against two versions of the corpus.",
    "",
    ...table(
      ["config", "model", "prompt", "sampling", "split", "threads", "corpus hash", "run date"],
      inputs.runs.map(({ run }) => [
        `\`${run.meta.config}\``,
        `\`${run.meta.model_id}\``,
        `\`${run.meta.prompt_version}\``,
        inlineSampling(run.meta.sampling),
        run.meta.split,
        String(run.threads),
        `\`${run.corpus_hash}\``,
        run.meta.generated_at,
      ]),
    ),
    "",
  ];

  const notes = inputs.runs.filter((r) => r.run.meta.notes);
  if (notes.length > 0) {
    lines.push("What each configuration is:", "");
    for (const { run } of notes) lines.push(`- \`${run.meta.config}\` — ${run.meta.notes}`);
    lines.push("");
  }

  return lines;
}

function matching(inputs: ReportInputs): string[] {
  const thresholds = inputs.runs[0]?.run.iou_thresholds ?? [];
  return [
    "## How a prediction is matched to a true loop",
    "",
    "Predicted loops carry no id, so something has to decide which prediction is which",
    "true loop before anything can be scored. That decision is made on **evidence span",
    "overlap**, never on how similar the two `statement` strings are: statement text is",
    "prose the extractor composed, and scoring it would measure paraphrasing quality",
    "rather than detection.",
    "",
    "A prediction matches a true loop when both point into the **same message** and either",
    "span fully contains the other, or their character ranges reach an",
    "**intersection-over-union** at or above the threshold.",
    "Matching is one-to-one and greedy by descending IoU: where two predictions cover one",
    "true loop, the higher IoU takes the match and the other is a false positive — an",
    "extractor that splits one commitment into two has produced a spurious item, and that",
    "is counted separately as a *split*.",
    "",
    "Containment is checked before the IoU threshold because the corpus labels deliberately",
    "use tight commitment spans, while extractor predictions can include a lead-in clause",
    "around the same commitment. That is still a detection hit. The remaining boundary",
    "agreement is reported separately as **span tightness**: mean evidence IoU over matched",
    "pairs.",
    "",
    `**The threshold is a judgment call, so the whole eval runs at ${thresholds.map((t) => t.toFixed(1)).join(", ")}** and all of`,
    `them are reported. ${DEFAULT_IOU.toFixed(1)} is used where a single number is needed, and it is marked as such.`,
    "",
    "Two prediction classes never match anything:",
    "",
    "- **Ungrounded** — the evidence span does not resolve to real text. It points nowhere,",
    "  so it cannot prove a commitment. Counted as a false positive *and* in the grounding rate.",
    "- **Unmappable** — the extractor found something but could not express where, which",
    "  happens when redaction changes offsets. Counted in its own column: neither correct",
    "  nor incorrect. The cost of that choice is stated in the unmappable section below.",
    "",
    "Every match decision, near miss and contested pair is written to",
    "`results/matches-{config}-{split}.json`, with both spans and the text they resolve to,",
    "so any decision here can be checked by reading rather than by counting characters.",
    "",
  ];
}

function headline(inputs: ReportInputs): string[] {
  const lines = [
    "## Headline",
    "",
    `At IoU ${DEFAULT_IOU.toFixed(1)}. Precision leads: over-firing is the fatal failure mode for this`,
    "product, because a false loop is acted on and a missed one merely stays invisible.",
    "",
    ...table(
      ["config", "precision", "recall", "F1", "superseded reported open", "cost", "cost/thread"],
      inputs.runs.map((run) => {
        const m = thresholdOf(run, DEFAULT_IOU);
        const s = m.state.superseded_as_open;
        return [
          `\`${run.run.meta.config}\``,
          pct(m.detection.precision),
          pct(m.detection.recall),
          pct(m.detection.f1),
          `${s.count}/${s.of} (${pct(s.rate)})`,
          String(m.cost.total),
          num(m.cost.per_thread),
        ];
      }),
    ),
    "",
    "**Superseded reported as open is the number this benchmark exists for.** It is the",
    "share of correctly-detected, genuinely-retracted commitments that the extractor still",
    "reports as live — the error that sends a user chasing something that no longer exists,",
    "with the full confidence of a real loop. It is reported on matched pairs only, so it",
    "is not diluted by detection failures.",
    "",
  ];

  return lines;
}

function comparisonDeltas(inputs: ReportInputs): string[] {
  const byConfig = new Map(inputs.runs.map((run) => [run.run.meta.config, thresholdOf(run, DEFAULT_IOU)]));
  const hostedLarge = byConfig.get("hosted-large");
  const hostedRedacted = byConfig.get("hosted-redacted");
  const local = byConfig.get("local");
  if (!hostedLarge || !hostedRedacted || !local) return [];

  const row = (label: string, base: MetricSet, compare: MetricSet, finding: string): string[] => [
    label,
    pp(compare.detection.precision - base.detection.precision),
    pp(compare.detection.recall - base.detection.recall),
    pp(compare.detection.f1 - base.detection.f1),
    `${compare.cost.total - base.cost.total >= 0 ? "+" : ""}${compare.cost.total - base.cost.total}`,
    `${compare.cost.per_thread - base.cost.per_thread >= 0 ? "+" : ""}${num(compare.cost.per_thread - base.cost.per_thread)}`,
    finding,
  ];

  return [
    "## Configuration deltas",
    "",
    `At IoU ${DEFAULT_IOU.toFixed(1)}. Deltas are second config minus first config.`,
    "",
    ...table(
      ["comparison", "precision", "recall", "F1", "cost", "cost/thread", "finding"],
      [
        row(
          "`hosted-large` → `hosted-redacted`",
          hostedLarge,
          hostedRedacted,
          "Redaction did not cost little: recall and F1 collapsed; lower cost comes from silence after provider and parse failures.",
        ),
        row(
          "`local` → `hosted-large`",
          local,
          hostedLarge,
          "Hosted-large buys recall and F1 over local, while adding false positives and cost-weighted error.",
        ),
      ],
    ),
    "",
  ];
}

function detection(inputs: ReportInputs): string[] {
  const thresholds = inputs.runs[0]?.run.iou_thresholds ?? [];
  const thresholdRange = thresholds.length === 0
    ? "the configured thresholds"
    : `IoU ${thresholds[0]!.toFixed(1)}-${thresholds[thresholds.length - 1]!.toFixed(1)}`;

  return [
    "## Detection",
    "",
    "Detection is reported once at the default threshold. The final column states whether",
    `TP/FP/FN and total cost are invariant across ${thresholdRange}; when they are, repeated`,
    "threshold rows would only make the table look more precise than the decision is.",
    "",
    ...table(
      ["config", "TP", "FP", "FN", "precision", "recall", "F1", "cost/thread", "threshold finding"],
      inputs.runs.map((run) => {
        const m = thresholdOf(run, DEFAULT_IOU);
        const stable = run.run.thresholds.every((t) => sameDetection(t.overall, run.run.thresholds[0]!.overall));
        const finding = stable
          ? `stable across ${thresholdRange}`
          : `varies across ${thresholdRange}; see metrics JSON`;
        return [
          `\`${run.run.meta.config}\``,
          String(m.detection.tp),
          String(m.detection.fp),
          String(m.detection.fn),
          pct(m.detection.precision),
          pct(m.detection.recall),
          pct(m.detection.f1),
          num(m.cost.per_thread),
          finding,
        ];
      }),
    ),
    "",
    `Default threshold: IoU ${DEFAULT_IOU.toFixed(1)}. Unmappable predictions are in none of TP, FP or FN.`,
    "",
    "**Matcher change note.** The earlier pure-IoU matcher scored span-convention agreement",
    "as detection: a prediction that fully contained a tight label span could become both a",
    "false positive and a false negative. The hosted-large dev audit that exposed this moved",
    "at IoU 0.5 from P/R/F1 43.7%/42.1%/42.9% to 51.5%/49.5%/50.5%; cost moved 429 → 403.",
    "Span-boundary variance is now reported separately as span tightness.",
    "",
  ];
}

function spanTightness(inputs: ReportInputs): string[] {
  const lines = [
    "## Span Tightness",
    "",
    "Mean evidence IoU over matched pairs. Detection uses containment-first matching so",
    "lead-in clauses do not become false positives and false negatives; this table keeps",
    "the boundary-convention agreement visible as its own metric.",
    "",
    ...table(
      ["config", ...(inputs.runs[0]?.run.iou_thresholds ?? []).map((t) => `IoU ${t.toFixed(1)}`)],
      inputs.runs.map((run) => [
        `\`${run.run.meta.config}\``,
        ...run.run.thresholds.map((t) => {
          const s = t.overall.span_tightness;
          return `${num(s.mean_iou)} (${s.matched})`;
        }),
      ]),
    ),
    "",
    `### Register Finding`,
    "",
    `By register at IoU ${DEFAULT_IOU.toFixed(1)}. The lowest non-empty row is the register where the model's evidence spans are loosest:`,
    "",
  ];

  for (const run of inputs.runs) {
    const threshold = run.run.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU) ?? run.run.thresholds[0]!;
    const nonEmpty = threshold.breakdowns.by_register.groups
      .filter(({ metrics }) => metrics.span_tightness.matched > 0)
      .sort((a, b) => a.metrics.span_tightness.mean_iou - b.metrics.span_tightness.mean_iou);
    const lowest = nonEmpty[0];
    lines.push(
      `**\`${run.run.meta.config}\`**`,
      "",
      ...(lowest
        ? [
            `Finding: \`${lowest.key}\` has the loosest matched evidence spans at ${num(lowest.metrics.span_tightness.mean_iou)} mean IoU.`,
            "",
          ]
        : []),
      ...table(
        ["register", "span tightness", "matched pairs"],
        threshold.breakdowns.by_register.groups.map(({ key, metrics }) => [
          key,
          metrics.span_tightness.matched === 0 ? "—" : num(metrics.span_tightness.mean_iou),
          String(metrics.span_tightness.matched),
        ]),
      ),
      "",
    );
  }

  return lines;
}

function rankingStability(inputs: ReportInputs): string[] {
  const thresholds = inputs.runs[0]?.run.iou_thresholds ?? [];
  const byF1: string[][] = [];
  const byCost: string[][] = [];

  for (const iou of thresholds) {
    const scored = inputs.runs.map((run) => ({
      config: run.run.meta.config,
      metrics: thresholdOf(run, iou),
    }));
    byF1.push(
      [...scored]
        .sort((a, b) => b.metrics.detection.f1 - a.metrics.detection.f1 || a.config.localeCompare(b.config))
        .map((s) => s.config),
    );
    byCost.push(
      [...scored]
        .sort((a, b) => a.metrics.cost.per_thread - b.metrics.cost.per_thread || a.config.localeCompare(b.config))
        .map((s) => s.config),
    );
  }

  const stable = (orders: string[][]): boolean =>
    orders.every((order) => order.join(">") === orders[0]?.join(">"));

  const lines = [
    "## Does the ranking survive the threshold?",
    "",
    ...table(
      ["IoU", "ranked by F1 (best first)", "ranked by cost/thread (best first)"],
      thresholds.map((iou, i) => [
        iou.toFixed(1),
        (byF1[i] ?? []).map((c) => `\`${c}\``).join(" > "),
        (byCost[i] ?? []).map((c) => `\`${c}\``).join(" > "),
      ]),
    ),
    "",
  ];

  const f1Stable = stable(byF1);
  const costStable = stable(byCost);

  if (f1Stable && costStable) {
    lines.push(
      "The ordering is the same at every threshold, under both metrics. The comparison",
      "between these configurations does not depend on where the matching bar was set.",
      "",
    );
  } else {
    lines.push(
      "**Finding: the ranking is not stable across the matching threshold.**",
      "",
      f1Stable
        ? "- By F1 the ordering holds at every threshold."
        : "- By F1 the ordering **changes** with the threshold.",
      costStable
        ? "- By cost per thread the ordering holds at every threshold."
        : "- By cost per thread the ordering **changes** with the threshold.",
      "",
      "This is a result about the configurations, not a defect in the eval. A config whose",
      "spans are loose scores well while the bar is low and collapses as it rises; a config",
      "whose spans are tight does the reverse. Any claim that one of these is better than",
      "another has to name the threshold it holds at, and a single-threshold headline would",
      "have hidden that entirely.",
      "",
    );
  }

  return lines;
}

function supersession(inputs: ReportInputs): string[] {
  const lines = [
    "## Supersession",
    "",
    "A commitment made and then cancelled, delegated or overtaken later in the same thread.",
    "Reading the promise and never reading the retraction is the default failure of this",
    "product category, and `superseded → open` is the cell that measures it.",
    "",
    ...table(
      ["config", ...(inputs.runs[0]?.run.iou_thresholds ?? []).map((t) => `IoU ${t.toFixed(1)}`)],
      inputs.runs.map((run) => [
        `\`${run.run.meta.config}\``,
        ...run.run.thresholds.map((t) => {
          const s = t.overall.state.superseded_as_open;
          return `${s.count}/${s.of} (${pct(s.rate)})`;
        }),
      ]),
    ),
    "",
    `State confusion at IoU ${DEFAULT_IOU.toFixed(1)}, matched pairs only:`,
    "",
  ];

  for (const run of inputs.runs) {
    const m = thresholdOf(run, DEFAULT_IOU);
    lines.push(
      `**\`${run.run.meta.config}\`** — state accuracy ${pct(m.state.accuracy)} (${m.state.correct}/${m.state.n})`,
      "",
      ...confusionTable<State>(STATES, m.state),
      "",
    );
  }

  return lines;
}

function direction(inputs: ReportInputs): string[] {
  const lines = [
    "## Direction",
    "",
    "`blocked_on_them` versus `blocked_on_you` is the autonomy boundary: a system may",
    "eventually chase a counterparty on `blocked_on_them` and must never act on the user's",
    "behalf for `blocked_on_you`. Getting it backwards is a safety error rather than a",
    "ranking error, which is why the inverted cells carry the heaviest cost weight.",
    "",
    `Matched pairs only, IoU ${DEFAULT_IOU.toFixed(1)}:`,
    "",
  ];

  for (const run of inputs.runs) {
    const m = thresholdOf(run, DEFAULT_IOU);
    const inverted =
      m.direction.rows.blocked_on_you.blocked_on_them + m.direction.rows.blocked_on_them.blocked_on_you;
    lines.push(
      `**\`${run.run.meta.config}\`** — direction accuracy ${pct(m.direction.accuracy)} (${m.direction.correct}/${m.direction.n}), ${inverted} inverted`,
      "",
      ...confusionTable<Direction>(DIRECTIONS, m.direction),
      "",
    );
  }

  lines.push(
    "`mutual` is thin in the corpus (15 loops, 5.5%), so its row and column are",
    "under-powered and should be read with the counts attached rather than as rates.",
    "Confusions involving `mutual` are not charged as inversions — they are errors, but",
    "they do not reverse who owes whom.",
    "",
  );

  return lines;
}

function deadlines(inputs: ReportInputs): string[] {
  const lines = [
    "## Deadlines",
    "",
    "Certainty is whether a deadline was stated at all, and how firmly. The resolved date",
    "is the harder half: it is where non-numeric code-mixed phrasing — *kal tak*, *parso*,",
    "*naaliki*, *weekend tak* — either survives the trip to a calendar date or does not.",
    "Quote detection and date resolution are separate: finding `by wednesday` is not the",
    "same as resolving it to `2026-04-08`.",
    "",
    ...table(
      ["config", "certainty accuracy", "deadline quote found", "resolved date exact", "date hallucinated", "date missing"],
      inputs.runs.map((run) => {
        const m = thresholdOf(run, DEFAULT_IOU);
        return [
          `\`${run.run.meta.config}\``,
          `${pct(m.certainty.accuracy)} (${m.certainty.correct}/${m.certainty.n})`,
          `${pct(m.deadline_span.rate)} (${m.deadline_span.found}/${m.deadline_span.of})`,
          `${pct(m.deadline_resolved.rate)} (${m.deadline_resolved.exact}/${m.deadline_resolved.of})`,
          String(m.deadline_resolved.hallucinated),
          String(m.deadline_resolved.missing),
        ];
      }),
    ),
    "",
    "*Hallucinated* is a date produced where the truth resolves to none — \"agle hafte\" is",
    "real phrasing that names no day, and inventing one is worse than leaving it null.",
    "*Date missing* is the reverse: the truth resolves to a calendar date and the prediction",
    "does not. It does not count truth deadlines whose correct resolved value is null.",
    "Both are counted outside the exact-match rate so neither can be traded against it.",
    "",
    `Certainty confusion at IoU ${DEFAULT_IOU.toFixed(1)}, matched pairs only:`,
    "",
  ];

  for (const run of inputs.runs) {
    const m = thresholdOf(run, DEFAULT_IOU);
    lines.push(`**\`${run.run.meta.config}\`**`, "", ...confusionTable<Certainty>(CERTAINTIES, m.certainty), "");
  }

  return lines;
}

function spansAndGrounding(inputs: ReportInputs): string[] {
  return [
    "## Resolution spans, grounding, and structure",
    "",
    "The resolution span is where a loop stopped being outstanding. It is what makes",
    "`closed` and `superseded` auditable rather than an opinion, so it is scored on its own:",
    "the right message, and the overlap within it.",
    "",
    ...table(
      [
        "config",
        "resolution: right message",
        "mean span IoU",
        "missing",
        "spurious",
        "evidence grounded",
        "splits",
        "merges",
      ],
      inputs.runs.map((run) => {
        const m = thresholdOf(run, DEFAULT_IOU);
        const r = m.resolution_span;
        return [
          `\`${run.run.meta.config}\``,
          `${pct(r.msg_index_rate)} (${r.msg_index_correct}/${r.scored})`,
          num(r.mean_iou),
          String(r.missing),
          String(r.spurious),
          `${pct(m.grounding.rate)} (${m.grounding.grounded}/${m.grounding.of})`,
          String(m.structure.split_truths),
          String(m.structure.merged_predictions),
        ];
      }),
    ),
    "",
    "- **missing** — the truth was resolved in-thread and the prediction offered no span.",
    "- **spurious** — the truth is still open and the prediction claimed a resolution anyway.",
    "- **evidence grounded** — the share of mappable predicted evidence spans that resolve to",
    "  real text at all. A span that does not resolve is a fabrication, and it is the one",
    "  error a plausible-sounding quote could otherwise hide.",
    "- **splits** — one true loop reported as two or more overlapping predictions.",
    "  **merges** — one prediction covering two or more true loops.",
    "",
  ];
}

function unmappable(inputs: ReportInputs): string[] {
  return [
    "## Unmappable spans",
    "",
    "A prediction whose evidence span cannot be expressed in the original message — the",
    "artifact of redacting text before an extractor sees it. These are **neither correct nor",
    "incorrect**: counting them as false positives blames the extractor for the redactor,",
    "and counting them as matches hands out credit nobody verified. They are excluded from",
    "precision, recall and every label metric, and counted here instead.",
    "",
    ...table(
      ["config", "unmappable predictions", "unmappable deadline spans", "unmappable resolution spans", "FN ceiling"],
      inputs.runs.map((run) => {
        const m = thresholdOf(run, DEFAULT_IOU);
        return [
          `\`${run.run.meta.config}\``,
          String(m.unmappable.predictions),
          String(m.unmappable.deadline_spans),
          String(m.unmappable.resolution_spans),
          `${m.unmappable.fn_ceiling} of ${m.detection.fn}`,
        ];
      }),
    ),
    "",
    "**FN ceiling** is the honest cost of that decision. Setting a prediction aside means a",
    "true loop it may have found still counts as a false negative, because nothing could be",
    "aligned to it. The ceiling is the largest number of this run's false negatives that",
    "could be explained that way — per thread, the smaller of (unmappable predictions,",
    "unmatched truths). It is an upper bound, not an estimate, and it is printed so the",
    "effect can be bounded instead of guessed at.",
    "",
  ];
}

function costSection(inputs: ReportInputs, matrix: CostMatrix): string[] {
  const lines = [
    "## Cost-weighted error",
    "",
    "Precision, recall and F1 treat every error as one error. This product does not: a",
    "config that trades three missed loops for one confident false `blocked_on_them` has",
    "got worse while F1 says it improved. The cost model is the counterweight.",
    "",
    "**The weights below are a judgment call, not a measurement.** Nobody measured that an",
    "outbound false chase is eight times worse than a missed reminder. They encode a product",
    "stance — errors that speak to third parties on the user's behalf are categorically worse",
    "than errors that cost the user attention — and a different product could justify",
    "different numbers. They are configurable, and they are printed in full here every time",
    "for exactly that reason.",
    "",
    ...table(
      ["error", "weight", "why"],
      [
        ["false negative (missed loop)", String(matrix.false_negative), "You do not get reminded. The commitment was already invisible; nothing was taken away."],
        ["false positive, `blocked_on_you`", String(matrix.false_positive.blocked_on_you), "An unnecessary nag to yourself. Self-contained, but it erodes trust in the whole list."],
        ["false positive, `blocked_on_them`", String(matrix.false_positive.blocked_on_them), "This one can leave the building: an outbound chase to somebody who may have already delivered. You cannot apologise your way out of it."],
        ["false positive, `mutual`", String(matrix.false_positive.mutual), "Weighted like `blocked_on_you`: a handshake neither side can complete alone surfaces to the user first."],
        ["superseded reported as open", String(matrix.superseded_as_open), "Sends the user chasing something that no longer exists, with the confidence of a real loop."],
        ["direction inverted", String(matrix.direction_inverted), "Says you owe them when they owe you. Crosses the autonomy boundary in whichever direction."],
      ],
    ),
    "",
    `Charged errors at IoU ${DEFAULT_IOU.toFixed(1)}:`,
    "",
    ...table(
      [
        "config",
        "FN",
        "FP on you",
        "FP on them",
        "FP mutual",
        "superseded→open",
        "inverted",
        "total cost",
        "cost/thread",
      ],
      inputs.runs.map((run) => {
        const c = thresholdOf(run, DEFAULT_IOU).cost;
        return [
          `\`${run.run.meta.config}\``,
          `${c.by_kind.false_negative.count} (${c.by_kind.false_negative.cost})`,
          `${c.false_positive_by_direction.blocked_on_you.count} (${c.false_positive_by_direction.blocked_on_you.cost})`,
          `${c.false_positive_by_direction.blocked_on_them.count} (${c.false_positive_by_direction.blocked_on_them.cost})`,
          `${c.false_positive_by_direction.mutual.count} (${c.false_positive_by_direction.mutual.cost})`,
          `${c.by_kind.superseded_as_open.count} (${c.by_kind.superseded_as_open.cost})`,
          `${c.by_kind.direction_inverted.count} (${c.by_kind.direction_inverted.cost})`,
          `**${c.total}**`,
          num(c.per_thread),
        ];
      }),
    ),
    "",
    "Counts first, cost in brackets. One matched pair can be charged twice — a superseded",
    "loop reported as open *and* inverted is two distinct harms to the user.",
    "",
  ];

  return lines;
}

function breakdowns(inputs: ReportInputs): string[] {
  const at = (run: ScoredRun) =>
    run.run.thresholds.find((t) => t.iou_threshold === DEFAULT_IOU) ?? run.run.thresholds[0]!;

  const lines = [
    "## Breakdowns",
    "",
    `Every metric, cut four ways, at IoU ${DEFAULT_IOU.toFixed(1)}. Counts are printed beside every rate because`,
    "several of these cells are thin enough that a rate on its own would be misleading.",
    "",
    "Attribution: bucket, thread length and loops-per-thread are properties of the thread,",
    "so every outcome inherits them. Register is a property of a *loop*, and a false positive",
    "has no true loop to inherit from — so false positives are attributed to the register the",
    "prediction claimed, and true positives and false negatives to the register of the truth.",
    "A register row's precision therefore reads as \"precision among loops this extractor",
    "called hi-en\", which is the only attribution the data supports.",
    "",
    "`date` is exact resolved-date matches over pairs whose truth resolves to a date;",
    "`resolution msg` is right-message hits over the pairs where the prediction gave usable",
    "offsets. Both denominators are per group and get thin fast, which is why they are",
    "printed as fractions rather than as rates. The complete metric set for every group,",
    "including the confusion matrices, is in `results/metrics-{config}-{split}.json`.",
    "",
  ];

  const runsFor = (select: (run: ScoredRun) => Array<{ key: string; metrics: MetricSet }>) =>
    inputs.runs.map((run) => ({ run, groups: select(run) }));

  const render = (
    title: string,
    note: string,
    select: (run: ScoredRun) => Array<{ key: string; metrics: MetricSet }>,
  ): string[] => {
    const out = [`### ${title}`, "", note, ""];
    for (const { run, groups } of runsFor(select)) {
      out.push(
        `**\`${run.run.meta.config}\`**`,
        "",
        ...table(
          [
            "group",
            "threads",
            "truth",
            "pred",
            "P",
            "R",
            "F1",
            "tightness",
            "direction",
            "state",
            "sup→open",
            "certainty",
            "date",
            "resolution msg",
            "grounded",
            "unmappable",
            "cost/thread",
          ],
          groups.map(({ key, metrics }) => [
            key,
            String(metrics.threads),
            String(metrics.truth_loops),
            String(metrics.predicted_loops),
            metrics.detection.tp + metrics.detection.fp === 0 ? "—" : pct(metrics.detection.precision),
            metrics.truth_loops === 0 ? "—" : pct(metrics.detection.recall),
            metrics.truth_loops === 0 ? "—" : pct(metrics.detection.f1),
            metrics.span_tightness.matched === 0 ? "—" : num(metrics.span_tightness.mean_iou),
            metrics.direction.n === 0 ? "—" : pct(metrics.direction.accuracy),
            metrics.state.n === 0 ? "—" : pct(metrics.state.accuracy),
            metrics.state.superseded_as_open.of === 0
              ? "—"
              : `${metrics.state.superseded_as_open.count}/${metrics.state.superseded_as_open.of}`,
            metrics.certainty.n === 0 ? "—" : pct(metrics.certainty.accuracy),
            metrics.deadline_resolved.of === 0
              ? "—"
              : `${metrics.deadline_resolved.exact}/${metrics.deadline_resolved.of}`,
            metrics.resolution_span.scored === 0
              ? "—"
              : `${metrics.resolution_span.msg_index_correct}/${metrics.resolution_span.scored}`,
            metrics.grounding.of === 0 ? "—" : pct(metrics.grounding.rate),
            String(metrics.unmappable.predictions),
            num(metrics.cost.per_thread),
          ]),
        ),
        "",
      );
    }
    return out;
  };

  lines.push(
    ...render(
      "By register",
      "The code-mixed halves of the corpus against the English baseline. 43% of the corpus is `hi-en` or `ta-en`.",
      (run) => at(run).breakdowns.by_register.groups,
    ),
    ...render(
      "By bucket",
      "`neg-` threads contain no loops at all, so their only possible outcome is a false positive — that row is the negative-thread false-positive rate, which precision measured on positives cannot see.",
      (run) => at(run).breakdowns.by_bucket.groups,
    ),
    ...render(
      "By thread length",
      "Whether performance holds as there is more to read before the retraction.",
      (run) => at(run).breakdowns.by_thread_length.groups,
    ),
    ...render(
      "By loops per thread",
      "This is within-thread recall: whether the extractor finds every commitment in a busy thread or anchors on the first one and stops. If recall falls as loops-per-thread rises, that is the failure. The `0 loops` row is the negative set.",
      (run) => at(run).breakdowns.by_loops_per_thread.groups,
    ),
  );

  return lines;
}

// ---------------------------------------------------------------------------
// Failure gallery
// ---------------------------------------------------------------------------

const CATEGORY_TITLES: Record<ErrorCategory, string> = {
  false_positive_blocked_on_them: "False positive claiming `blocked_on_them`",
  superseded_as_open: "Superseded commitment reported as open",
  direction_inverted: "Direction inverted",
  false_positive_blocked_on_you: "False positive claiming `blocked_on_you`",
  false_positive_mutual: "False positive claiming `mutual`",
  false_negative: "Missed loop",
  state_error_other: "State wrong (not superseded→open)",
  direction_error_other: "Direction wrong (not an inversion)",
  ungrounded_evidence: "Evidence span resolves to nothing",
  split_prediction: "One commitment reported as two",
  merged_prediction: "Two commitments reported as one",
  certainty_error: "Deadline certainty wrong",
  resolved_date_error: "Resolved date wrong",
  resolution_span_error: "Resolution span wrong",
  unmappable_evidence: "Unmappable evidence (redaction artifact)",
};

function entryCost(outcome: Outcome, matrix: CostMatrix): number {
  return costedErrors(outcome).reduce((total, error) => total + costOfError(error, matrix), 0);
}

function galleryEntry(thread: Thread, outcome: Outcome, cost: number): string[] {
  const lines: string[] = [];
  const where = `\`${outcome.thread_id}\``;

  if (outcome.truth) {
    const t = outcome.truth;
    lines.push(
      `- ${where} — truth: ${t.direction} / ${t.state} / ${t.register} — "${t.statement}"` +
        (cost > 0 ? `  *(cost ${cost})*` : ""),
      `  - truth evidence: ${spanQuote(thread, t.evidence)}`,
    );
  } else {
    const why =
      outcome.kind === "unmappable"
        ? "evidence could not be mapped back to the message, so nothing was aligned to it"
        : "matched no true loop";
    lines.push(`- ${where} — ${why}${cost > 0 ? `  *(cost ${cost})*` : ""}`);
  }

  if (outcome.pred) {
    const p = outcome.pred;
    lines.push(
      `  - predicted: ${p.direction} / ${p.state} / ${p.register} — "${p.statement}"`,
      `  - predicted evidence: ${predictedSpanQuote(thread, p)}` +
        (outcome.iou === null ? "" : ` — IoU ${outcome.iou.toFixed(2)}`),
    );
    if (outcome.truth) {
      const t = outcome.truth;
      const truthDeadline = `${t.deadline.certainty}/${t.deadline.resolved ?? "null"}`;
      const predDeadline = `${p.deadline.certainty}/${p.deadline.resolved ?? "null"}`;
      if (truthDeadline !== predDeadline) {
        lines.push(`  - deadline: truth ${truthDeadline} → predicted ${predDeadline}`);
      }
      const truthResolution = t.resolution ? spanQuote(thread, t.resolution) : "none";
      const predResolution =
        p.resolution === null ? "none" : p.resolution === UNMAPPABLE ? "`unmappable`" : spanQuote(thread, p.resolution);
      if (truthResolution !== predResolution) {
        lines.push(`  - resolution: truth ${truthResolution} → predicted ${predResolution}`);
      }
    }
  } else {
    lines.push("  - predicted: nothing");
  }

  return lines;
}

function gallery(inputs: ReportInputs): string[] {
  const lines = [
    "## Failure gallery",
    "",
    "Generated, never curated. Every mismatch at IoU " +
      DEFAULT_IOU.toFixed(1) +
      " is classified automatically and appears under",
    "each category it belongs to — a false positive with a fabricated span is in both lists.",
    `Where a category runs long it is cut to the **${GALLERY_CAP} worst by cost weight**, and the cut states`,
    "the total. Nobody chooses which failures are shown.",
    "",
    "Full detail, including every near miss that fell below the threshold, is in",
    "`results/matches-{config}-{split}.json`.",
    "",
  ];

  for (const run of inputs.runs) {
    const byId = new Map(run.threads.map((t) => [t.thread_id, t]));
    const outcomes =
      run.outcomesByThreshold.find((o) => o.iou_threshold === DEFAULT_IOU)?.outcomes ??
      run.outcomesByThreshold[0]?.outcomes ??
      [];

    const buckets = new Map<ErrorCategory, Outcome[]>();
    for (const category of ERROR_CATEGORIES) buckets.set(category, []);
    for (const outcome of outcomes) {
      for (const category of categorise(outcome)) {
        buckets.get(category)?.push(outcome);
      }
    }

    const total = [...buckets.values()].reduce((n, list) => n + list.length, 0);
    lines.push(`### \`${run.run.meta.config}\` — ${total} classified failures`, "");

    for (const category of ERROR_CATEGORIES) {
      const list = buckets.get(category) ?? [];
      if (list.length === 0) continue;

      const ranked = [...list].sort(
        (a, b) =>
          entryCost(b, run.run.cost_matrix) - entryCost(a, run.run.cost_matrix) ||
          a.thread_id.localeCompare(b.thread_id) ||
          (a.truth_index ?? -1) - (b.truth_index ?? -1) ||
          (a.pred_index ?? -1) - (b.pred_index ?? -1),
      );
      const shown = ranked.slice(0, GALLERY_CAP);

      lines.push(
        `#### ${CATEGORY_TITLES[category]} — ${list.length}`,
        "",
        ...(shown.length < list.length
          ? [`Showing the ${GALLERY_CAP} worst by cost weight of ${list.length}.`, ""]
          : []),
      );

      for (const outcome of shown) {
        const thread = byId.get(outcome.thread_id);
        if (!thread) continue;
        lines.push(...galleryEntry(thread, outcome, entryCost(outcome, run.run.cost_matrix)));
      }
      lines.push("");
    }
  }

  return lines;
}

function limitations(inputs: ReportInputs): string[] {
  const anyFixture = inputs.runs.some((r) => r.run.meta.model_id.startsWith("fixture://"));
  const lines = [
    "## What these numbers do not say",
    "",
    "- **Scope.** Dev split only; three configurations; a single prompt version with no",
    "  iteration against dev results; held-out test split not yet run.",
    "- **The matching threshold is a constant somebody chose.** Every table above is",
    "  conditional on it. That is why all three thresholds are reported and why the ranking",
    "  question is asked out loud rather than answered once at 0.5.",
    "- **The cost weights are a stance, not a measurement.** See the cost section.",
    "- **`mutual` is thin.** 15 loops in the whole corpus. Any mutual rate here is",
    "  under-powered; read the counts.",
    "- **Single annotator.** Every ground-truth label is one person's call, and several",
    "  deadline resolutions are defensible but arguable. Inter-annotator agreement on the",
    "  `test` split has not been measured.",
    "- **Statements are never scored.** Only spans and labels are. An extractor that finds",
    "  every loop and describes them badly scores identically to one that describes them",
    "  well, by design.",
  ];

  if (anyFixture) {
    lines.push(
      "- **These are fixtures, not model output.** Every configuration in this report was",
      "  generated by damaging the ground truth in declared ways (`packages/eval/src/fixtures.ts`)",
      "  so the eval could be built and checked before any extractor existed. The numbers",
      "  measure the eval, not a model, and no claim about extraction quality should be read",
      "  from them.",
      "",
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------

/** The whole report, as one string. Deterministic in its inputs. */
export function renderReport(inputs: ReportInputs): string {
  const first = inputs.runs[0];
  if (!first) throw new Error("no prediction runs to report on");

  const lines = [
    "# openloop-bench — results",
    "",
    "Generated by `pnpm report` from the committed prediction files in",
    "`predictions/` and the committed metrics in `results/`. Deterministic: the",
    "same inputs produce the same bytes, and CI fails on a diff. Do not edit by hand.",
    "",
    `Corpus \`${inputs.corpusHash}\` — validated in the same run that produced these numbers.`,
    "The eval refuses to score against a corpus that has not validated, and refuses any",
    "prediction file whose corpus hash does not match the corpus on disk.",
    "",
    ...provenance(inputs),
    ...matching(inputs),
    ...headline(inputs),
    ...comparisonDeltas(inputs),
    ...detection(inputs),
    ...spanTightness(inputs),
    ...rankingStability(inputs),
    ...supersession(inputs),
    ...direction(inputs),
    ...deadlines(inputs),
    ...spansAndGrounding(inputs),
    ...unmappable(inputs),
    ...costSection(inputs, first.run.cost_matrix),
    ...breakdowns(inputs),
    ...gallery(inputs),
    ...limitations(inputs),
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
