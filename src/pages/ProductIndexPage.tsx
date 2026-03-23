import { Link } from "react-router-dom";

export default function ProductIndexPage() {
  return (
    <section className="panel product-index-page">
      <div className="product-hero">
        <p className="eyebrow">Ideas Combine</p>
        <h1>Small Tools, Clear Outcomes</h1>
        <p className="lead">A product shelf for focused tools. Start with Study Tools for AI-powered learning workflows.</p>
      </div>

      <div className="tool-grid">
        <article className="tool-card primary">
          <p className="tool-category">Learning</p>
          <h2>Study Tools</h2>
          <p>Upload your own sources, generate interactive study assets, and review without a chat-style UI.</p>
          <Link className="button" to="/study-tools">
            Open Tools
          </Link>
        </article>

        <article className="tool-card secondary">
          <p className="tool-category">Games</p>
          <h2>Gomoku</h2>
          <p>Play local five-in-a-row with move tracking and match summaries.</p>
          <Link className="button secondary" to="/gomoku">
            Play
          </Link>
        </article>
      </div>
    </section>
  );
}
