import { results, scope } from "../../lib/results";
import FailureGallery from "./failure-gallery";

export default function FailuresPage() {
  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">Failures</p>
        <h1>Failure Gallery</h1>
        <p>Generated from committed failure JSON with exact source spans for the true label and prediction.</p>
      </header>
      <p className="scope-line">{scope}</p>
      <FailureGallery configs={results.configs} failures={results.failures} />
    </div>
  );
}
