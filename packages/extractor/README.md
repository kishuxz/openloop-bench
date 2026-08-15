# @openloop-bench/extractor

Reference extractor for Phase 3. It produces prediction files only; metrics,
scoring, and matching belong to the eval package.

```bash
pnpm extract --split dev
pnpm extract --split dev --config hosted-redacted --no-cache
```

The extractor validates the corpus in the same run before loading any thread.
`loadForExtraction(threadId)` returns only `thread_id`, `channel`, and
`messages`, and the model-facing `thread_id` is opaque so bucket prefixes such
as `sup-` never reach the model.

The versioned prompt exports `PROMPT_VERSION`.
Prediction files record the prompt version, model id/version, sampling
parameters, raw model response, parsed loops, unmappable spans, latency, token
counts, parse failures, and provider failures.

Configs:

| Config | Provider | Text |
|---|---|---|
| `hosted-large` | Groq, `OPENLOOP_HOSTED_MODEL`/`GROQ_MODEL` or `llama-3.3-70b-versatile` | full |
| `hosted-redacted` | Groq, `OPENLOOP_REDACTED_MODEL` or hosted model | PII redacted, spans remapped |
| `local` | Ollama, `OPENLOOP_LOCAL_MODEL`/`OLLAMA_MODEL` or `qwen2.5:7b` | full |

`--split test` refuses unless `--final` is passed and no existing test
prediction file is present. Dev runs always print the remaining test-run
warning.
