# Drift log

Labeling consistency decays with volume, and it decays invisibly. A corpus
where the same judgment was made differently at thread 30 and thread 180
measures the labeler, not the extractor.

This file is the evidence that the corpus was maintained rather than
accumulated. One entry per batch: what was re-examined, what changed, and which
rule was clarified. An audit that found nothing is recorded as finding nothing.

**The process.**

1. Write 40 threads.
2. Run `validate`, `stats`, `stats:check`, `test`.
3. Re-read LABELING.md end to end.
4. **Distribution check.** Run `pnpm stats:by-batch` and compare this batch
   against the *previous batch*, not against cumulative totals or targets. Flag
   any dimension that moved more than 15 percentage points, and diagnose it
   before going further: labeling drift (the same judgment made differently) or
   thread-writing drift (the threads simply contain different material).
5. Re-audit the previous batch thread by thread against the rules as they now
   read. Anything you would label differently is a drift signal with the same
   two possible causes: underspecified rule, or wrong label. Fix whichever it
   is, then re-audit everything earlier than the thing you fixed.

Step 4 was added after the fact, and its absence cost something real. Two
consecutive audits examined rule interpretation thread by thread, found genuine
defects, and never noticed that `certainty` had moved 33 points between Phase 1
and batch 1 — because a shift in *what gets written* is invisible to an audit
that only asks whether each individual label follows the rules. Cumulative
totals hide it further: a batch labelled to a different standard is averaged
into 200 threads and disappears.

---

## Batch 1 — threads 41–80 (`en-11..20`, `mix-11..20`, `sup-07..13`, `neg-09..16`, `del-07..11`)

Audit target: the Phase 1 corpus, threads 1–40.

### Rules added during this batch

Four, each forced by a thread that could not be labeled confidently without it.

| Rule | Forced by | What it settles |
|---|---|---|
| **In-flight statements** (§2) | `en-19`, `mix-18` | "rolling it back now" is a commitment; "looking" is not. The test is whether the act is named, which is §1 test 1 applied to a tense that does not announce one. |
| **Directives accepted** (§2) | `en-20`, `del-07` | "can you send the rejections?" → "ok" is a commitment. Evidence goes on the directive, since a span reading "ok" fails §6's reconstruction test. |
| **Recurring and standing commitments** (§2) | `del-08` | "har month 5 tarikh ko bhej dijiye" is one loop with `certainty: none`, not one loop per occurrence, and not resolved to the next occurrence. |
| **No real organisations** (§10) | audit finding, below | Roles, never real company names. |

### Findings

**1. Three Phase 1 threads named real organisations.** `en-07` referenced a real
payments company by name, `sup-04` used it as a counterparty label, and `neg-04`
named a real venture fund. All three were written before any rule forbade it.

*Cause:* missing rule. The Phase 1 brief said "placeholder names" and I read that
as applying to people only.

*Fixed:* `en-07`'s message now says "that payments company"; `sup-04`'s
counterparty is "Aditya (prospect)"; `neg-04`'s is "Shalini (VC)", and its
reference to a real conference became "the founders dinner last week". No loop
changed, and no span moved — the harness recomputes offsets from quoted
substrings, so the labels followed the text automatically.

*Rule added:* §10, "No real organisations". The second reason there is the one
that matters: a real name is a token an extractor can key on, so the corpus
would be teaching brand recognition rather than commitment detection.

**2. The "directives accepted" rule was underspecified, and four batch 1 loops
were labeled inconsistently under it.** The rule said the evidence span goes on
the directive. It did not say what happens when the accepting party *also*
commits in their own words — which is the common case.

*Found by:* auditing `mix-08` from Phase 1, where the user issues a directive
and Karthik replies with both "ok anna" and his own dated commitment. That
thread evidences the loop on Karthik's own words. Four batch 1 loops
(`mix-20` ×2, `del-08`, `del-09`) evidenced the equivalent structure on the
directive instead. Same judgment, made two ways, forty threads apart — exactly
the drift this process exists to catch, and it happened *within* a single batch
because the rule was written mid-batch.

