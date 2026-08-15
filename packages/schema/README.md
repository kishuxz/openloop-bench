# @openloop-bench/schema

Zod schemas and inferred types for the benchmark. Zero runtime dependencies
beyond `zod`. Everything downstream imports its shapes from here.

```ts
import { ThreadSchema, deadlineText, type Thread } from "@openloop-bench/schema";

const thread: Thread = ThreadSchema.parse(JSON.parse(raw));
deadlineText(thread, thread.loops[0]); // → "kal tak"
```

## The one thing to know

`ThreadSchema.parse()` does not only check types. It also checks that every
span, meaning evidence, resolution and deadline, resolves to real characters in the
message it references, and that a `closed` / `superseded` loop points at a
resolution strictly later than its own evidence.

Parsing successfully and being grounded in the text are the same event. There
is no second function a consumer can forget to call.

`ThreadShapeSchema` is the unrefined shape, exported only so the corpus
validator can report shape errors and grounding errors as separate classes.

## Three spans, three questions

| Span | Answers | Null when |
|---|---|---|
| `evidence` | Where was this commitment made? | never |
| `resolution` | Where did it stop being outstanding? | `state` is `"open"` |
| `deadline.span` | Where was the due date stated? | `certainty` is not `"explicit"` |

`deadline` has no `raw` string field on purpose: the phrasing is derived from
the span, so "kal tak" cannot drift into "by tomorrow" between the message and
the label. The deadline span frequently sits in a **different message** than
the evidence, because deadlines get negotiated a few turns after the promise, so
resolve it with `deadlineText()` rather than slicing the evidence message.

## Exports

| Export | What it is |
|---|---|
| `ThreadSchema` / `Thread` | Shape + grounding. The contract. |
| `ThreadShapeSchema` / `ThreadShape` | Shape only. For error classification. |
| `CorpusSchema` / `Corpus` | Array of threads, ids asserted unique. |
| `MessageSchema`, `LoopSchema`, `DeadlineSchema`, `SpanSchema`, `EvidenceSchema` | Component schemas. |
| `resolveSpan` / `resolveEvidence` | Span → text, or `null`. The grounding check. |
| `deadlineText(thread, loop)` | The deadline exactly as typed, or `null`. |
| `splitsSurrogatePair(text, offset)` | Guard against a span cutting an astral character. |
| `CHANNELS`, `DIRECTIONS`, `STATES`, `REGISTERS`, `CERTAINTIES`, `SPLITS` | The closed vocabularies. |
| `SUBJECT`, `isSubject(sender)` | The reserved `"user"` sender id. |
| `isCalendarDate`, `isTimestamp` | Date grammar, owned here rather than borrowed from zod. |
| `formatIssues(error)` | `path: message` lines for CLI output. |

## Character offsets

Spans are half-open `[start, end)` in **UTF-16 code units**, exactly what
`String.prototype.slice` takes, so `text.slice(start, end)` is the span with no
conversion.

Consumers in other languages must convert: Python string indices are code
points, so an astral character (an emoji) counts as 2 here and 1 there. The
schema rejects any span whose boundary lands inside a surrogate pair, which
keeps every span in this corpus convertible without ambiguity. See the
README's "Known limitations" for what this guard does *not* cover.

## `notes` is labeler metadata

`loop.notes` holds a human's reasoning about a hard call. It must never appear
in an extractor prompt (it often states the answer outright) and must never be
compared during eval (it would score prose, not extraction).
