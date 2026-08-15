# openloop-bench

A labeled benchmark for detecting **open loops** — outstanding commitments
between two people — in real founder messaging, including code-mixed
Hinglish/Tanglish.

An open loop is anything you owe someone or someone owes you. They are created
casually ("I'll send it tomorrow", "kal tak bhej dunga") and written down
nowhere. Extracting them is easy to demo and hard to do.

**200 hand-labeled threads. 273 loops. 40 threads deliberately containing none.**

```bash
pnpm install && pnpm validate && pnpm stats && pnpm test
```

## What this measures that other things do not

**Supersession.** A commitment made and then cancelled, delegated, or overtaken
later in the same thread. Naive extractors read the promise, never read the
retraction four messages down, and report a live commitment. It is the most
common real-world false positive in this product category and nobody has
published a number on it. 60 of the 273 loops are `superseded` — the `sup-` and
`del-` buckets both, since delegation supersedes a commitment just as
cancellation does.

**Negatives.** 40 threads contain zero loops and heavy near-miss language — "we
should catch up sometime", "let me know if you need anything", "happy to help
whenever". Precision measured only on threads that contain loops cannot see the
failure that actually kills this category: handing someone a list of things
they never agreed to. They are written in the same registers and about the same
subjects as the positives, and the corpus is checked for that — see the
separability section.

**Code-mixed deadlines.** Deadlines are expressed non-numerically throughout —
"kal tak", "parso", "weekend tak", "naaliki", "month end kulla". 118 of 273
loops are labeled `hi-en` or `ta-en`, 43% of the corpus.

**Direction as a safety boundary.** Each loop is `blocked_on_them`,
`blocked_on_you`, or `mutual`. A system may eventually auto-nudge on
`blocked_on_them`; it must never act autonomously on `blocked_on_you`. Getting
this backwards is not a ranking error, and the eval scores it separately.

The corpus is skewed: 174 `blocked_on_you` against 84 `blocked_on_them`. That
was left at its natural rate rather than engineered toward parity, because
manufacturing threads to balance a distribution distorts the corpus more than
the imbalance does. `blocked_on_them` is under-represented relative to its
product importance, and results should say so.

## Results

**No model has been measured yet.** The extractor is Phase 3 and has not landed.

What ships now is the thing that will measure it: the matcher, the metrics, the
cost model and a generated report, running end to end against fixture prediction
files. [`results/REPORT.md`](results/REPORT.md) is real output — of the eval, not
of any extractor — and it says so on the page.

The one design decision in there is **how a predicted loop is decided to be a
ground-truth loop**. Predictions carry no ids, so matching is on **evidence span
overlap** (IoU within one message), never on how similar the two `statement`
strings read: text similarity would score paraphrasing quality instead of
detection. The threshold is a judgment call, so every run is scored at 0.3, 0.5
and 0.7 and all three are reported — on these fixtures the ranking of the
configurations changes between them, which is exactly the finding a
single-threshold headline would have hidden.

Alongside raw accuracy the eval reports one **cost-weighted** number: a missed
loop costs 1, a false `blocked_on_you` costs 3, and a false `blocked_on_them`
costs 8, because that one sends an outbound message to somebody who may have
already delivered. Those weights are a stance rather than a measurement, so they
are printed in the report every time. Full reasoning:
[`packages/eval/README.md`](packages/eval/README.md).

## The schema

Ground truth lives in `packages/schema` and every downstream package imports it
from there. Full reference: [`packages/schema/README.md`](packages/schema/README.md).

```ts
Thread  { thread_id, channel, split: "dev" | "test", messages[], loops[] }
Message { index, sender, text, ts }
Loop    { statement, direction, counterparty, deadline, evidence,
          resolution, state, register, notes? }
```

Every claim a label makes about the text is a **character span**, never a
quoted string. A quote can be hallucinated and still read as plausible; an
offset pair either resolves to real characters or it does not.

| Span | Answers | Null when |
|---|---|---|
| `evidence` | Where was this commitment made? | never |
| `resolution` | Where did it stop being outstanding? | `state` is `"open"` |
| `deadline.span` | Where was the due date stated? | `certainty` is not `"explicit"` |

