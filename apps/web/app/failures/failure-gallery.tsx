"use client";

import { useMemo, useState } from "react";
import { gap } from "../../lib/results";
import type { ConfigResult, Failure, LabelResult, SpanRef } from "../../lib/results";
import { spanMatchesText } from "../../lib/spans";

interface Props {
  readonly configs: readonly ConfigResult[];
  readonly failures: readonly Failure[];
}

export default function FailureGallery({ configs, failures }: Props) {
  const errorTypes = useMemo(() => [...new Set(failures.map((failure) => failure.error_type))], [failures]);
  const [config, setConfig] = useState("all");
  const [errorType, setErrorType] = useState("all");

  const visible = failures.filter((failure) => {
    const configMatches = config === "all" || failure.config_id === config;
    const typeMatches = errorType === "all" || failure.error_type === errorType;
    return configMatches && typeMatches;
  });

  return (
    <>
      <div className="filters" aria-label="Failure filters">
        <label>
          Config
          <select value={config} onChange={(event) => setConfig(event.target.value)}>
            <option value="all">All configs</option>
            {configs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Error type
          <select value={errorType} onChange={(event) => setErrorType(event.target.value)}>
            <option value="all">All error types</option>
            {errorTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stack">
        {failures.length === 0 ? <p className="gap">{gap("failure gallery missing from committed JSON")}</p> : null}
        {failures.length > 0 && visible.length === 0 ? (
          <p className="gap">{gap("no failures match the selected filters")}</p>
        ) : null}
        {visible.map((failure) => (
          <article className="failure" key={failure.id}>
            <header>
              <div>
                <p className="eyebrow">{failure.error_type}</p>
                <h2>{failure.thread.thread_id}</h2>
              </div>
              <p>{configLabel(configs, failure.config_id)}</p>
            </header>

            <div className="two-column">
              <LabelBlock title="True label" label={failure.true_label} messages={failure.thread.messages} />
              <LabelBlock title="Prediction" label={failure.prediction} messages={failure.thread.messages} />
            </div>

            <Transcript failure={failure} />
          </article>
        ))}
      </div>
    </>
  );
}

function configLabel(configs: readonly ConfigResult[], configId: string): string {
  return configs.find((config) => config.id === configId)?.label ?? configId;
}

function LabelBlock({
  title,
  label,
  messages,
}: Readonly<{
  title: string;
  label: LabelResult;
  messages: Failure["thread"]["messages"];
}>) {
  return (
    <div className="rule-block">
      <h3>{title}</h3>
      <dl className="label-data">
        <div>
          <dt>Statement</dt>
          <dd>{label.statement || gap("statement missing")}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{label.state}</dd>
        </div>
        <div>
          <dt>Direction</dt>
          <dd>{label.direction}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{label.evidence ? evidenceStatus(label.evidence, messages) : "gap"}</dd>
        </div>
      </dl>
    </div>
  );
}

function evidenceStatus(span: SpanRef, messages: Failure["thread"]["messages"]) {
  return spanMatchesText(messages, span) ? span.text : "gap: span/text mismatch";
}

function Transcript({ failure }: Readonly<{ failure: Failure }>) {
  return (
    <div className="transcript" aria-label={`Source text for ${failure.thread.thread_id}`}>
      {failure.thread.messages.map((message) => (
        <div className="message" key={message.index}>
          <div className="speaker">
            <span>{message.index}</span>
            <strong>{message.sender}</strong>
          </div>
          <p>
            {renderHighlightedText(message.text, [
              markerForMessage("true", message.index, failure.true_label.evidence),
              markerForMessage("pred", message.index, failure.prediction.evidence),
            ])}
          </p>
        </div>
      ))}
      <div className="legend">
        <span className="legend-true">True evidence</span>
        <span className="legend-pred">Predicted evidence</span>
      </div>
    </div>
  );
}

function markerForMessage(kind: "true" | "pred", msgIndex: number, span: SpanRef | null): Marker | null {
  if (!span || span.msg_index !== msgIndex) return null;
  return { kind, start: span.start, end: span.end };
}

interface Marker {
  readonly kind: "true" | "pred";
  readonly start: number;
  readonly end: number;
}

function renderHighlightedText(text: string, markersWithNulls: readonly (Marker | null)[]) {
  const markers = markersWithNulls.filter((marker): marker is Marker => marker !== null);
  if (markers.length === 0) return text;

  const bounds = [...new Set([0, text.length, ...markers.flatMap((marker) => [marker.start, marker.end])])]
    .filter((point) => point >= 0 && point <= text.length)
    .sort((a, b) => a - b);

  return bounds.slice(0, -1).map((start, index) => {
    const end = bounds[index + 1] ?? start;
    const chunk = text.slice(start, end);
    const active = markers.filter((marker) => start >= marker.start && end <= marker.end);
    if (active.length === 0) return <span key={`${start}-${end}`}>{chunk}</span>;
    const className = active.length > 1 ? "mark mark-both" : `mark mark-${active[0]?.kind ?? "true"}`;
    return (
      <mark className={className} key={`${start}-${end}`}>
        {chunk}
      </mark>
    );
  });
}
