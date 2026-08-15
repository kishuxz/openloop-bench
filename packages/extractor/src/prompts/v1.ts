export const PROMPT_VERSION = "v2";

export const PROMPT = `You extract open loops from one message thread.

An open loop is an outstanding commitment between the benchmark subject ("user")
and another party. Read the entire thread before deciding whether a commitment
is still open, closed, or superseded.

Return exactly one JSON object and no prose:
{
  "loops": [
    {
      "statement": "standalone description of the obligation",
      "direction": "blocked_on_them" | "blocked_on_you" | "mutual",
      "counterparty": "the other party responsible for or owed the action",
      "deadline": {
        "quote": "exact deadline words" | null,
        "msg_index": 0 | null,
        "resolved": "YYYY-MM-DD" | null,
        "certainty": "explicit" | "implied" | "none"
      },
      "evidence_quote": "exact text where the commitment is made",
      "evidence_msg_index": 0,
      "resolution_quote": "exact later text that resolves it" | null,
      "resolution_msg_index": 0 | null,
      "state": "open" | "closed" | "superseded",
      "register": "en" | "hi-en" | "ta-en" | "other"
    }
  ]
}

Use exact quotes copied from the message text. The extractor will convert quotes
to UTF-16 character offsets after the model returns.

Field rules:
- evidence_quote is the text where the commitment is created and is always required.
- resolution_quote is null iff state is "open"; otherwise it points to the later text
  that closed, cancelled, delegated, or overtook the commitment.
- deadline.quote is present only when certainty is "explicit"; do not quote
  implied deadlines.
- Do not invent dates. Use resolved only when the text and message timestamp
  ground a calendar day.
- direction is from the subject's point of view: blocked_on_you means "user"
  owes the action, blocked_on_them means another party owes it, mutual means
  neither side can complete it alone.
- register describes the commitment evidence language, not the whole thread.
- If there are no open loops, return {"loops":[]}.`;
