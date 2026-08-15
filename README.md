# openloop-bench

A labeled benchmark for detecting **open loops** — outstanding commitments
between two people — in real founder messaging, including code-mixed
Hinglish/Tanglish.

An open loop is anything you owe someone or someone owes you. They are created
casually ("I'll send it tomorrow", "kal tak bhej dunga") and written down
nowhere. Extracting them is easy to demo and hard to do.

**40 hand-labeled threads. 42 loops. 8 threads deliberately containing none.**

```bash
pnpm install && pnpm validate && pnpm stats && pnpm test
```

## What this measures that other things do not

**Supersession.** A commitment made and then cancelled, delegated, or overtaken
later in the same thread. Naive extractors read the promise, never read the
retraction four messages down, and report a live commitment. It is the most
common real-world false positive in this product category and nobody has
published a number on it. 11 of the 42 loops are `superseded`, across 11 of the
40 threads — the `sup-` and `del-` buckets both, since delegation supersedes a
commitment just as cancellation does.

**Negatives.** 8 threads contain zero loops and heavy near-miss language — "we
should catch up sometime", "let me know if you need anything", "happy to help
whenever". Precision measured only on threads that contain loops cannot see the
failure that actually kills this category: handing someone a list of things
they never agreed to.

**Code-mixed deadlines.** 10 threads express deadlines non-numerically — "kal
tak", "parso", "weekend tak", "naaliki", "month end kulla". 15 of 42 loops are
labeled `hi-en` or `ta-en`.

**Direction as a safety boundary.** Each loop is `blocked_on_them`,
`blocked_on_you`, or `mutual`. A system may eventually auto-nudge on
`blocked_on_them`; it must never act autonomously on `blocked_on_you`. Getting
this backwards is not a ranking error, and the eval scores it separately.

## Results

**Pending — Phase 3.** Nothing has been measured yet. This repo currently ships
the schema, the corpus, and the tools that keep them honest.

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
| `pnpm validate` | Parses every thread, re-resolves all 89 spans, checks ids against filenames. Non-zero exit with a per-file, per-path listing on any failure. |
| `pnpm stats` | Corpus composition — buckets, channels, directions, states, registers, deadline certainty — overall and per split. |
| `pnpm stats:check` | Asserts the composition: bucket targets met, no bucket empty in either split, dev share in band. |
| `pnpm test` | 83 tests, including deliberately malformed fixtures proving the validator still catches each invariant. |
| `pnpm typecheck` | `tsc` across the workspace. |
| `pnpm lint` | ESLint across the workspace. |

## Corpus composition

| Bucket | Threads | dev / test | What it is for |
|---|---|---|---|
| `en-` | 10 | 4 / 6 | Straightforward English. The baseline. |
| `mix-` | 10 | 4 / 6 | Hinglish/Tanglish with non-numeric deadlines. |
| `sup-` | 6 | 2 / 4 | Committed, then cancelled/delegated/overtaken. |
| `neg-` | 8 | 3 / 5 | Zero loops, heavy near-miss language. |
| `del-` | 6 | 3 / 3 | Delegation and direction flips. |

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
packages/corpus      40 labeled threads, LABELING.md, validate + stats CLIs.
packages/extractor   Reference extractor.        Stub — Phase 2.
packages/eval        Metrics + report generation. Stub — Phase 3.
apps/web             Static results viewer.       Stub — Phase 3.
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

**Single annotator.** Every label is one person's call. Several deadline
resolutions are defensible but arguable — "agle hafte" resolving to nothing,
"weekend tak" resolving to Sunday — and are written up as such in LABELING.md.
Inter-annotator agreement on the `test` split should be measured before the
numbers are published. ([#5](https://github.com/kishuxz/openloop-bench/issues/5))

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
