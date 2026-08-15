# openloop-bench

A labeled benchmark for extracting open loops — outstanding commitments between
two people — from real founder messaging, where the commitment is made in
passing, the deadline is "kal tak", and the retraction arrives four messages
later looking exactly like everything else.

**Status, 15 August 2026.** Corpus complete: 200 threads, 273 loops, 510
validated character spans. Labeling rulebook and drift log complete. Extraction
and measured results are the work in progress; the corpus is frozen and the
metrics are defined.

## The corpus

| | | | |
|---|---|---|---|
| Threads | 200 | Loops | 273 |
| Spans | 510 | Zero-loop threads | 40 (20%) |
| dev / test | 80 / 120 | Thread length | 3–24 messages |

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

118 of 273 loops are code-mixed. 25 threads carry three to five loops each. 11
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
exists — worse than missing it, because it costs them a message to a
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
appeared only on the positive side. I crossed all three phenomena over —
completed acts into loop-bearing threads, dates into negatives, informal address
into threads that carry commitments — across fifteen edits. That moved the score
to 0.587. Still separable.

The real cause was topic, not vocabulary. Per-thread margins showed every dev
negative separating with a large margin, which no amount of word substitution
was going to touch. Dev positives were almost entirely work threads; half the
dev negatives were social — catching up, career advice, a cold call, flat
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
pass — and the only lever available is the corpus itself. That is the corpus
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

## What gets measured

| Metric | Question |
|---|---|
| Loop precision and recall | Are the commitments found, and are the found ones real? Matched by span overlap, so a fabricated quote cannot score. |
| Supersession false-positive rate | How often is a dead commitment reported as live? The headline number. |
| Direction accuracy | Scored separately, because `blocked_on_you` read as `blocked_on_them` is the error that would let a system speak for the subject. |
| Negative-thread false-positive rate | Measured only over the 40 zero-loop threads. Precision over positives cannot see it. |
| Deadline resolution accuracy | Split by register, because the gap between "by friday" and "kal tak" is the point of the code-mixed half. |
| Evidence grounding rate | What fraction of returned spans resolve to real text at all. |

Extraction runs against three configurations. **Frontier** establishes the
ceiling. **PII-redacted** replaces names and contact details before extraction
and measures what redaction costs — counterparty identity is load-bearing for
`direction`, so this is expected to hurt, and the question is how much.
**Local** runs a model that could plausibly sit on a user's own machine, which
is the only configuration in which this product category is privacy-viable at
all.

## Limitations

**Direction is skewed: 174 `blocked_on_you` to 84 `blocked_on_them`.** The
target was near parity. I left it at the rate the threads produced rather than
writing threads to correct it, because engineering a distribution distorts the
corpus more than the imbalance does. `blocked_on_them` is under-represented
relative to its product importance, and any direction metric should be read with
that in front of it.

**`mutual` is under-powered at 15 loops, 5.5%.** It was raised from 2.7% with
genuine cases only — a bank requiring two director signatures at once, an SLA
neither team can write alone. It stopped there rather than reaching the 6–7%
target, because the remaining way to add mutual loops is to invent situations
that do not occur at that rate. Treat it as excluded from headline metrics, and
report the count alongside any figure computed over it.

**Seven threads carry a resolution ten or more messages from its evidence; the
target was eight.** I previously reported this as met. It was not — I had
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

**`register: "other"` is unused.** No thread is in a third code-mix, and
inventing one to fill an enum slot would be worse than leaving it empty.

**Threads are hand-authored, not sampled.** They are written to be fragmentary,
lowercase and typo-ridden, but they are not real messages and carry no real
names or contact details. Sampling would mean publishing other people's private
conversations, or redacting them into something that no longer resembles how
founders write.

## Running it

| Command | Does |
|---|---|
| `pnpm validate` | Parses every thread and re-resolves all 510 spans. Non-zero exit with a per-file, per-path listing. |
| `pnpm stats` | Composition, overall and per split. |
| `pnpm stats:check` | Asserts bucket targets, both splits populated, dev share in band. |
| `pnpm stats:by-batch` | Per-batch distributions, flagging any dimension that moved more than 15 points between consecutive batches. |
| `pnpm separability` | The leakage diagnostic. Never gates. |
| `pnpm test` | 84 tests, including malformed fixtures proving each validator invariant still bites. |
| `pnpm check` | All of the above, in the order CI runs them. |

`split` is stored in each thread file rather than computed, so it travels with
the data and cannot be redrawn per run to flatter a result. **Do not read `test`
while iterating on prompts.** Both halves carry every phenomenon — closed,
superseded, mutual, implied deadlines, all three registers — so nothing forces
you to.

| Document | Contains |
|---|---|
| [`packages/corpus/LABELING.md`](packages/corpus/LABELING.md) | The rulebook. Every labeling rule, worked cases for the hard ones, and §11's list of calls that remain arguable. |
| [`packages/corpus/DRIFT.md`](packages/corpus/DRIFT.md) | One entry per authoring batch: what was re-audited, what changed, which rule was underspecified. Plus the certainty drift audit and the separability remediation. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Commit standard, branch and PR conventions, and what to run before pushing. |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Which scaffolding conventions came from where, and the decisions log. |

## Layout

```
packages/schema      Zod schemas and inferred types. Single source of truth.
packages/corpus      200 labeled threads, LABELING.md, DRIFT.md, the CLIs.
packages/extractor   Reference extractor.
packages/eval        Metrics and report generation.
apps/web             Static results viewer.
```

## License

MIT.
