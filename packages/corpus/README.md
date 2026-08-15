# @openloop-bench/corpus

The labeled threads, and the two tools that keep them honest.

```bash
pnpm validate      # parse every thread, re-resolve every span
pnpm stats         # composition, overall and per split
pnpm stats:check   # assert the composition; non-zero exit if it drifted
```

## Layout

```
threads/*.json   40 labeled threads. The filename is the thread_id.
LABELING.md      The rulebook. Read before adding or disputing a label.
src/buckets.ts   The distribution targets, as data.
src/load.ts      Tolerant read: one broken file never hides the other 39.
```

## Bucket prefixes

The `thread_id` prefix declares which part of the distribution a thread pays
for. It lives in the filename rather than a schema field so it is visible in
`ls`, greppable, and unable to disagree with the file it names.

| Prefix | Threads | What it covers |
|---|---|---|
| `en-` | 10 | Straightforward English loops |
| `mix-` | 10 | Hinglish/Tanglish, non-numeric deadlines |
| `sup-` | 6 | Superseded: cancelled, delegated, overtaken |
| `neg-` | 8 | Zero loops, near-miss language |
| `del-` | 6 | Delegation and direction flips |

## Adding a thread

1. Write it. Realistic means fragmentary, lowercase, typo-ridden. Placeholder
   names only, no real contact details.
2. Label it against `LABELING.md`.
3. `pnpm validate`, where every span must resolve to real characters.
4. `pnpm stats`, to confirm the composition still matches `src/buckets.ts`.

Spans are character offsets, so check one before trusting it:

```bash
node -e 'const t=require("./threads/mix-01.json"), l=t.loops[0];
         console.log(JSON.stringify(
           t.messages[l.evidence.msg_index].text.slice(l.evidence.start, l.evidence.end)))'
```

## Why the validator repeats what the schema already does

`ThreadSchema` refuses to parse an ungrounded thread, so `pnpm validate` could
be a one-line call to `parse`. It re-resolves every span anyway, through the
same `resolveSpan` the eval package will use.

The guarantee is then asserted by the tool a human actually runs, not only by a
refinement they have to trust, and if the two ever disagree, the corpus is
what finds out.
