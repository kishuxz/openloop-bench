# Contributing

This repo is an evaluation asset. Its git history is part of the artifact: a
reader should be able to reconstruct why the schema looks the way it does from
the commit messages alone. Treat history as reviewed work, not as a save
button.

## Before you push

```bash
pnpm check
```

That runs typecheck, lint, tests, corpus validation and the composition check,
the same five steps CI runs, in the same order. If it passes locally it passes
in CI, and if it does not, fix it before pushing rather than after.

Individually:

| Command | Gate |
|---|---|
| `pnpm typecheck` | `tsc` across the workspace |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest, including the malformed fixtures |
| `pnpm validate` | Every span in every thread resolves |
| `pnpm stats:check` | Bucket targets met, no bucket empty in either split |

## Running it

| Command | Does |
|---|---|
| `pnpm validate` | Parses every thread and re-resolves all 510 spans. Non-zero exit with a per-file, per-path listing. |
| `pnpm stats` | Composition, overall and per split. |
| `pnpm stats:check` | Asserts bucket targets, both splits populated, dev share in band. |
| `pnpm stats:by-batch` | Per-batch distributions, flagging any dimension that moved more than 15 points between consecutive batches. |
| `pnpm separability` | The leakage diagnostic. Never gates. |
| `pnpm eval` | Scores every prediction file at IoU 0.3, 0.5 and 0.7. Writes per-config metrics and a full match log. |
| `pnpm report` | Renders `results/REPORT.md` from the committed prediction and metric files. Deterministic; refuses to render against stale results. |
| `pnpm fixtures:gen` | Regenerates the fixture prediction files from the corpus. |
| `pnpm test` | 229 tests: malformed fixtures proving each validator invariant still bites, and the matcher on every case where the threshold changes the answer. |
| `pnpm check` | All of the above, in the order CI runs them. |

`split` is stored in each thread file rather than computed, so it travels with
the data and cannot be redrawn per run to flatter a result. **Do not read `test`
while iterating on prompts.** Both halves carry every phenomenon, including
closed, superseded, mutual, implied deadlines and all three registers, so
nothing forces you to.

## Commit messages

Conventional Commits, scoped to the package:

```
feat(schema): ground evidence spans at parse time
fix(corpus): reject deadline spans crossing message boundaries
test(schema): cover surrogate-pair boundary rejection
chore(ci): run validate on pull requests
```

Scopes are package names without the org prefix: `schema`, `corpus`,
`extractor`, `eval`, `web`, plus `ci`, `docs`, `repo`.

**Subject.** Imperative mood, at most 72 characters, no trailing period, no
emoji. "add resolution span", not "added resolution spans" or "Adds…".

**Body.** Required whenever the commit embodies a decision. Explain *why*: the
diff already shows what. Name the alternative you rejected and the reason you
rejected it. Wrap at 72 characters.

**One logical change per commit.** Never mix scaffolding with logic, or
formatting with behaviour. If the subject needs an "and", it is two commits.

**No filler.** Not "as requested", "per instructions", "updated based on
feedback", "address review comments". Say what changed and why it is right.

The bar:

```
feat(schema): require a resolution span for closed and superseded loops

A `state` label alone is an assertion the corpus cannot back up. Requiring
a span that points at the retracting message makes supersession a grounded
claim rather than an opinion, and lets the eval measure whether an
extractor found the right retraction rather than merely guessing the label.

Also drops the earlier "evidence must not be in the last message" rule,
which approximated this constraint less precisely.
```

## Branches and PRs

One branch per phase, one PR per phase, **merged with a merge commit, never
squashed.** The granular decision commits are the point; squashing them deletes
the reasoning this repo exists to carry.

| Branch | PR | Scope |
|---|---|---|
| `phase-1-schema-and-corpus` | #1 | Schema, 40 threads, validation, labeling |
| `phase-2-corpus-scale` | #2 | Corpus to 200+, split balancing |
| `phase-3-extractor` | #3 | Extraction, three configs |
| `phase-4-eval` | #4 | Metrics, results, failure analysis |
| `phase-5-web` | #5 | Static results viewer |

`main` stays green. Never commit to it directly. Fill in every section of the
PR template, the Decisions section in particular, with the rejected
alternative for each.

## Changing the corpus

Read [`packages/corpus/LABELING.md`](packages/corpus/LABELING.md) first. It is
the rulebook, including the calls that remain arguable.

A label change is a change to the benchmark's ground truth. Say in the commit
body which rule in LABELING.md the new label follows, and if no rule covers it,
amend LABELING.md in the same commit. A label the rulebook cannot explain is
not a label, it is an opinion.

Adding a thread means updating the targets in `packages/corpus/src/buckets.ts`
if the distribution changes; `pnpm stats:check` will tell you.

## Changing the schema

`packages/schema` is the single source of truth. If a shape is redeclared
anywhere else in the monorepo, that is a bug.

Any new refinement needs a test that fails without it, and a deliberately
malformed fixture if it is a grounding rule. The existing fixtures live in
`packages/corpus/test/fixtures/`; each is the valid control with exactly one
fault introduced, so the test asserts the specific rule fires rather than that
the file happens to be broken.

## Conventions

[`CONVENTIONS.md`](CONVENTIONS.md) records which conventions came from the
gstack reference project and where this repo's brief overrode them. Read it
before introducing a tool, a config file, or a build step.

## The documents

| Document | Contains |
|---|---|
| [`packages/corpus/LABELING.md`](packages/corpus/LABELING.md) | The rulebook. Every labeling rule, worked cases for the hard ones, and §11's list of calls that remain arguable. |
| [`packages/corpus/DRIFT.md`](packages/corpus/DRIFT.md) | One entry per authoring batch: what was re-audited, what changed, which rule was underspecified. Plus the certainty drift audit and the separability remediation. |
| [`packages/eval/README.md`](packages/eval/README.md) | The matcher's design and the alternatives it rejected, every metric's denominator, the cost weights, and why the fixtures are generated rather than written. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Commit standard, branch and PR conventions, and what to run before pushing. |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Which scaffolding conventions came from where, and the decisions log. |

## Layout

```
packages/schema      Zod schemas and inferred types. Single source of truth.
packages/corpus      200 labeled threads, LABELING.md, DRIFT.md, the CLIs.
packages/extractor   Reference extractor.
packages/eval        The matcher, the metrics, the cost model, the report.
apps/web             Static results viewer.
predictions          Model prediction files committed as eval inputs.
fixtures/predictions Generated evaluator fixtures used by tests.
results              Metrics, match logs, REPORT.md. All committed.
```