`deadline` stores no raw string: the phrasing is derived from the span, so "kal
tak" cannot drift into "by tomorrow" between the message and the label. The
deadline span often sits in a *different* message than the evidence — deadlines
get negotiated a turn or two after the promise.

`ThreadSchema.parse()` enforces all of this. Parsing successfully and being
grounded in real text are the same event, so no consumer can forget a second
check.

## Commands

| Command | What it does |
|---|---|
| `pnpm validate` | Parses every thread, re-resolves all 510 spans, checks ids against filenames. Non-zero exit with a per-file, per-path listing on any failure. |
| `pnpm stats` | Corpus composition — buckets, channels, directions, states, registers, deadline certainty — overall and per split. |
| `pnpm stats:check` | Asserts the composition: bucket targets met, no bucket empty in either split, dev share in band. |
| `pnpm test` | 214 tests: deliberately malformed fixtures proving the validator still catches each invariant, and the matcher on every case where the IoU threshold changes the answer. |
| `pnpm stats:by-batch` | Per-batch distributions, flagging any dimension that moved more than 15 points between consecutive batches. |
| `pnpm separability` | Leakage diagnostic. Never fails a build — see below. |
| `pnpm eval` | Scores every prediction file at IoU 0.3 / 0.5 / 0.7. Writes per-config metrics and a full match log. Refuses a prediction file whose corpus hash is not the current one. |
| `pnpm report` | Renders `results/REPORT.md` from the committed prediction and metric files. Deterministic; refuses to render against stale results. |
| `pnpm fixtures:gen` | Regenerates the fixture prediction files from the corpus. |
| `pnpm typecheck` | `tsc` across the workspace. |
| `pnpm lint` | ESLint across the workspace. |

## Corpus composition

| Bucket | Threads | dev / test | What it is for |
|---|---|---|---|
| `en-` | 50 | 20 / 30 | Straightforward English. The baseline. |
| `mix-` | 50 | 20 / 30 | Hinglish/Tanglish with non-numeric deadlines. |
| `sup-` | 35 | 14 / 21 | Committed, then cancelled/delegated/overtaken. |
| `neg-` | 40 | 15 / 25 | Zero loops, heavy near-miss language. |
| `del-` | 25 | 11 / 14 | Delegation and direction flips. |

| Loops | open 175 | closed 38 | superseded 60 |
|---|---|---|---|
| **Direction** | blocked_on_you 174 | blocked_on_them 84 | mutual 15 |
| **Register** | en 155 | hi-en 67 | ta-en 51 |
| **Deadline** | explicit 139 | implied 45 | none 89 |

**`mutual` is thin — 15 loops, 5.5%.** It was raised from 2.7% with genuine
cases only: peer threads where the act cannot be performed by one side, like a
bank requiring two director signatures at once. It was not pushed to a round
number, because the remaining way to add mutual loops is to invent situations
that do not occur at that rate. Treat any mutual metric as under-powered and
report it with the count attached.

`split` is stored in each thread file, so it travels with the data and cannot
be redrawn per run to flatter a result. Both halves carry every phenomenon —
closed, superseded, mutual, implied deadlines, all three registers — so there
is never a reason to read `test` while iterating.

The labeling rules, including every call that remains arguable, are in
[`packages/corpus/LABELING.md`](packages/corpus/LABELING.md). Read it before
disputing a label.

## Layout

```
packages/schema      Zod schemas + inferred types. Single source of truth.
packages/corpus      200 labeled threads, LABELING.md, DRIFT.md, CLIs.
packages/extractor   Reference extractor.        Stub — Phase 3.
packages/eval        Matcher, metrics, cost model, report generator.
apps/web             Static results viewer.       Stub — Phase 5.
fixtures/predictions Generated prediction files the eval is built against.
results              Metrics, match logs, REPORT.md. All committed.
```

## Is the corpus separable without doing the task?

