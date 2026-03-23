import { type ChangeEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { generateStudyCanvas } from "../study/claude";
import { buildFallbackDsl, type StudyCanvasDsl, type StudySkill } from "../study/dsl";
import { getAcceptedFileTypes, parseKnowledgeFile, type ParsedKnowledgeFile } from "../study/fileParsers";
import { StudyCanvasRenderer } from "../study/StudyCanvasRenderer";

export default function FlashCardsStudioPage() {
  const [files, setFiles] = useState<ParsedKnowledgeFile[]>([]);
  const [skill, setSkill] = useState<StudySkill>("auto");
  const [learningGoal, setLearningGoal] = useState("Understand and remember the core ideas quickly.");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dsl, setDsl] = useState<StudyCanvasDsl | null>(null);

  const totalChars = useMemo(() => files.reduce((sum, file) => sum + file.chars, 0), [files]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setError(null);

    try {
      const parsed = await Promise.all(selectedFiles.map((file) => parseKnowledgeFile(file)));

      setFiles((existing) => {
        const map = new Map(existing.map((item) => [item.id, item]));

        for (const file of parsed) {
          map.set(file.id, file);
        }

        return Array.from(map.values());
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to parse uploaded files.");
    } finally {
      event.target.value = "";
    }
  }

  function removeFile(id: string) {
    setFiles((existing) => existing.filter((file) => file.id !== id));
  }

  async function handleGenerate() {
    if (files.length === 0) {
      setError("Upload at least one knowledge source before generating.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const generated = await generateStudyCanvas({
        files,
        skill,
        learningGoal,
        difficulty,
      });

      setDsl(generated);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Generation failed.";
      setError(`${message} Falling back to a local starter deck.`);
      setDsl(buildFallbackDsl("Local fallback canvas. Confirm Edge Function logs and Claude settings, then regenerate."));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel flash-studio-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Study Tools / Studio</p>
          <h1>Build an Interactive Learning Canvas</h1>
        </div>
        <Link className="text-link" to="/study-tools">
          Return to tools
        </Link>
      </header>

      <div className="studio-layout">
        <div className="studio-left">
          <aside className="studio-panel upload-panel">
            <h2>1. Knowledge Sources</h2>
            <p>Upload your own files. Supported formats: txt, md, docx.</p>
            <label className="upload-dropzone" htmlFor="knowledge-files">
              <strong>Upload source files</strong>
              <span>Drop files or click to browse.</span>
            </label>
            <input
              id="knowledge-files"
              className="file-input"
              type="file"
              multiple
              accept={getAcceptedFileTypes()}
              onChange={handleUpload}
            />
            <div className="source-stats">
              <p>{files.length} files loaded</p>
              <p>{totalChars.toLocaleString()} characters</p>
            </div>
            <ul className="source-list">
              {files.map((file) => (
                <li key={file.id}>
                  <div>
                    <strong>{file.name}</strong>
                    <p>{file.chars.toLocaleString()} chars</p>
                  </div>
                  <button type="button" className="text-link" onClick={() => removeFile(file.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="studio-panel prompt-panel">
            <h2>2. Generation Setup</h2>
            <label>
              Learning method
              <select value={skill} onChange={(event) => setSkill(event.target.value as StudySkill)}>
                <option value="auto">Auto decide by AI</option>
                <option value="flash_cards">Flash cards</option>
                <option value="quick_quiz">Quick quiz</option>
                <option value="study_plan">Study plan</option>
              </select>
            </label>
            <label>
              Learning goal
              <textarea value={learningGoal} onChange={(event) => setLearningGoal(event.target.value)} rows={4} />
            </label>
            <label>
              Difficulty
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as "easy" | "medium" | "hard")}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <button type="button" className="button" onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate Interactive Canvas"}
            </button>
            <p className="small-note">Generation uses Edge Function `claude-study` and renders validated JSON DSL, not chat bubbles.</p>
            {error ? <p className="error-text">{error}</p> : null}
          </section>
        </div>

        <section className="studio-panel canvas-panel">
          <h2>3. Interactive Canvas</h2>
          {dsl ? (
            <StudyCanvasRenderer dsl={dsl} />
          ) : (
            <div className="canvas-empty">
              <p>No canvas yet.</p>
              <p>Upload sources on the left, then generate to render the interactive workspace on the right.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
