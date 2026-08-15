# openloop-bench

A labeled benchmark measuring whether a model can extract open loops, the
outstanding commitments between two people, from real founder messaging.

## Findings

Dev split, IoU 0.5. Every number below is reproducible with `pnpm eval`.

- **F1 50.5% for `hosted-large` against 25.7% for `local`, and the gap is
  entirely recall.** Recall falls from 49.5% to 16.8% while precision holds at
  51.5% and 54.5%. The on-device model is not a smaller version of the hosted
  one. It is a model that finds a third as many commitments and is no more
  careful about the ones it does find. For anything acting on your behalf, this
  is the bill for keeping messages on the device, and it is paid in commitments
  you are never told about.
- **A deadline phrase is located 72.7% of the time and resolved to a calendar
  date 8.6% of the time.** The model quotes "kal tak" back accurately and then
  cannot say which day that is. A proactive system ranks by urgency, and urgency
  means a date, so a loop carrying only a phrase cannot be placed in the queue at
  all. Locating the deadline is the half that does not matter on its own.
- **One in seven superseded commitments is reported as still open** (2 of 14
  matched pairs, 14.3%). The commitment was cancelled, delegated or overtaken
  later in the same thread, and the model still calls it live. This is the error
  that sends a message to a counterparty who has already moved on, and it
  arrives carrying the full confidence of a real loop.
- **Evidence grounding is 100%** (103 of 103 spans for `hosted-large`, 33 of 33
  for `local`). Every span either resolves to real characters in the message it
  names or the prediction is counted against the model, and none failed. The
  model is wrong about which commitments exist and what state they are in, but
  it does not fabricate quotes, so a human reviewing its output can trust the
  evidence and audit the judgement.

Full results, corpus browser and failure gallery:
<https://openloop-bench.vercel.app>

## Status and scope

**15 August 2026.** Corpus complete: 200 threads, 273 loops, 510 validated
character spans. Labeling rulebook, extractor, matcher, metrics, cost model and
generated report are all in place.

Results cover the dev split only, with two configurations reported: hosted large
and local. A single prompt version was used with no iteration against dev
results. The held out test split has not been run. The hosted redacted run was
attempted and did not complete. It reached 80 threads attempted, 67 provider
failures and 10 threads with parsed loops before being abandoned to free-tier
rate limits, and it is to be re-run.

## The corpus

The threads are written the way founders actually message: the commitment is
made in passing, the deadline is "kal tak", and the retraction arrives four
messages later looking exactly like everything else.

<details>
<summary><strong>Corpus composition</strong></summary>

| | | | |
|---|---|---|---|
| Threads | 200 | Loops | 273 |
| Spans | 510 | Zero-loop threads | 40 (20%) |
| dev / test | 80 / 120 | Thread length | 3 to 24 messages |

| Bucket | Threads | dev / test | Covers |
|---|---|---|---|
| `en-` | 50 | 20 / 30 | Straightforward English |
| `mix-` | 50 | 20 / 30 | Hinglish/Tanglish, non-numeric deadlines |
| `sup-` | 35 | 14 / 21 | Committed, then cancelled, delegated or overtaken |
| `neg-` | 40 | 15 / 25 | Zero loops, near-miss language throughout |
| `del-` | 25 | 11 / 14 | Delegation and direction flips |

| State | | Direction | | Register | | Deadline | |
|---|---|---|---|---|---|---|---|
| open | 175 (64%) | blocked_on_you | 174 (64%) | en | 155 (57%) | explicit | 139 (51%) |
| superseded | 60 (22%) | blocked_on_them | 84 (31%) | hi-en | 67 (25%) | none | 89 (33%) |
| closed | 38 (14%) | mutual | 15 (5%) | ta-en | 51 (19%) | implied | 45 (16%) |

</details>

118 of 273 loops are code-mixed. 25 threads carry three or four loops each. 11
loops are owed by someone who never sends a message in the thread.

```bash
pnpm install && pnpm validate && pnpm stats && pnpm separability && pnpm test
```

## Why supersession is the metric worth having

A commitment that was made and then cancelled, delegated, or met by another
route looks identical at the surface to one that is still live. The promise is
still in the text, phrased exactly as a real commitment is phrased, because it
*was* a real commitment when it was made. Only the rest of the thread says
otherwise. An extractor that reads the promise and stops reports it as open, and
the person relying on that extractor goes chasing something that no longer
exists. That is worse than missing it, because it costs them a message to a
counterparty who has already moved on.

The label tracks the obligation, not the outcome. In `sup-01` the subject
promises a deck, and two messages later the counterparty says someone else
already sent the March version. The need was met. The outcome is fine. But the
promisor never performed, and nothing in the thread shows them sending anything,
so the loop is `superseded` rather than `closed`. If the corpus called it closed,
no evaluation could distinguish an extractor that tracks commitments from one
that pattern-matches on happy endings. 60 of 273 loops are superseded, spread
across the `sup-` and `del-` buckets, since delegation kills a commitment as
surely as cancellation does.

