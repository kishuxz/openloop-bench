# @openloop-bench/eval

Scores extractor output against the corpus, and generates
[`results/REPORT.md`](../../results/REPORT.md).

```bash
pnpm fixtures:gen   # regenerate the fixture prediction files from the corpus
pnpm eval           # score every prediction file → results/metrics-*.json, matches-*.json
pnpm report         # render results/REPORT.md from the committed files
```

**Phase 3 has not landed.** Everything here runs against generated fixtures, not
model output. Integration is a separate step.

## The matcher is the whole design

Predicted loops arrive with no id, so something has to decide which prediction
is which ground-truth loop before a single number can be computed. That decision
is this package's one real design choice, and it is documented at length in
[`src/match.ts`](src/match.ts).

**Matching is on evidence span overlap, never on statement text.** The obvious
alternative — compare the `statement` strings and take the close ones — measures
paraphrasing quality. An extractor that finds every commitment and describes
them tersely would lose to one that writes fluent summaries of commitments
nobody made. Span overlap asks "did you point at the place where this was
promised", which is the thing being measured and is checkable against the text.

| Decision | Choice | Why |
|---|---|---|
| Overlap measure | IoU on `[start, end)` within one message | Plain overlap lets a whole-message span match every loop inside it. IoU punishes too-wide and too-narrow symmetrically. |
| Threshold | 0.5 default; **every run scored at 0.3, 0.5 and 0.7** | It is a judgment call. Reporting all three keeps it one, and lets the report answer whether a ranking survives it. |
| Assignment | One-to-one, greedy by descending IoU | Two predictions over one true loop = one TP and one FP. An extractor that splits a commitment in two has produced a spurious item. |
| Splits and merges | Counted separately | "One loop reported as two" is a distinct error mode from a plain false positive, and so is its mirror. |
| Ungrounded span | Never matches; false positive | A span that resolves to no text points nowhere. It cannot prove a commitment. |
| Unmappable span | Never matches; **not** a false positive | A redaction artifact, not an extractor error. See below. |

Every decision is written to `results/matches-{config}-{split}.json` — matches,
false positives, false negatives, and near misses on both sides of the bar, each
with the text its spans resolve to. That file exists so a disputed match can be
checked by reading rather than by counting characters.

## Unmappable is a third answer

Under PII redaction an extractor reads redacted text, points at a span in it, and
the offsets cannot be carried back to the original message. The prediction format
allows `"unmappable"` in place of any span.

Counting those as false positives blames the extractor for the redactor.
Counting them as matches hands out credit nobody verified. They are counted in
their own column, in no rate at all.

The honest cost of that is that a true loop the extractor may have found still
counts as a false negative, because nothing could be aligned to it. So the report
prints an **FN ceiling**: per thread, the smaller of (unmappable predictions,
unmatched truths), summed. It is an upper bound on how much of the false-negative
count could be a redaction artifact — printed so it can be bounded rather than
silently absorbed.

## Metrics

Detection is precision, recall and F1 over all predictions and all truths.
Precision leads: over-firing is the fatal failure mode, because a false loop gets
acted on and a missed one merely stays invisible.

Everything else — direction, state, certainty, resolved date, resolution span —
is computed **on matched pairs only**. Scoring the direction of a loop the
extractor never found would count the miss twice and make a recall failure look
like a direction failure.

| Metric | Shape | Note |
|---|---|---|
| Direction | accuracy + 3×3 confusion | The autonomy boundary. Inversions are weighted heaviest. |
| State | accuracy + 3×3 confusion | `superseded → open` is reported separately as the headline. |
| Deadline | certainty accuracy + 3×3, resolved-date exact match | Invented dates and missing dates counted apart from the rate. |
| Resolution span | right message, mean IoU | Plus missing, spurious and unmappable. |
| Grounding | share of mappable evidence spans that resolve | Over matched *and* unmatched predictions. |

Breakdowns for all of it, by register, bucket, thread length and loops-per-thread.
The last is within-thread recall: whether an extractor finds every commitment in a
busy thread or anchors on the first one and stops.

## Cost-weighted error

One number, under weights that are printed in the report every time:

| Error | Weight |
|---|---|
| false negative | 1 |
| false positive, `blocked_on_you` | 3 |
| false positive, `blocked_on_them` | 8 |
| superseded reported as open | 8 |
| direction inverted | 8 |

A missed loop costs a reminder. A false `blocked_on_you` costs an unnecessary nag
to yourself. A false `blocked_on_them` would trigger an outbound message to
somebody who may have already delivered — an error you cannot apologise your way
out of. Reporting supersession as open sends the user chasing something that no
longer exists.

**The weights are a judgment call, not a measurement**, they are configurable,
and the report says so on the page rather than in this file.

## Validation and provenance

- The corpus is loaded and validated **in the same run** that produces the
  numbers. There is no cached-score path.
- A prediction file whose `corpus_hash` differs from the corpus on disk is
  refused, not scored. Spans are offsets into specific message strings; scoring
  across corpus versions compares two benchmarks and calls it one.
- A file that does not cover the split exactly — every thread, once, nothing else
  — is refused. A partial file scores as confident silence and flatters precision.
- `pnpm report` re-runs the matcher and refuses to render if the committed
  `results/*.json` disagree with it, so REPORT.md can never state a number that no
  committed artifact backs.
- The committed report is scoped to the dev split only: three configurations, a
  single prompt version with no iteration against dev results, and no held-out
  test split run yet.

## The fixtures

`fixtures/predictions/*.json` are **generated**, not hand-written — see
[`src/fixtures.ts`](src/fixtures.ts). Hand-written fixtures go stale when a
thread is edited, need hand-counted spans, and cannot tell you the eval is
correct because nobody can say what the right score for them is.

These are derived from the dev ground truth by declared perturbations ("drop
every 9th loop", "widen every span by 5 characters", "report every 3rd superseded
loop as open"), so the eval's output can be checked against what went in. The
tests do exactly that: if 35 loops are dropped and the eval reports 34 false
negatives, the matcher is losing pairs, and the fixture is what says so.

Three configurations ship: a reference, one that over-fires with whole-message
spans, and one that under-fires with tight spans. They are test vectors, not
claims about how any model behaves — and the report states that too.

## The prediction format

Defined in [`src/prediction.ts`](src/prediction.ts). It is deliberately not the
corpus schema:

- **No ids.** Identity is the matcher's job.
- **Spans need not resolve.** A fabricated offset is a measurement, not a parse
  error. Rejecting the file would delete the number.
- **Cross-field consistency is not enforced.** `certainty: "explicit"` with no
  span, `state: "closed"` with no resolution — real errors, counted rather than
  rejected.
- **`notes` is rejected outright.** It exists only in ground truth and it
  frequently states the answer. Its presence in a prediction means the label
  leaked into the extractor's context.

What *is* enforced is whatever would make the file un-scoreable: the closed enums,
integer offsets, the split, and a provenance block naming the model, the prompt
version, the sampling parameters and the corpus hash.