*Cause:* underspecified rule, not label error.

*Fixed:* §2 now states the precedence — when the acceptor commits in their own
words, their words win; the directive form is for when acceptance is all they
say. The four loops were re-pointed to the acceptor's own commitment. `mix-08`,
`del-07` and `en-20` were already consistent with the clarified rule and did not
move.

**3. The "not trivially separable" test was an English-centric proxy.** It
asserts that every negative thread contains commitment-shaped language, so
negatives cannot be separated from positives by keyword. Its cue list was
`ill|will|lets|karo|karunga|dunga|panren|pogalam|milte`.

Four negatives failed it: `neg-11` ("pesalam", "kandippa"), `neg-14`
("sochunga"), `neg-15` ("dekhta hu"), `neg-16` ("someone should look… at some
point"). All four are commitment-shaped — in Tamil hortative, Hindi first-person
future, and English modal-obligation respectively. The test could not see any of
them.

*Cause:* test defect, not corpus defect. The proxy was written when the corpus
was 68% English and stopped tracking the register mix.

*Fixed:* the cue pattern now matches construction families rather than a
keyword list — first-person volitionals in each register, hortatives, and the
modal phrasings that carry most English near-misses. The test still bites: a
negative built from purely factual statements fails it.

**4. `neg-10` was trivially separable and the thread was strengthened.** The
insurance cold-call originally contained no commitment grammar at all, which
made it separable by absence rather than by judgment. Added "aap bolenge to main
comparison chart turant bhej dunga" — strong first-person future, gated on a
condition that will not occur, so it resolves under the existing
conditional-on-an-uncertain-event rule without needing a new one.

**5. `del-11` carried a two-character evidence span.** The user answered "who is
writing the incident report?" with "me". Labeled that way, the span reads "me"
and fails §6's own test — a stranger could not reconstruct the obligation from
it.

*Cause:* label error, caught by the corpus test asserting evidence spans exceed
three characters.

*Fixed:* the message is now "me, ill write it up" and the span sits on the
clause naming the act.

### Re-audited and unchanged

`mix-01` message 1, "haan haan kar raha hu", was re-examined under the new
in-flight rule and left unlabeled: it names no act, so it is the bare
acknowledgement the rule excludes. `en-09`, `sup-05` and `del-02` were
re-examined under the clarified directive rule and are consistent as labeled.

### Counts after batch 1

80 threads, 98 loops, 184 spans, all resolving. `validate`, `stats:check` and
83 tests pass.

---

## Batch 2 — threads 81–120 (`en-21..30`, `mix-21..30`, `sup-14..20`, `neg-17..24`, `del-12..16`)

Audit target: batch 1, threads 41–80.

### Rules added during this batch

| Rule | Forced by | What it settles |
|---|---|---|
| **Group threads: who is the counterparty** (§2) | `en-21`, `en-27`, `del-14` | One counterparty per loop, chosen as the party the act is owed to — the asker, or whoever is blocked without it. Never one loop per person present. |
| **Partial delivery** (§2) | `en-22`, `mix-26` | Half-delivered stays `open`. Not `closed`, and not closed-plus-replacement, which would double-count recall. |
| **Delivery rejected, and the loop reopening** (§2) | `en-23`, `mix-25` | The first loop `closed` — the promisor did what they said — and the correction is a new loop. Deliberately not supersession. |

### Findings

**1. No label changes were required in batch 1.** The three new rules were
checked against every batch 1 thread that could touch them:

- *Partial delivery.* One candidate, `mix-19` message 6 ("baaki do pending").
  The loop there is scoped to the two documents still outstanding, and message
  13 delivers both, so it closes correctly. Scoping the statement to exclude
  the already-delivered item and treating all three as one partly-delivered
  loop give the same label, so the thread stands either way.
- *Delivery rejected.* One candidate, `en-15` message 0 ("can you resend the
  invoice?"). Not a rejection — the original was sent before the thread opens,
  so this is a fresh request, not a correction of an in-thread delivery.
- *Group threads.* Three multi-party threads: `en-17`, `del-09`, `neg-13`.
  `en-17` already carries two different counterparties for two loops in one
  thread, chosen by who is owed each act, which is what the rule now says.
  `del-09` and `neg-13` are consistent.

This is the first audit that changed nothing, which is the outcome the process
is supposed to trend toward.

**2. The cue pattern missed Tamil again.** `neg-19` failed the
not-trivially-separable test on "yaaravadhu paakanum adha" — "someone should
look at that", the exact Tamil analogue of the English near-miss the test is
built around.

This is a recurrence of batch 1 finding 3, and the recurrence is the useful
part: patching in individual words was always going to keep failing. The
pattern now matches the Tamil necessitative suffix `-anum` as a family, along
with the indefinite subjects ("yaaravadhu", "koi"), rather than another handful
of literals.

**3. Two threads were shorter than the stated range.** `neg-12` and `neg-20`
were two messages against a floor of three. Both were email exchanges that
genuinely end after a reply, so each gained a closing message rather than being
padded.

*Cause:* the length range was a target I was not measuring per batch. It is now
checked alongside the composition figures.

### Counts after batch 2

120 threads, 163 loops, 290 spans, all resolving. Thread lengths span 3–20
messages. 16 threads carry 3–5 loops, against a target of 15 at 200 — already
met. `validate`, `stats:check` and 83 tests pass.

---

## Certainty distribution audit (before batch 3)

Triggered by the mid-phase checkpoint, not by a batch audit — which is the
finding underneath the finding.

### What moved

| | Phase 1 (batch 0) | batch 1 | batch 2 |
|---|---|---|---|
| explicit | 74% | 32% | 31% |
| implied | 7% | 23% | 17% |
| none | 19% | 45% | 52% |

The shift is a step, not a slope: 33 points between batch 0 and batch 1, then
stable. That shape already argues against progressive labeler drift, which
would accumulate.

### Method

Two blind re-labels against §8 as written, sampled deterministically by hashing
`thread_id:loop_index` so the selection could not be steered:

- 20 of the 59 `certainty: "none"` loops in batches 1–2.
- 10 of the 31 `certainty: "explicit"` loops in Phase 1.

Disagreement was recorded before anything was changed.

### Disagreement rates

**Phase 1 `explicit` → 0 of 10 disagree.** Every sampled loop re-labels
`explicit` with the same span. Phase 1 was not over-labeling.

**Batches 1–2 `none` → 3 of 20 disagree (15%).**

| Loop | Labeled | Should be | Why |
|---|---|---|---|
| `mix-19` loop 0 | none | explicit, span on message 12 | "aaj kar deta hu" states the deadline nine messages after the commitment. The re-affirmation rule already covers this and `en-17` applies it correctly. |
| `mix-23` loop 2 | none | implied, 2026-05-10 | The joint direction call must precede Anjali's stated weekend delivery, which makes a date computable. |
| `en-30` loop 3 | none | implied, 2026-06-30 | Two other loops in the same thread carry the 30 June renewal bound; this one was left out of it. Internal inconsistency inside one thread. |

### Diagnosis: (c) both, dominated by thread-writing drift

The 15% labeling-drift component is real and is now fixed. But correcting all
three moves batch 1–2 `explicit` from 31% to 36% — nowhere near Phase 1's 74%.
The rest is thread-writing drift, and its cause is legible in what the batches
were written *for*:

Phase 1's mix bucket existed to carry non-numeric deadline expressions, so
nearly every loop in it had a stated time. Batches 1–2 were written to fill the
`closed` deficit and to introduce delegation, multi-loop threads, in-flight
statements and accepted directives — and those phenomena mostly produce
commitments with no stated deadline. "ill review it", "on it", "you take it"
are all deadline-free by nature.

This is less serious than labeling drift but it is not nothing: it changes what
the corpus tests. A deadline-resolution metric computed over this corpus now
leans harder on Phase 1's threads than the thread counts suggest.

### Also fixed: two rule gaps the audit exposed

**Immediacy markers had no rule and were being labelled `none`.** "ill mail it
to you now", "rotate panren ippo", "bhejta hu abhi" — five loops. These state a
time, and the strongest one available; labeling them `none` while "today" is
`explicit` put the stronger phrasing in the weaker bucket. Now `explicit`,
spanning the marker, resolved to that day. §8 states it.

**Earliest-start dates were being confused with deadlines.** `en-22`'s "6 and 7
need our CTO, who is back monday" tells you when work can begin, not when it is
due. It keeps `certainty: "none"`, and §8 now says why, because it looks almost
exactly like the `en-05` pattern where the date genuinely bounds the finish.

### After the fixes

| | batch 0 | batch 1 | batch 2 |
|---|---|---|---|
| explicit | 74% | 41% | 32% |
| implied | 7% | 23% | 20% |
| none | 19% | 36% | 48% |

Batch 3 and 4 are to be written deadline-rich to pull the corpus ratio back
toward the 55% target, and `pnpm stats:by-batch` now runs as step 4 of every
batch audit so a 33-point move cannot go two batches unnoticed again.

### Tooling added

`batch` is now a stored schema field rather than something derived from thread
ids. The first consumer to derive it — the script written for this audit — got
`sup-07..09` and `del-07..08` wrong, reading them as Phase 1 by their numbers.
A wrong batch number silently invalidates the comparison that exists to catch
silent errors, so it is stored and validated.

---

## Batch 3 — threads 121–160 (`en-31..40`, `mix-31..40`, `sup-21..27`, `neg-25..32`, `del-17..21`)

Audit target: batch 2, threads 81–120. First batch run under the amended
five-step protocol.

### Step 4 — distribution check

`pnpm stats:by-batch` flags two dimensions moving more than 15 points between
batch 2 and batch 3:

| | batch 0 | batch 1 | batch 2 | batch 3 |
|---|---|---|---|---|
| explicit | 74% | 41% | 32% | 63% |
| implied | 7% | 23% | 20% | 14% |
| none | 19% | 36% | 48% | 23% |

**Diagnosis: intended correction, not drift.** Batch 3 was written deadline-rich
on purpose, as the remedy the certainty audit called for. The flag is the tool
working — it would have fired the same way had the move been accidental, and the
diagnosis is what distinguishes them. Recording it here is the point: a future
reader comparing batch 2 and batch 3 will see a 31-point jump and needs to know
it was steered.

Nothing else moved. `state`, `direction` and `register` are all within a few
points of batch 2, and `mutual` remains the thinnest dimension in the corpus at
2% of this batch's loops.

### Step 5 — backward audit

**No label changes in batch 2.** Batch 3 added no new rules; it exercised the
three §8 clarifications the certainty audit produced, so the audit re-checked
batch 2 against those:

- *Immediacy markers.* No batch 2 loop carries one in its evidence and is
  labelled anything but `explicit`.
- *Deadline stated in a later message.* One candidate, `del-15` loop 0 — a
  "today" appearing two messages after the evidence. It belongs to the
  replacement loop, which is already `explicit`; the superseded loop it was
  flagged against never had a deadline. False positive.
- *Earliest-start dates.* No candidates in batch 2.

### Finding: the cue test failed on Tamil for the third time

`neg-27` failed on "yosikalam" and `neg-32` on "edhavadhu venumna sollunga,
naan irukken". Both are canonical near-misses — the hortative "let's think
about it", and the availability offer that is the direct Tamil equivalent of
"let me know if you need anything".

Batch 1 patched literals. Batch 2 generalised the necessitative `-anum`. Batch 3
had to generalise the hortative `-alam` and add an availability family across
all three registers. Three batches, same class of gap.

*Cause:* the test was built around English near-miss vocabulary and extended
reactively. The corpus is now 42% code-mixed by loop, and a cue list that grows
one word at a time will keep lagging it.

*Fixed:* both Tamil suffix families are matched as families, and availability
offers are matched as a concept across registers rather than as English
phrases. If a fourth recurrence happens, the test itself should be replaced
rather than extended again.

### Counts after batch 3

160 threads, 220 loops, 412 spans, all resolving. `validate`, `stats:check` and
83 tests pass.
