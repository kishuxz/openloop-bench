import { formatMetric, gap, results } from "../../lib/results";

export default function CorpusPage() {
  const { corpus } = results;

  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">Corpus</p>
        <h1>Corpus Composition</h1>
        <p>Distribution, split balance, and the separability diagnostic rendered from committed results JSON.</p>
      </header>
      <p className="scope-line">{results.scope}</p>

      <section aria-labelledby="corpus-summary">
        <h2 id="corpus-summary">Summary</h2>
        {corpus.summary.length === 0 ? (
          <p className="gap">{gap("corpus summary missing from committed JSON")}</p>
        ) : (
          <dl className="summary-grid">
            {corpus.summary.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {corpus.tables.map((table) => (
        <section aria-labelledby={table.id} key={table.id}>
          <h2 id={table.id}>{table.title}</h2>
          {table.columns.length === 0 || table.rows.length === 0 ? (
            <p className="gap">{gap(`${table.title} table missing from committed JSON`)}</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.join("|")}>
                      {row.map((cell, index) =>
                        index === 0 ? (
                          <th key={cell} scope="row">
                            {cell}
                          </th>
                        ) : (
                          <td className="numeric" key={`${cell}-${index}`}>
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <section aria-labelledby="findings">
        <h2 id="findings">Additional Findings</h2>
        {corpus.additional_findings.length === 0 ? (
          <p className="gap">{gap("additional findings missing from committed JSON")}</p>
        ) : (
          <ul className="plain-list">
            {corpus.additional_findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="separability">
        <h2 id="separability">Separability</h2>
        <dl className="summary-grid">
          <div>
            <dt>Balanced accuracy</dt>
            <dd>{formatMetric(corpus.separability.score)}</dd>
          </div>
          <div>
            <dt>Permutation null mean</dt>
            <dd>{formatMetric(corpus.separability.null_mean)}</dd>
          </div>
          <div>
            <dt>Permutation null p95</dt>
            <dd>{formatMetric(corpus.separability.null_p95)}</dd>
          </div>
          <div>
            <dt>p-value</dt>
            <dd>{formatMetric(corpus.separability.p_value)}</dd>
          </div>
          <div>
            <dt>Split</dt>
            <dd>{corpus.separability.split}</dd>
          </div>
          <div>
            <dt>Threads with / without loops</dt>
            <dd>
              {corpus.separability.positives} / {corpus.separability.negatives}
            </dd>
          </div>
        </dl>

        <div className="two-column">
          <FeatureList title="Residual features toward a loop" rows={corpus.separability.residual_features.toward_loop} />
          <FeatureList
            title="Residual features toward no loop"
            rows={corpus.separability.residual_features.toward_no_loop}
          />
        </div>
      </section>

      <section aria-labelledby="leak-history">
        <h2 id="leak-history">Leak History</h2>
        <div className="stack">
          {corpus.separability.history.map((entry) => (
            <article className="rule-block" key={entry.leak}>
              <h3>{entry.leak}</h3>
              <p>{entry.fix}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeatureList({ title, rows }: Readonly<{ title: string; rows: readonly (readonly [string, number])[] }>) {
  return (
    <div className="rule-block">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="gap">{gap(`${title} missing from committed JSON`)}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([token, weight]) => (
              <tr key={token}>
                <th scope="row">{token}</th>
                <td className="numeric">{formatMetric(weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
