/**
 * Mutable fixtures for the schema tests. Each call returns a fresh object so a
 * test can break one field without leaking that break into the next test.
 *
 * The base thread is valid and stays valid: every test that expects a failure
 * introduces exactly one fault, so the reported reason is unambiguous.
 */

export function messages(): Array<{ index: number; sender: string; text: string; ts: string }> {
  return [
    { index: 0, sender: "Priya", text: "deck update?", ts: "2026-03-02T11:04:00+05:30" },
    { index: 1, sender: "user", text: "ill send it by tomorrow evening", ts: "2026-03-02T11:31:00+05:30" },
    { index: 2, sender: "Priya", text: "actually ravi sent it, ignore", ts: "2026-03-02T16:45:00+05:30" },
  ];
}

/** A superseded loop: evidence in message 1, resolution in message 2. */
export function loop(): {
  statement: string;
  direction: string;
  counterparty: string;
  deadline: { span: { msg_index: number; start: number; end: number } | null; resolved: string | null; certainty: string };
  evidence: { msg_index: number; start: number; end: number };
  resolution: { msg_index: number; start: number; end: number } | null;
  state: string;
  register: string;
} {
  return {
    statement: "send Priya the deck",
    direction: "blocked_on_you",
    counterparty: "Priya",
    deadline: { span: { msg_index: 1, start: 12, end: 31 }, resolved: "2026-03-03", certainty: "explicit" },
    evidence: { msg_index: 1, start: 0, end: 31 },
    resolution: { msg_index: 2, start: 0, end: 29 },
    state: "superseded",
    register: "en",
  };
}

export function thread(): {
  thread_id: string;
  channel: string;
  split: string;
  batch: number;
  messages: ReturnType<typeof messages>;
  loops: ReturnType<typeof loop>[];
} {
  return {
    thread_id: "fixture-01",
    channel: "whatsapp",
    split: "dev",
    batch: 0,
    messages: messages(),
    loops: [loop()],
  };
}
