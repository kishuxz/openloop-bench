import { results } from "../../lib/results";
import FailureGallery from "./failure-gallery";

export default function FailuresPage() {
  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">Failures</p>
        <h1>Failure Gallery</h1>
        <p>Generated fixture failures with exact source spans for the true label and prediction.</p>
      </header>
      <FailureGallery configs={results.configs} failures={results.failures} />
    </div>
  );
}
