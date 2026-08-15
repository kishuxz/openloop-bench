import rawResults from "../../../results/viewer-results.json";

export interface MetricDefinition {
  readonly id: string;
  readonly label: string;
  readonly format: "percent" | "number";
  readonly direction: "higher" | "lower";
}

export interface ConfigResult {
  readonly id: string;
  readonly label: string;
  readonly model_id: string;
  readonly description: string;
  readonly metric_values: Readonly<Record<string, number | null | undefined>>;
  readonly cost_weighted_error: number | null;
}

export interface SpanRef {
  readonly msg_index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface LabelResult {
  readonly statement: string;
  readonly state: string;
  readonly direction: string;
  readonly evidence: SpanRef | null;
}

export interface Failure {
  readonly id: string;
  readonly error_type: string;
  readonly config_id: string;
  readonly thread: {
    readonly thread_id: string;
    readonly messages: ReadonlyArray<{
      readonly index: number;
      readonly sender: string;
      readonly text: string;
    }>;
  };
  readonly true_label: LabelResult;
  readonly prediction: LabelResult;
}

export interface ResultsData {
  readonly dataSource: string;
  readonly report_title: string;
  readonly report_deck: string;
  readonly scope: string;
  readonly incomplete_runs?: readonly {
    readonly config: string;
    readonly label: string;
    readonly note: string;
  }[];
  readonly metrics: readonly MetricDefinition[];
  readonly configs: readonly ConfigResult[];
  readonly notable_cells: readonly {
    readonly config_id: string;
    readonly metric_id: string;
    readonly note: string;
  }[];
  readonly headline_callout: {
    readonly label: string;
    readonly config_id: string;
    readonly metric_id: string;
    readonly value: number | null;
    readonly text: string;
  };
  readonly deltas: readonly {
    readonly label: string;
    readonly comparison: string;
    readonly statements: readonly string[];
  }[];
  readonly provenance: {
    readonly corpus_hash: string;
    readonly prompt_version: string;
    readonly model_ids: readonly string[];
    readonly iou_threshold: number;
    readonly date: string;
    readonly cost_matrix: readonly {
      readonly error: string;
      readonly weight: number;
    }[];
  };
  readonly corpus: {
    readonly summary: readonly {
      readonly label: string;
      readonly value: string;
    }[];
    readonly tables: readonly {
      readonly id: string;
      readonly title: string;
      readonly columns: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }[];
    readonly additional_findings: readonly string[];
    readonly separability: {
      readonly score: number;
      readonly null_mean: number;
      readonly null_p95: number;
      readonly p_value: number;
      readonly split: string;
      readonly threads: number;
      readonly positives: number;
      readonly negatives: number;
      readonly residual_features: {
        readonly toward_loop: readonly (readonly [string, number])[];
        readonly toward_no_loop: readonly (readonly [string, number])[];
      };
      readonly history: readonly {
        readonly leak: string;
        readonly fix: string;
      }[];
    };
  };
  readonly failures: readonly Failure[];
}

// Swap fixture data for real results by changing this import path only.
export const results = rawResults as unknown as ResultsData;

export function configLabel(configId: string): string {
  return results.configs.find((config) => config.id === configId)?.label ?? configId;
}

export function formatMetric(value: number | null | undefined, format: MetricDefinition["format"] = "number"): string {
  if (value == null) return "gap";
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

export function gap(label: string): string {
  return `gap: ${label}`;
}

export function isNotableCell(configId: string, metricId: string): boolean {
  return results.notable_cells.some((cell) => cell.config_id === configId && cell.metric_id === metricId);
}
