# Labeling rulebook

Every rule here exists because a real thread forced the question. Read it
before adding or disputing a label. Where a rule was a close call, the call and
its reasoning are recorded — including the ones that remain arguable, at the
bottom.

---

## 1. What an open loop is

**An open loop is an outstanding obligation between two identifiable people,
created in the conversation, which one of them could be held to.**

Four tests. A candidate is a loop only if it passes all four.

| Test | Passes | Fails |
|---|---|---|
| **Obligation** — someone owes an act | "ill send the deck" | "the deck is in the drive" |
| **Named parties** — a specific person owes a specific person | "ill send it to you" | "someone should fix this" |
| **Created here** — the conversation is where it was agreed | "ok ill do it" | "as per the contract, we invoice monthly" |
| **Holdable** — the other party could reasonably chase it | "ill send it tomorrow" | "we should catch up sometime" |

The fourth test does the most work. Ask it concretely: *if this never happened,
would the other person feel entitled to follow up?* If the honest answer is no,
it is not a loop, however commitment-shaped the words are.

An obligation that already existed before the thread and is merely *referenced*
is not labeled. An obligation that existed before the thread and is
**re-committed** to ("yeah i still owe you that, ill do it friday") is labeled,
because the re-commitment is the thing you could be held to.

---

## 2. Commitment vs pleasantry

This is the most common error, and it runs in both directions.

### Hedging never disqualifies a commitment

When a statement is hedged, strip the hedge and apply the four §1 tests to what
remains. If "I'll send the deck by Friday" is a loop, then "I'll try to send the
deck by Friday" is the same loop. Hedging is how adults commit to things they
are not certain of.

**This is a rule about what does NOT rule a loop out.** It never establishes a
loop on its own — §1 remains the only gate. Read it as a necessary condition
being cleared, not a sufficient one being met.

That distinction is the whole point. An earlier draft of this section stated the
inverse — that a first-person future-tense statement aimed at a named
counterparty *is* a commitment — and it collided with the availability rule and
the conditional rule below, because a sufficient condition has to be reconciled
against every other rule that could also fire. A necessary condition composes
instead: it removes one wrong reason to reject, and leaves §1 to decide.

#### Worked cases

**`sup-04` — "I'll come back to you in July".** Not hedged, so there is nothing
to strip. Apply §1 directly: there is an act (coming back), a named party
(Aditya to the user), and it is holdable — the user would reasonably follow up
in August. It is a commitment, which makes Aditya's message a **deferral rather
than a cancellation**, and the user's proposal obligation survives it. The loop
stays `open`.

**`neg-04` — "I'll keep an eye out for the portfolio companies you mentioned".**
Also not hedged. Strip nothing, apply §1, and it fails two tests: there is no
act with a completion state — "keeping an eye out" is a posture, not a
deliverable — and nobody can chase it, because there is no moment at which it is
late. Not a loop. Note that **hedging was never the reason**; the earlier draft
made it look like the reason, which is precisely the confusion this
reformulation removes.

**`neg-08` — "if the round closes ill definitely try and get you in".** Strip
the hedge and you are left with "if the round closes, I'll get you in", which is
resolved by the conditional-on-an-uncertain-event rule below, independently of
anything in this section. The round may never close, and neither party treats it
as owed. Not a loop.

**Not loops.** Social maintenance language. It uses the grammar of commitment
and carries none of the obligation:

- "we should catch up sometime" — no act, no party owes it, nobody chases it
- "let me know if you need anything" — an offer of availability, not an act
- "happy to help whenever" — same
- "do reach out anytime" — same
- "lets do it soon" in reply to any of the above — agreement to a non-act
- "kabhi milte hai" / "epavachum coffee pogalam" — the code-mixed equivalents

**The discriminator: is there an act, with an owner, that could be late?**
"Catching up" has no owner and cannot be late. "Sending the deck" has both.

**Also not loops:**

- **Availability.** "collect the parking passes anytime" — nothing is owed;
  the counterparty is not waiting.
- **Completed acts.** "i already updated the runbook this morning" — past
  tense, nothing outstanding. Watch for these in negatives; extractors
  routinely turn them into open loops.
- **Broadcasts.** "deploying at 4pm, shout if anything looks off" — an
  invitation to react, addressed to nobody in particular.
- **Conditionals on an uncertain event.** "if the round closes ill get you in"
  — the condition may never occur and neither party treats it as owed. Compare
  a conditional on a *certain* event, which IS a loop: "once the invoice
  arrives ill process it" — the invoice is coming.

