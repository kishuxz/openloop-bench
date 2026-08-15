# Conventions

Scaffolding conventions for this repo were taken from `~/ref/gstack-kishore`
(referred to below as *gstack*), except where the project brief specified
otherwise. This file records what was adopted, what was deliberately not, and
why — so a later contributor does not have to re-derive it by reading two
repos.

## Adopted from gstack

**ESM everywhere.** `"type": "module"` in every `package.json`, no CommonJS
anywhere, no dual builds.

**Explicit `engines`.** gstack pins `bun >= 1.0.0`; we pin `node >= 20` and set
`packageManager` so `corepack` resolves the same pnpm everyone else runs.

**File-header block comments that explain the decision, not the code.** Every
non-trivial source file in gstack (`lib/jsonl-store.ts` is the model) opens with
a comment saying what the module is the single source of truth for and which
failure it exists to prevent. Every file in `packages/schema` does the same.
This is the convention that mattered most to copy: the schema is the
intellectual contribution here, and its reasoning has to survive in the file
rather than in a PR thread.

**Colon-namespaced scripts, plain verbs at the top level.** gstack uses `build`,
`test`, `dev` at the top and `test:evals`, `gen:skill-docs`, `eval:compare`
below. We use `validate`, `stats`, `test`, `typecheck` at the top and reserve
the namespaced form (`test:watch`) for variants.

**Root scripts delegate to the package that owns the work.** gstack's root
`test` shells into per-area runners; our root `validate` / `stats` are
`pnpm --filter @openloop-bench/corpus run ...` so the CLI has exactly one
definition.

**Precise, greppable failure output.** gstack's CLIs print one actionable line
per problem and exit non-zero. `pnpm validate` prints
`file  path  message` per issue for the same reason: the output is a user
interface, because it is the gate on every corpus edit.

**Tolerant reads, strict writes.** gstack's JSONL reader skips a corrupt line
rather than dying; its writer rejects anything malformed up front. Same split
here — the validator reads every thread file and reports all failures in one
pass instead of aborting on the first, while the schema itself refuses anything
questionable.

**Static invariants enforced by tests, not by review.** gstack has tests that
fail CI on a raw `ln -snf` outside the helper. We have a deliberately malformed
fixture that fails the build if the validator ever stops catching it.

**Docs formatting.** Comparison tables with a `Why` or `Rationale` column, bold
lead-ins on bullet lists, a short "things to know" register. Taken from
`CONTRIBUTING.md` and `DESIGN.md`.

**`.context/` is gitignored.** Straight from gstack's `.gitignore` — the
Conductor workspace scratch directory never gets committed.

## Where the brief overrode gstack

| Area | gstack | Here | Why |
|---|---|---|---|
| Runtime / package manager | Bun, `bun.lock` | Node 20 + pnpm workspaces | Brief specifies pnpm workspaces. |
| Test runner | `bun test` | Vitest | Brief specifies Vitest. |
| Monorepo shape | Single package, directories per skill | `packages/*` + `apps/*` | Brief specifies the layout. |
| TypeScript config | None checked in (Bun transpiles) | `tsconfig.base.json`, strict | Brief specifies strict TypeScript. |

## Decisions this repo made where both were silent

**ESLint, but no formatter.** gstack ships neither, and this repo initially
shipped neither on the same reasoning. That was reversed when CI was added: a
`lint` step is part of the required gate, so there is now a small ESLint config
covering what `tsc` cannot see — unused expressions, shadowed bindings, `any`
creeping into a package whose whole job is types.

No formatter, though. A CI step that fails on whitespace costs more attention
than it saves at this size. Style is held by consistency: double quotes,
semicolons, two-space indent, trailing commas, ~100 column comments.

**Strict beyond `strict: true`.** `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals` and
`noFallthroughCasesInSwitch` are all on. `noUncheckedIndexedAccess` in
particular is load-bearing: this codebase indexes into `messages[]` by a number
that comes out of a JSON file, and the compiler should force that check rather
than trusting the corpus.

**Packages resolve to TypeScript source, not to `dist/`.** Each package's
`exports` points at `src/index.ts`. Nothing here is published to npm, and a
build step between "edit the schema" and "run the validator" would be pure
friction. It also means `pnpm install && pnpm validate` works on a fresh clone
with no build.

**`.js` extensions on relative imports** even though the files are `.ts` — the
standard ESM-compatible style, and it keeps the door open to emitting real
Node ESM later without touching every import.

**Vitest configured once at the repo root** rather than per package, since the
test suites are small and the corpus tests need to read files across package
boundaries anyway.

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-14 | pnpm workspaces, Node 20, Vitest | Brief overrides gstack's Bun toolchain. |
| 2026-08-14 | Evidence spans validated inside `ThreadSchema`, not in a separate pass | "Parsed" and "grounded" become the same event; no consumer can forget the second check. |
| 2026-08-14 | Offsets are UTF-16 code units, with a surrogate-pair guard | Matches `String.prototype.slice` exactly for TS consumers; the guard keeps spans convertible to code-point indices for anyone else. |
| 2026-08-14 | No linter/formatter | gstack ships none; strict `tsc` and tests are the gate. |
| 2026-08-14 | Reversed: ESLint added, formatter still not | CI requires a lint gate. A formatter would fail builds on whitespace for no benchmark benefit. |
| 2026-08-14 | Bucket lives in the `thread_id` prefix, not a schema field | Visible in `ls`, greppable, and unable to disagree with the filename. Rejected a `bucket` field as a second source of truth. |
| 2026-08-14 | `split` stored per thread, not computed at run time | A split redrawn per run can be redrawn to flatter a result. |
| 2026-08-14 | Corpus authoring goes through quoted substrings, not hand-counted offsets | Hand-counting is how a corpus ends up with spans that resolve to the wrong words. |