## Corpus separability

A benchmark of this shape has a specific way of being worthless. If threads
containing commitments differ from threads that do not in some surface way, an
extractor can score well by learning this corpus rather than the task, and
nothing in the pass rate will say so.

`pnpm separability` measures it directly. A bag-of-tokens classifier is trained
to predict "does this thread contain at least one loop" from thread text alone,
cross-validated within the `dev` split, scored by balanced accuracy against a
200-shuffle permutation null. Tokens are Unicode letter and digit runs. No
vocabulary is written by hand and nothing in it knows what language it is
reading.

```
corpus d9c347f4f5150b19   dev: 80 threads, 65 with loops, 15 without

balanced accuracy   0.523      (0.500 is chance)
permutation null    0.499 mean, 0.551 at p95
p-value             0.219

toward HAVING a loop:  can send kal haan deta actually now have
toward NO loop:        anything if worth some point been looks saw too
```

Those residual features are the genuine language of commitment and of near-miss.
"some point" and "worth" belong to threads where nobody committed to anything;
"kal" and "send" belong to threads where somebody did. That is the phenomenon
the corpus exists to capture, and driving the score lower would mean removing it.

### It failed the first time it ran

At 160 threads the same check returned balanced accuracy 0.606 against a null
95th percentile of 0.558, p = 0.010. The corpus was separable, and the top
features named why.

The first diagnosis was incomplete. `already` carried a weight of −2.27, the
strongest single feature in the corpus, because I had reached for "already X" as
the completed-act near-miss in five negatives until it stopped being a near-miss
and became a tell. Social address terms clustered on the negative side; dates
appeared only on the positive side. Across fifteen edits I crossed all three
phenomena over: completed acts into loop-bearing threads, dates into negatives,
informal address into threads that carry commitments. That moved the score to
0.587. Still separable.

The real cause was topic, not vocabulary. Per-thread margins showed every dev
negative separating with a large margin, which no amount of word substitution
was going to touch. Dev positives were almost entirely work threads; half the
dev negatives were social: catching up, career advice, a cold call, flat
hunting. The classifier had learned subject matter. I had been writing work as
positive and social as negative without noticing it, and no hand-authored check
would have caught that, because the leak sat in a dimension I had not thought to
look at.

The last batch fixed it at the source: nine social-register threads carrying
real obligations, and eight work-register negatives about filings, deploys and
invoices where nothing is owed.

### Why it does not fail the build

The threshold assertion was removed rather than relaxed.

The number is too unstable to gate on. Fixing the first leak moved p from 0.030
to 0.119 through a change that reassigned threads between `dev` and `test` and
altered no label, no message, and no span. A statistic that swings that far on a
split reassignment will, given the power to fail a build, eventually be made to
pass, and the only lever available is the corpus itself. That is the corpus
being tuned toward its own checker, a worse defect than the leak it would be
hiding, and unlike the leak it leaves no trace.

The ranked feature list was always the useful output. It named `already`, it
named the topic split, and it is exactly as informative at p = 0.4 as at
p = 0.01. So the check reports and never gates. The bar is judgment: remediate
while the top features are obviously authorial habit, and stop when what remains
reads like the genuine language of commitment.

It still exits non-zero on real errors. It refuses to score a corpus that has
not validated in the same run, and every score it prints carries the corpus
content hash it was computed from, because a number you cannot trace to a corpus
is a number you cannot act on.

## Grounding

Every claim a label makes about the text is a character span, never a quoted
string. A quote can be paraphrased, typed from memory, or fabricated outright
and still read as plausible to a reviewer. An offset pair either resolves to
real characters in the message it names, or it does not.

| Span | Answers | Null when |
|---|---|---|
| `evidence` | Where was this commitment made? | never |
| `resolution` | Where did it stop being outstanding? | `state` is `open` |
| `deadline.span` | Where was the due date stated? | `certainty` is not `explicit` |

`ThreadSchema.parse()` resolves all three against the messages they reference,
and rejects a `closed` or `superseded` loop whose resolution is not strictly
later than its own evidence. Parsing successfully and being grounded in real
text are therefore the same event, and no consumer can skip the second check
because there is no second check to skip. Fabricated justification is
structurally impossible rather than discouraged.

`deadline` stores no raw string. The phrasing is derived from its span, so "kal
tak" cannot drift into "by tomorrow" between the message and the label. That
span frequently sits in a different message from the evidence, because deadlines
get negotiated a turn or two after the promise.

*What gets measured, and how a prediction is matched to a label, moved to [`packages/eval/README.md`](packages/eval/README.md).*

## Cost-weighted error

Precision, recall and F1 count every error once. This product does not: trading
three missed loops for one confident false `blocked_on_them` makes it worse
while F1 says it improved. So one cost number is reported alongside the rates.

