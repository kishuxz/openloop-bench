# @openloop-bench/schema

Zod schemas and inferred types for the benchmark. Zero runtime dependencies
beyond `zod`. Everything downstream imports its shapes from here.

```ts
import { ThreadSchema, resolveEvidence, type Thread } from "@openloop-bench/schema";

const thread: Thread = ThreadSchema.parse(JSON.parse(raw));
```

## The one thing to know

`ThreadSchema.parse()` does not only check types. It also checks that every
evidence span resolves to real characters in the message it references, that
`deadline.raw` appears verbatim somewhere in the thread, and that a
`closed`/`superseded` loop has a later message capable of having closed it.

Parsing successfully and being grounded in the text are the same event. There
is no second function a consumer can forget to call.

`ThreadShapeSchema` is the unrefined shape, exported only so the corpus
validator can report shape errors and grounding errors as separate classes.

## Exports

| Export | What it is |
|---|---|
| `ThreadSchema` / `Thread` | Shape + grounding. The contract. |
| `ThreadShapeSchema` / `ThreadShape` | Shape only. For error classification. |
| `CorpusSchema` / `Corpus` | Array of threads, ids asserted unique. |
| `MessageSchema`, `LoopSchema`, `DeadlineSchema`, `EvidenceSchema` | Component schemas. |
| `resolveEvidence(messages, evidence)` | Span → text, or `null`. The grounding check. |
| `splitsSurrogatePair(text, offset)` | Guard against a span cutting an astral character. |
| `CHANNELS`, `DIRECTIONS`, `STATES`, `REGISTERS`, `CERTAINTIES` | The closed vocabularies. |
| `SUBJECT`, `isSubject(sender)` | The reserved `"user"` sender id. |
| `isCalendarDate`, `isTimestamp` | Date grammar, owned here rather than borrowed from zod. |
| `formatIssues(error)` | `path: message` lines for CLI output. |

## Character offsets

`evidence.start` / `evidence.end` are a half-open range `[start, end)` in
**UTF-16 code units** — exactly what `String.prototype.slice` takes, so
`text.slice(start, end)` is the span with no conversion.

Consumers in other languages must convert: Python string indices are code
points, so an astral character (an emoji) counts as 2 here and 1 there. The
schema rejects any span whose boundary lands inside a surrogate pair, which
keeps every span in this corpus convertible without ambiguity.
