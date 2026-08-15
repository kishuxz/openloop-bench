# Drift log

Labeling consistency decays with volume, and it decays invisibly. A corpus
where the same judgment was made differently at thread 30 and thread 180
measures the labeler, not the extractor.

This file is the evidence that the corpus was maintained rather than
accumulated. One entry per batch: what was re-examined, what changed, and which
rule was clarified. An audit that found nothing is recorded as finding nothing.

**The process.** Write 40 threads. Run the gates. Stop, re-read LABELING.md end
to end, and re-audit the *previous* batch against the rules as they now read.
Anything you would label differently is a drift signal with two possible
causes: the rule is underspecified, or the label is wrong. Fix whichever it is,
then re-audit everything earlier than the thing you fixed.

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