**Are loops, despite hedged phrasing:** see soft commitments, next.

### In-flight statements

"on it", "looking", "rolling it back now", "pulling the numbers" — present
tense, already started, no future-tense promise to point at.

**An in-flight statement is a commitment when it names the act the counterparty
is waiting on.** "rolling it back now" names the act; the person on the other
end is waiting for staging to come back and will follow up if it does not.
Label it, with the evidence span on the in-flight clause.

**A bare acknowledgement is not**, because no act is named: "looking", "on it",
"checking". These say attention has been paid, not that anything is owed. If
the thread never names the act anywhere, there is nothing to be late on.

The distinction is the same one §1 test 1 makes — is there an act? — applied to
a tense that does not announce one. `en-19` has both: "looking" is not labeled,
"rolling it back now" two messages later is.

### Recurring and standing commitments

"ill send it every monday", "aap hi har month 5 tarikh ko bhej dijiye" — an
arrangement rather than an act, with no single occurrence that is the thing
owed.

**Label it once, as one loop, with `certainty: "none"`.** The obligation is
real and holdable — the counterparty will follow up when a Monday passes — but
it has no due date, because every date is equally its due date. Do not label
one loop per expected occurrence; the corpus would fill with loops nobody
created.

Do not resolve the recurrence to the next occurrence either. "Every month on
the 5th" resolved to the coming 5th would assert a deadline the parties did not
set for any particular month, and the eval would then score an extractor on
inventing one.

A standing arrangement closes only when someone ends it. A single missed
occurrence is not supersession.

### Directives accepted

Most commitments are made by the person who owes them. Some are handed over and
taken: "can you send both of them the standard rejection?" → "ok".

**A directive plus an acceptance is a commitment**, and the evidence span goes
on the **directive** — the clause naming the act — not on the bare "ok". The
acceptance is what makes it binding, but a span pointing at "ok" would tell a
reader nothing about what was agreed, and §6's test applies here too: could a
stranger reconstruct the obligation from the span alone?

**Silence is not acceptance.** An unanswered request is not a loop. The
counterparty has to take it: "ok", "sure", "will do", "noted", or acting on it.

**When the acceptor also commits in their own words, their words win.** "can
you send the sheet?" → "ok anna" → "innaiku night ku share panren" is evidenced
on the last of those, not on the directive. The directive form is for when
acceptance is *all* they say. Prefer the span that carries the most of the
obligation — usually the one naming both the act and the deadline.

Direction follows who ends up owing the act, exactly as in §4 — a directive the
subject issues and someone else accepts is `blocked_on_them`.


### `sup-04`, in full

The worked case above settles whether Aditya's message defers or cancels. The
field-level consequences, since this thread was relabelled and the reasoning
should not have to be reconstructed:

The user commits: "I'll have a draft proposal with you by friday." Aditya
replies "Hold off on that actually… I'll come back to you in July," and the user
answers "Happy to pick it up whenever."

Because that is a deferral, the obligation to send a proposal survives, so the
loop is `open` rather than `superseded` and carries no `resolution`. The friday
deadline does not survive, so `certainty` drops from `explicit` to `implied`
with a null span. July is a month-long range with no endpoint both parties would
name identically, so `resolved` stays null under §8. Direction is unchanged —
the user still owes the proposal, so `blocked_on_you`.

One question this leaves open: Aditya's "I'll come back to you in July" clears
§1 on its own and could stand as a second loop, `blocked_on_them`. It is not
labelled as one, on the reading that his line supplies the timeframe for the
obligation that already exists rather than creating a separate one. That reading
is arguable, and a second annotator might add the loop.

---

## 3. Soft commitments — "I'll try to"

A worked case of the hedging rule in §2, not a separate assertion. Everything
here follows from stripping the hedge and applying §1; nothing here can make
something a loop that §1 would reject.

Hedging changes the *confidence*, not the *existence*, of the obligation.

**Label the loop.** "ill try to get it to you by friday" is a loop. The person
said they would attempt a specific act for a specific person by a specific
time, and the other party will follow up if nothing arrives. Hedging is how
adults make commitments they are not certain of; treating it as a non-loop
would delete most real founder messaging from the benchmark.

The schema has no confidence field, deliberately. Adding one would invite an
extractor to hide behind "low confidence" instead of committing to a call.

**Where hedging does change the label — the deadline.** A hedge attached to
the *time* rather than the act weakens `certainty`:

- "ill send it friday" → `explicit`, resolved to Friday
- "ill try to send it friday" → `explicit`, resolved to Friday. The act is
  hedged, the date is not.
- "ill send it soon" → `none`. "Soon" is not a time.
- "ill send it sometime next week maybe" → `explicit` span, `resolved: null`.

**The line between a hedge and a refusal.** "ill see what i can do" with no act
named is not a loop — there is no act to be late on. "ill see if i can get you
the q1 numbers by friday" is a loop: the act and the time are both there.

---

## 4. Direction, and delegation that flips it

`direction` is read from the subject's point of view:

- `blocked_on_them` — the counterparty owes the subject
- `blocked_on_you` — the subject owes the counterparty
- `mutual` — neither can move without the other

**`mutual` is narrow.** Use it only when the act genuinely cannot be performed
by one side: scheduling that needs both calendars, a decision both must be
present for. "Let's find 30 mins this week" is mutual. "Let me know what times
work" is not — that is `blocked_on_them`, because one named person owes one
named act.

**Direction is about who owes the act, not which company they work for.** When
the subject loops in their own ops person to send a document, the new loop is
`blocked_on_them` with the ops person as counterparty. It has left the
subject's hands, which is the only thing `direction` encodes.

### Delegation

When an obligation moves to someone else, label **two loops**:

1. The original, `state: "superseded"`, with `resolution` pointing at the
   handoff.
2. The new one, evidence at the handoff message, direction from the subject's
   new position, counterparty being whoever now owes it.

Do not mutate the first loop's direction. The subject *did* commit, and an
extractor that reports a live `blocked_on_you` there is making a real error
that the benchmark needs to be able to see.

**The counterparty need not be in the thread.** `del-01` labels a loop against
Arjun, who never sends a message. The schema permits this on purpose: the
obligation is real, and pinning the counterparty to a thread participant would
force a wrong label. `pnpm stats` reports how many such loops exist.

### Direction flips without delegation

Same rule, two loops: the counterparty's commitment is superseded and the
subject's replaces it. `del-02` is the model — Tanvi owes a postmortem, then
cannot, and the subject takes it. An extractor that reports one loop
`blocked_on_them` at the end of that thread would nudge the wrong person.

---

## 5. `closed` vs `superseded`

The single most consequential distinction in the corpus, and the reason the
benchmark exists.

> **`closed`** — the promised act was performed, by the person who promised it.
>
> **`superseded`** — the obligation as stated stopped existing without that
> person performing it. Cancelled, delegated, overtaken, or met by another
> route.

Ask one question: **did the promisor do the thing they said they would do?**

- Yes → `closed`
- No, and it no longer stands → `superseded`
- No, and it still stands → `open`

Worked cases from the corpus:

| Thread | What happened | Label | Why |
|---|---|---|---|
| `en-07` | "ill ping him today" → "sent, youre both on the thread" | `closed` | The promisor did it. |
| `sup-01` | "ill send the deck" → "ravi already sent me the march one, ignore this" | `superseded` | The need was met; the subject never sent anything. |
| `sup-02` | "ill put a backoff on it today" → "i already pushed a backoff last night" | `superseded` | The work exists. The subject did not do it. |
| `sup-03` | "kal tak bhej dunga" → "boss ne bola ab zarurat nahi" | `superseded` | Cancelled outright. |
| `sup-05` | "ill do the transfer today" → "the transfer bounced" → "ill do a NEFT monday" | `superseded` + new `open` | Attempted, failed, replaced. |
| `sup-06` | "ill draft it tonight" → "ill just edit hers then" | `superseded` + new `open` | Superseded by the promisor's own later commitment. |

Three traps:

**"Someone else did it" is supersession, not closure.** This is the case
extractors get wrong most often, because the *outcome* looks like success. The
label tracks the obligation, not the outcome. If the corpus called `sup-01`
closed, an eval could never tell the difference between an extractor that
tracks commitments and one that pattern-matches on happy endings.

**Supersession does not require the counterparty to cancel it.** The promisor
can supersede their own commitment by replacing it (`sup-06`).

**A failed attempt supersedes.** In `sup-05` the underlying debt survives, but
the *commitment* — pay today, by transfer — is dead, and a new one replaced it.
Two loops, not one edited loop. An extractor that reports one live payment loop
still gets credit for the live one.

---

## 6. Choosing the resolution span

`resolution` must point at the message where the loop stopped being
outstanding, and must be strictly later than `evidence`. Pick the **smallest
span that a reader could use to justify the state change on its own.**

**Explicit closure or cancellation** — point at the performative words:

- "sent, youre both on the thread now" → the whole clause
- "Hold off on that actually" → the cancellation itself, not the paragraph of
  explanation that follows it
- "boss ne bola ab zarurat nahi hai" → the retraction, not the trailing reason

Where a message both cancels and explains, span the cancellation. The
explanation is context; it is not what changed the state.

**Implicit closure — the deliverable simply arrives.** Nobody announces
anything; the thing shows up, or a reply proves it did.

- Point at the **arrival evidence**, in this order of preference:
  1. The sender's own statement of delivery — "sheet anuppiten, check
     pannunga" (`mix-08`), "added you to staging, try now" (`en-09`).
  2. Failing that, the counterparty's acknowledgement that it arrived — "got
     it", "in, thanks". This is weaker: it proves receipt, and receipt implies
     delivery.
- Do **not** use a bare "thanks". Gratitude is not proof of arrival; people
  thank you for promising. If the only evidence is "thanks", the loop stays
  `open` and the ambiguity is recorded in `notes`.
- Do **not** use a message from outside the thread's own text. If the corpus
  cannot see it, it did not happen.

**Delegation.** Point at the handoff clause — "actually arjun owns that
dashboard now", "priya bhej degi", "looping in Fatima from our ops side" — not
at the new commitment that follows it. The handoff is what killed the old loop;
the new commitment is the evidence for the *new* loop.

**Rule of thumb:** if you deleted every message except `evidence` and
`resolution`, could a stranger tell what was promised and what happened to it?
If not, the resolution span is in the wrong place.

---

## 7. Spans

All three spans are half-open `[start, end)` character ranges in UTF-16 code
units, resolving against exactly one message.

