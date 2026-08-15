import { deadlineLead, formatMetric, gap, isNotableCell, results } from "../lib/results";

export default function ResultsPage() {
  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">Results</p>
        <h1>{results.report_title}</h1>
        <p>{results.report_deck}</p>
      </header>
      <p className="scope-line">{results.scope}</p>

      {(results.incomplete_runs ?? []).map((run) => (
        <section className="incomplete-note" aria-label={`${run.label} incomplete note`} key={run.config}>
          <p className="eyebrow">Attempted, Incomplete</p>
          <h2>{run.label}</h2>
          <p>{run.note}</p>
        </section>
      ))}

      <section className="framing" aria-label="What this measures">
        {results.framing.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </section>

      <section aria-labelledby="headline-table">
        <h2 id="headline-table">Headline Table</h2>
        {results.configs.length === 0 || results.metrics.length === 0 ? (
          <p className="gap">{gap("headline metrics missing from committed JSON")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Config</th>
                  {results.metrics.map((metric) => (
                    <th key={metric.id} scope="col">
                      {metric.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.configs.map((config) => (
                  <tr key={config.id}>
                    <th scope="row">
                      <span>{config.label}</span>
                      <small>{config.model_id}</small>
                    </th>
                    {results.metrics.map((metric) => (
                      <td
                        key={metric.id}
                        className={isNotableCell(config.id, metric.id) ? "numeric notable" : "numeric"}
                      >
                        {formatMetric(config.metric_values[metric.id], metric.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="callout" aria-labelledby="headline-number">
        <p className="eyebrow">Headline Number</p>
        <h2 id="headline-number">{results.headline_callout.label}</h2>
        <p className="callout-value">{formatMetric(results.headline_callout.value, "percent")}</p>
        <p>{results.headline_callout.text}</p>
        <p className="consequence">{results.headline_consequence}</p>
      </section>

      <section aria-labelledby="deadline-finding">
        <h2 id="deadline-finding">{results.deadline_finding.title}</h2>
        <p className="lead">{deadlineLead()}</p>
        {results.deadline_finding.body.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </section>

      <section aria-labelledby="deltas">
        <h2 id="deltas">Plain Deltas</h2>
        {results.deltas.length === 0 ? (
          <p className="gap">{gap("comparison deltas missing from committed JSON")}</p>
        ) : (
          <div className="stack">
            {results.deltas.map((delta) => (
              <article className="rule-block" key={delta.label}>
                <h3>{delta.label}</h3>
                <p>{delta.comparison}</p>
                <ul>
                  {delta.statements.map((statement) => (
                    <li key={statement}>{statement}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="cost-weighted">
        <h2 id="cost-weighted">Cost-Weighted Error</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Config</th>
                <th scope="col">Cost-weighted error</th>
                <th scope="col">Run description</th>
              </tr>
            </thead>
            <tbody>
              {results.configs.map((config) => (
                <tr key={config.id}>
                  <th scope="row">{config.label}</th>
                  <td className="numeric">{formatMetric(config.cost_weighted_error)}</td>
                  <td>{config.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="provenance">
        <h2 id="provenance">Provenance</h2>
        <dl className="provenance">
          <div>
            <dt>Corpus hash</dt>
            <dd>{results.provenance.corpus_hash}</dd>
          </div>
          <div>
            <dt>Prompt version</dt>
            <dd>{results.provenance.prompt_version}</dd>
          </div>
          <div>
            <dt>Model ids</dt>
            <dd>{results.provenance.model_ids.join(", ")}</dd>
          </div>
          <div>
            <dt>IoU threshold</dt>
            <dd className="numeric">{formatMetric(results.provenance.iou_threshold)}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{results.provenance.date}</dd>
          </div>
        </dl>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Error</th>
                <th scope="col">Weight</th>
              </tr>
            </thead>
            <tbody>
              {results.provenance.cost_matrix.map((row) => (
                <tr key={row.error}>
                  <th scope="row">{row.error}</th>
                  <td className="numeric">{row.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
