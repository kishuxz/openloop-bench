# @openloop-bench/eval

**Status: stub. No implementation — Phase 3.**

Scores extractor output against the corpus ground truth and writes the JSON the
web report reads.

Planned metrics, and why each one is separate:

| Metric | Why it is not folded into the others |
|---|---|
| Loop-level precision / recall | The baseline. Matching is span-overlap based, so a fabricated quote cannot score. |
| **Supersession false-positive rate** | The headline number: superseded loops reported as `open`. Nobody has published this. |
| Direction accuracy | The autonomy boundary. A `blocked_on_you` scored as `blocked_on_them` is a safety failure, not a ranking miss. |
| Negative-thread false-positive rate | Measured only on the zero-loop threads. Precision on positives hides this entirely. |
| Deadline resolution accuracy | Split `en` vs `hi-en` / `ta-en`, because that gap is the point of the code-mixed set. |

Phase 3 also reports the two degradations the README promises: extraction
quality under PII redaction, and under local models.