A benchmark of this shape has a specific way of being worthless: if the threads
that contain commitments differ from the threads that do not in some surface
way, an extractor can score well by learning this corpus instead of learning to
detect commitments.

`pnpm separability` measures it. A bag-of-tokens classifier is trained to
predict "does this thread contain a loop" from thread text alone, cross-validated
within the `dev` split, scored by balanced accuracy against a 200-shuffle
permutation null. Nothing in it knows what language it is reading.

It found three real leaks, all of them habits of the person who wrote the
threads:

| Leak | What it was |
|---|---|
| `already` | Used as the completed-act near-miss in five negatives and almost nowhere else. It stopped being a near-miss and became a tell. |
| Topic | Positives were work threads, negatives were often social — catching up, career advice, a cold call. The classifier was learning subject matter. |
| Dates | Not one negative thread contained a date, though a thread can state a filing deadline and still owe nobody anything. |

**This check is a diagnostic and never fails a build.** The threshold assertion
it started with was removed rather than relaxed. Fixing the first leak moved the
p-value from 0.030 to 0.119 through a change that reassigned threads between
splits and altered no label — and a number that unstable, if it can fail CI,
eventually gets made to pass by tuning the corpus toward its own checker. The
ranked feature list is the useful output, and it is equally informative at any
p-value.

The check refuses to run against a corpus that has not validated in the same
run, and every score it prints carries the corpus content hash it came from.

## Known limitations

**Grapheme clusters are not checked.** Span boundaries are validated against
UTF-16 surrogate pairs, so no span can cut an emoji in half. They are *not*
validated against grapheme cluster boundaries, so a legal boundary could in
principle fall between a Devanagari or Tamil base character and its combining
mark. The seed corpus is romanized throughout, so no such span exists today;
it becomes a real risk the moment native-script threads are added.
([#2](https://github.com/kishuxz/openloop-bench/issues/2))

**Offsets are UTF-16 code units.** Ideal for TypeScript, mildly hostile to
Python or Go consumers, where an emoji counts as one index rather than two.
The surrogate-pair guard makes the conversion unambiguous, but it is still a
conversion. ([#3](https://github.com/kishuxz/openloop-bench/issues/3))

**Labeling drift was found and corrected once.** `certainty` moved 33 points
between Phase 1 and the first Phase 2 batch. Two thread-by-thread audits missed
it because both checked rule interpretation and neither compared distributions.
A blind re-label put the labeling-drift component at 15% and the rest at
thread-writing drift; `pnpm stats:by-batch` now runs as a step of every batch
audit. The whole history is in
[`packages/corpus/DRIFT.md`](packages/corpus/DRIFT.md).

**Single annotator.** Every label is one person's call. Several deadline
resolutions are defensible but arguable — "agle hafte" resolving to nothing,
"weekend tak" resolving to Sunday — and are written up as such in LABELING.md.
Inter-annotator agreement on the `test` split should be measured before the
numbers are published. ([#5](https://github.com/kishuxz/openloop-bench/issues/5))

**Match assignment is greedy, not optimal.** Candidate pairs are taken in
descending IoU order rather than solved as a maximum-weight assignment. With a
handful of loops per thread the two agree except in contrived cases, and greedy
is explainable in a sentence — which matters more here, because every match
decision is written to a file a human is expected to be able to check.

**A false positive is attributed to the register it claimed.** Register is a
property of a loop, and a false positive has no true loop to inherit one from. So
a register row's precision reads as "precision among loops this extractor called
`hi-en`", not "precision on `hi-en`". It is the only attribution the data
supports, and the report says so beside the tables.

**`register: "other"` is unused.** No thread in the seed corpus is in a third
code-mix. Inventing one to fill the enum would be worse than leaving it empty.

**Threads are hand-authored, not sampled.** They are written to be realistic —
fragmentary, lowercase, typo-ridden, WhatsApp-shaped — but they are not real
messages, and they carry no real contact details. A hand-authored corpus can
encode its author's assumptions about what a commitment looks like. Phase 2
scales the corpus; the distribution targets in `packages/corpus/src/buckets.ts`
are the guard against drift.

## License

MIT.