| Error | Weight | |
|---|---|---|
| Missed loop | 1 | You do not get reminded. It was already invisible. |
| False positive, `blocked_on_you` | 3 | An unnecessary nag to yourself. |
| False positive, `blocked_on_them` | 8 | This one leaves the building: an outbound chase to someone who may have already delivered. |
| Superseded reported as open | 8 | Sends you after something that no longer exists, with the confidence of a real loop. |
| Direction inverted | 8 | Says you owe them when they owe you. |

Those weights are a product stance, not a measurement, and the report prints them
in full every time it says so. [`results/REPORT.md`](results/REPORT.md) is real
output of the evaluation, not of any extractor, and its failure gallery is
generated rather than curated: every mismatch appears, grouped by error type,
with both spans and the text they resolve to. Full reasoning in
[`packages/eval/README.md`](packages/eval/README.md).

## Limitations

**Direction is skewed: 174 `blocked_on_you` to 84 `blocked_on_them`.** The
target was near parity. I left it at the rate the threads produced rather than
writing threads to correct it, because engineering a distribution distorts the
corpus more than the imbalance does. `blocked_on_them` is under-represented
relative to its product importance, and any direction metric should be read with
that in front of it.

**`mutual` is under-powered at 15 loops, 5.5%.** It was raised from 2.7% with
genuine cases only: a bank requiring two director signatures at once, an SLA
neither team can write alone. It stopped there rather than reaching the 6% to 7%
target, because the remaining way to add mutual loops is to invent situations
that do not occur at that rate. Treat it as excluded from headline metrics, and
report the count alongside any figure computed over it.

**Seven threads carry a resolution ten or more messages from its evidence; the
target was eight.** I previously reported this as met. It was not. I had
counted a thread whose loop has no resolution at all. Within-thread distance is
the structure that tests whether an extractor reads to the end of a thread, so
seven is thin.

**Every label is one annotator's.** Several deadline resolutions are defensible
but arguable: "agle hafte" resolving to nothing, "weekend tak" resolving to
Sunday. `LABELING.md` §11 lists the calls that remain contested.
Inter-annotator agreement on the `test` split should be measured before any
number here is published.

**Labeling drift happened once, and was caught late.** `certainty` moved 33
points between the seed corpus and the first scale-up batch. Two thread-by-thread
audits missed it, because both examined rule interpretation and neither compared
distributions. A blind re-label attributed 15% of the shift to mislabeling and
the rest to a change in what was being written. `pnpm stats:by-batch` now runs as
a step of every batch audit.

**Offsets are UTF-16 code units.** Ideal for TypeScript, a conversion for Python
or Go, where an emoji counts as one index rather than two. Spans that split a
surrogate pair are rejected, so the conversion is unambiguous.

**Grapheme clusters are not validated.** A legal span boundary could fall
between a Devanagari or Tamil base character and its combining mark. The corpus
is romanized throughout, so no such span exists today; it becomes real the
moment native-script threads are added.

**Match assignment is greedy, not optimal.** Candidate pairs are taken in
descending IoU order rather than solved as a maximum-weight assignment. With a
handful of loops per thread the two agree except in contrived cases, and greedy
is explainable in one sentence. That matters more here, because every match
decision is written to a file a human is expected to be able to check.

**A false positive is attributed to the register it claimed.** Register is a
property of a loop, and a false positive has no true loop to inherit one from. A
register row's precision therefore reads as "precision among loops this
extractor called `hi-en`", not "precision on `hi-en`". It is the only
attribution the data supports.

**`register: "other"` is unused.** No thread is in a third code-mix, and
inventing one to fill an enum slot would be worse than leaving it empty.

**Threads are hand-authored, not sampled.** They are written to be fragmentary,
lowercase and typo-ridden, but they are not real messages and carry no real
names or contact details. Sampling would mean publishing other people's private
conversations, or redacting them into something that no longer resembles how
founders write.

*Commands, the document index and the repository layout moved to [`CONTRIBUTING.md`](CONTRIBUTING.md).*
*What scoring refuses to run against moved to [`packages/eval/README.md`](packages/eval/README.md).*

## Roadmap

Intent, not work done. Nothing below v1 has been built, and none of it is a
commitment.

**v1, current.** 200 threads, one annotator, two configurations scored on the
dev split.

**v2.** Inter-annotator agreement measured and kappa published, especially on
the superseded label. A submission harness so another extractor can be scored
against the same corpus. A test split held out by mechanism rather than by
discipline.

**v3.** Calibration, meaning whether stated confidence predicts correctness,
since that is the gate on any system acting without asking. Longitudinal loops
that live across days and threads rather than within one. Resolution that
arrives on a different channel from the commitment.

## Kill criteria

Conditions under which parts of this benchmark should be abandoned rather than
defended.

**If inter-annotator agreement on `superseded` falls below roughly 0.6**, the
label is ill-defined. The headline metric needs redesigning rather than more
data, because more data labeled against an unclear rule buys nothing.

**If PII redaction costs less than a couple of points once the run completes**,
the tension this was built around does not exist, and the framing narrows to
supersession alone.

## License

MIT.
