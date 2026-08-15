# @openloop-bench/extractor

**Status: stub. No implementation — Phase 2.**

The reference extractor: thread in, `Loop[]` out, scored against the ground
truth in `@openloop-bench/corpus`.

What it will have to get right, in the order the corpus makes hard:

1. **Supersession.** Reading the promise and stopping there is the default
   failure. The extractor has to read the whole thread before it can decide
   `state`.
2. **Direction.** `blocked_on_you` mislabeled as `blocked_on_them` is the one
   error class that would let a downstream system speak for the subject. It is
   scored separately from the rest.
3. **Grounded evidence.** Output must carry character spans that resolve, not
   quotes. `resolveEvidence()` from `@openloop-bench/schema` is the check, and
   it is the same function the corpus validator runs.
4. **Code-mixed deadlines.** `deadline.raw` must come back as it was typed —
   "kal tak", not "by tomorrow".

Phase 3 measures how much of this degrades under PII redaction and under local
models.
