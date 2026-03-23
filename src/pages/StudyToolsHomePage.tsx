import { Link } from "react-router-dom";

const CATEGORIES = ["All", "Memory", "Understand", "Practice"];

export default function StudyToolsHomePage() {
  return (
    <section className="panel study-tools-page">
      <header className="study-tools-header">
        <div>
          <p className="eyebrow">Study Tools</p>
          <h1>Every Learning Tool You Need, In One Workspace</h1>
          <p className="lead">Inspired by the iLovePDF tool-hub pattern: one-click tools, predictable workflow, and fast output.</p>
        </div>
        <Link className="text-link" to="/">
          Back to products
        </Link>
      </header>

      <div className="study-category-row" role="tablist" aria-label="Study categories">
        {CATEGORIES.map((category) => (
          <button key={category} type="button" className={`study-filter ${category === "All" ? "active" : ""}`}>
            {category}
          </button>
        ))}
      </div>

      <div className="study-tool-grid">
        <article className="study-tool-card live">
          <p className="tool-state">Ready</p>
          <h2>Flash Cards Studio</h2>
          <p>Upload txt, md, or docx knowledge sources and generate a clickable study canvas through Claude.</p>
          <Link className="button" to="/study-tools/flash-cards">
            Launch
          </Link>
        </article>

        <article className="study-tool-card">
          <p className="tool-state">Coming Soon</p>
          <h2>Quick Quiz Builder</h2>
          <p>Turn your own notes into MCQs and rapid checks.</p>
          <button className="button secondary" type="button" disabled>
            Soon
          </button>
        </article>

        <article className="study-tool-card">
          <p className="tool-state">Coming Soon</p>
          <h2>Study Plan Composer</h2>
          <p>Create week-by-week plans from your curriculum and deadlines.</p>
          <button className="button secondary" type="button" disabled>
            Soon
          </button>
        </article>
      </div>
    </section>
  );
}