**`evidence`** — the clause that creates the obligation. Start at the subject
or verb that commits ("ill send it…"), end at the end of the committed act.
Include a deadline phrase when it sits inside the same clause ("ill send it by
tomorrow evening"); do not reach across a sentence boundary to collect one.

**Do not span multiple messages.** WhatsApp splits one thought across three
bubbles constantly. When that happens, span the message containing the
commitment itself and let the rest be context.

**`deadline.span`** — the time phrase only. "kal tak", not "kal tak bhej
dunga". It frequently lives in a *different* message from the evidence, which
is legal and expected.

**Verify before committing a label.** From the repo root:

```bash
node -e 'const t=require("./packages/corpus/threads/mix-01.json");
         const l=t.loops[0];
         console.log(JSON.stringify(t.messages[l.evidence.msg_index].text.slice(l.evidence.start,l.evidence.end)))'
```

`pnpm validate` re-resolves every span in the corpus and fails loudly on any
that does not land on real text.

---

## 8. Deadlines

`certainty` is about whether anyone **said** the deadline, not whether one
exists.

- **`explicit`** — someone stated a time. Requires a span.
- **`implied`** — nobody stated a time for this commitment, but the thread
  makes one unavoidable. `en-05`: the GST filing is on the 20th, so the
  invoices are due before it, though nobody attached that date to the promise.
  Span must be null — if there is a phrase to point at, it is explicit.
- **`none`** — no deadline at all.

**Resolving to a date.** `resolved` is the last day the commitment could be met
without being late, computed against the timestamp of the message it was said
in.

| Phrasing | Resolves | Note |
|---|---|---|
| "kal tak", "by tomorrow", "naaliki" | +1 day | |
| "parso" | +2 days | Hindi "parso" is bidirectional; future reading is used, and every corpus instance is unambiguous in context |
| "today", "innaiku", "shaam tak", "by eod" | same day | |
| "by friday", "on monday" | the next such weekday | |
| "weekend tak" | the coming Sunday | Sunday, not Saturday — the last day of the weekend |
| "month end kulla" | last day of that month | Both parties would name the same day |
| "this week", "agle hafte", "next week" | **null** | A seven-day range with no endpoint both parties would name identically |

The last row is a deliberate refusal. Resolving "agle hafte" to a Friday would
be the labeler inventing a date — the exact failure this benchmark measures in
extractors. `certainty: "explicit"` with `resolved: null` is a valid and
common combination.

---

## 9. Register, and the rest of the fields

**`register`** describes the language of the span the loop came from, not the
thread. One thread can carry loops of different registers.

- `en` — English, including Indian-English idiom ("do the needful", "revert
  by EOD")
- `hi-en` — romanized Hindi/English mixing
- `ta-en` — romanized Tamil/English mixing
- `other` — anything else. **Currently unused.** No thread in the seed corpus
  is in another code-mix, and inventing one to fill an enum slot would be
  worse than leaving it empty.

**`statement`** is a description, not a quote — the quote is `evidence`. Write
it so it stands alone outside the thread: "send the updated cap table to
Priya", not "he said he'd send it".

**`notes`** is labeler metadata for genuinely hard calls. It must never appear
in an extractor prompt and must never be scored. It frequently states the
answer outright.

**Re-affirmation is not a second loop.** "sunday tak pakka" followed by "haan
is baar sach me" is one loop. A second loop needs a *different* act, a
different party, or a materially different deadline after the first was killed.

---

## 10. Buckets, splits, and adding a thread

The `thread_id` prefix declares which part of the distribution a thread is
paying for: `en-`, `mix-`, `sup-`, `neg-`, `del-`. The filename is the id.
`pnpm stats:check` fails if a bucket is empty in either split.

`split` is `dev` or `test`, stored in the thread file. **Do not read `test`
while iterating on prompts.** Both splits carry every phenomenon — closed,
superseded, mutual, implied deadlines, all three registers — so nothing forces
you to.

To add a thread: write it, label it, run `pnpm validate`, then `pnpm stats` to
confirm the composition still matches the targets in `src/buckets.ts`.

### No real organisations

Personal names are placeholders, and so is everything else. **Do not name a real
company, fund, bank, product or institution**, in a message or in a `sender`
field. Use a role instead — "(client)", "(vendor)", "(insurance)", "(VC)",
"(prospect)" — or refer to it generically: "their payments team", "the fund".

Two reasons, and the second is the one that bites. A public benchmark should not
put invented words in a real company's mouth. And a real name is a token an
extractor can key on: "Accel" reads as investor context in a way that
"(VC)" does not, so the corpus would be teaching brand recognition rather than
commitment detection.

Three Phase 1 threads violated this and were corrected during the batch 1 audit
— see `DRIFT.md`.

---

## 11. Calls that remain arguable

Recorded rather than hidden. Each of these could reasonably be labeled the
other way, and a second annotator may well disagree. A seventh entry, `sup-04`,
is worked through in §2 instead, as one of the cases the hedging rule settles.

**1. `sup-05`, the bounced transfer.** The debt survives the failed payment, so
one could argue for a single `open` loop with a revised deadline rather than a
superseded loop plus a new one. Two loops was chosen because the commitment
that was made — *today, by transfer* — measurably did not happen, and an
extractor that cannot see that has missed something real. The cost: an
extractor reporting one sensible payment loop is penalised on recall.

**2. `en-06`, "lets find 30 mins this week".** Labeled `mutual`. Divya then
says "ill look at my calendar", which is arguably a `blocked_on_them` loop of
its own. It was not labeled separately — checking a calendar is a step toward
the mutual act, not an obligation the subject would chase independently. If a
second annotator split it, the mutual/`blocked_on_them` boundary would need
tightening.

**3. `en-04`, "would be good to ship before the demo".** Labeled
`certainty: "none"`, not `implied`, because the demo's date never appears in
the thread. The rule adopted: `implied` requires a date the thread makes
*computable*, not merely a referenced event. Compare `en-09`, where "the mehta
demo is on the 18th" makes it computable and the label is `implied`.

**4. `neg-08`, "if the round closes ill definitely try and get you in".** Not
labeled, on the conditional-on-uncertain-event rule. The hedge stacking
("if… definitely try…") makes it clearer, but a bare "if we close, ill hire
you" would be genuinely hard. No such case is in the corpus yet; one should be
added when the corpus grows, because it sits exactly on the boundary.

This thread briefly appeared to collide with §2, when that section stated
hedging as a sufficient condition for a commitment. The collision was resolved
by **reformulating §2 as a necessary condition, not by reclassifying this
thread** — its label never changed, and neither did `neg-04`'s. A rule that
forces label changes to stay self-consistent is usually the wrong rule.

**5. Weekend semantics.** "weekend tak" resolves to Sunday. In practice many
Indian founders work Saturdays and mean Saturday. Sunday was chosen because it
is the later boundary and a deadline should not be resolved earlier than the
phrase allows. Arguable, and it affects `mix-04`.

**6. `del-03`, Fatima.** `blocked_on_them` even though Fatima is on the
subject's own team, so from the client's perspective the subject's company
still owes it. Direction is defined from the *subject as an individual*, which
is the only reading that keeps the autonomy boundary meaningful — the subject
cannot perform the act, so a system must not act as though they can.
