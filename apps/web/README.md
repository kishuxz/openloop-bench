# @openloop-bench/web

The static results viewer, live at <https://openloop-bench.vercel.app>.

A Next.js App Router project built with `output: "export"`, so `pnpm build`
emits plain HTML, CSS and JS to `out/` and the deployment is a file server.
There is no runtime: no API routes, no server components hitting a service, no
database, no auth, and no environment variables. `process.env` does not appear
anywhere in this package.

## What it reads

Two imports, both resolved at build time:

| Source | Carries |
|---|---|
| [`results/viewer-results.json`](../../results/viewer-results.json) | Headline metrics per configuration, the framing and deadline copy, deltas, provenance and the cost matrix, corpus composition tables, the separability report, and the failure threads with their spans |
| `@openloop-bench/eval/scope` | `SCOPE_TEXT`, the single definition of what the published results cover |

`SCOPE_TEXT` is imported rather than duplicated so the three pages and
`results/REPORT.md` cannot disagree about what was run. That text had three
copies once and two of them drifted.

**No model is ever called here.** Every number on the site was computed by
`pnpm eval` and committed. The viewer formats committed JSON and nothing else,
which is why a stale number is a stale file rather than a stale render.

## State

There is no persisted or server state. The only state in the package is the
failure gallery's two filter dropdowns (`apps/web/app/failures/failure-gallery.tsx`),
which hold the selected config and error type in `useState` for the current page
view. Everything else is a server component rendering committed data.

## Styling

Plain CSS in [`app/globals.css`](app/globals.css). No Tailwind, no CSS-in-JS, no
UI library, no component framework. Colours are a short list of custom
properties on `:root`, and layout is flexbox and grid.

Monospace headings, plain bordered tables, high contrast, and one accent colour
used only to mark a regression or an incomplete run.

## What this is not

This is a research report, not a product surface. It renders results and lets a
reader click through to the threads behind a number.

Explicitly out of scope, and not to be added later:

- No task list, inbox, assistant, or anything that acts on a loop.
- No calendar view, command palette, or slash-command input.
- No glassmorphism, blur, gradient, ambient background, card shadow, or
  animation.
- No auth, accounts, database, or persistence.
- No ranking, prioritization, or notifications.

If it looks like a dashboard, it is wrong.

## Pages

| Route | Shows |
|---|---|
| `/` | Framing, the headline table, the headline number and its consequence, the deadline finding, deltas, cost-weighted error, provenance |
| `/corpus` | Composition tables and the separability report |
| `/failures` | The generated failure gallery, filterable by configuration and error type |
