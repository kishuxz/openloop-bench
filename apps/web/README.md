# @openloop-bench/web

**Status: stub. No implementation until Phase 3.**

A static viewer for the results JSON that `@openloop-bench/eval` writes.
Next.js App Router + Tailwind, statically exported. Reads flat JSON from the
repo. No server, no database, no state.

## What this is not

This is a **research report**, not a product surface. It renders a results
table and lets a reader click through to the threads behind a number.

Explicitly out of scope, and not to be added later:

- No task list, inbox, assistant, or anything that acts on a loop.
- No calendar view, command palette, or slash-command input.
- No glassmorphism, blur, gradient, ambient background, card shadow, or
  animation.
- No auth, accounts, database, or persistence.
- No ranking, prioritization, or notifications.

Visual rules: monospace headings, plain bordered tables, high contrast, one
accent colour used only to mark regressions. If it looks like a dashboard,
it is wrong.
