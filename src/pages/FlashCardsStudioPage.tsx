import { type ChangeEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { generateStudyCanvas, type GenerationStatus } from "../study/claude";
import { type StudyCanvasDsl, type StudySkill } from "../study/dsl";
import { getAcceptedFileTypes, parseKnowledgeFile, type ParsedKnowledgeFile } from "../study/fileParsers";
import { StudyCanvasRenderer } from "../study/StudyCanvasRenderer";

type CanvasVersion = {
  id: string;
  label: string;
  createdAt: string;
  dsl: StudyCanvasDsl;
};

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function FlashCardsStudioPage() {
  const [files, setFiles] = useState<ParsedKnowledgeFile[]>([]);
  const [skill, setSkill] = useState<StudySkill>("auto");
  const [learningGoal, setLearningGoal] = useState("Understand and retain the core ideas with confident recall.");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationLog, setGenerationLog] = useState<GenerationStatus[]>([]);
  const [versions, setVersions] = useState<CanvasVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  const totalChars = useMemo(() => files.reduce((sum, file) => sum + file.chars, 0), [files]);

  const activeVersion = useMemo(() => {
    if (activeVersionId) {
      return versions.find((version) => version.id === activeVersionId) ?? null;
    }

    return versions[0] ?? null;
  }, [versions, activeVersionId]);

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
    setGenerationLog([]);

    try {
      const generated = await generateStudyCanvas(
        {
          files,
          skill,
          learningGoal,
          difficulty,
        },
        {
          onStatus: (status) => {
            setGenerationLog((previous) => [...previous, status]);
          },
        },
      );

      const createdAt = new Date().toISOString();
      const version: CanvasVersion = {
        id: `v-${Date.now()}`,
        label: `Version ${versions.length + 1}`,
        createdAt,
        dsl: generated.dsl,
      };

      setVersions((previous) => [version, ...previous]);
      setActiveVersionId(version.id);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Generation failed.";
      setError(`${message} No fallback deck is rendered in production mode.`);
      setGenerationLog((previous) => [
        ...previous,
        {
          phase: "done",
          message: "Generation failed. No local fallback rendered.",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyDsl() {
    if (!activeVersion) {
      return;
    }

    await navigator.clipboard.writeText(JSON.stringify(activeVersion.dsl, null, 2));
  }

  function handleDownloadDsl() {
    if (!activeVersion) {
      return;
    }

    const blob = new Blob([JSON.stringify(activeVersion.dsl, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeVersion.label.toLowerCase().replace(/\s+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel flash-studio-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Study Tools / Studio</p>
          <h1>Interactive Canvas Workspace</h1>
        </div>
        <Link className="text-link" to="/study-tools">
          Return to tools
        </Link>
      </header>

      <div className="studio-layout claude-layout">
        <div className="studio-left">
          <aside className="studio-panel upload-panel">
            <h2>Knowledge Sources</h2>
            <p>Accepted formats: txt, md, docx.</p>
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
            <h2>Generation Setup</h2>
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
              {isLoading ? "Generating..." : "Generate Artifact"}
            </button>
            <p className="small-note">Production mode: only validated JSON DSL is rendered.</p>
            {generationLog.length > 0 ? (
              <div className="generation-status" aria-live="polite">
                {generationLog.map((step, index) => (
                  <p key={`${step.at}-${index}`} className={`generation-step ${isLoading && index === generationLog.length - 1 ? "active" : ""}`}>
                    <span>{step.phase}</span>
                    <strong>{step.message}</strong>
                  </p>
                ))}
              </div>
            ) : null}
            {error ? <p className="error-text">{error}</p> : null}
          </section>
        </div>

        <section className="studio-panel canvas-panel artifact-panel">
          <div className="artifact-head">
            <div>
              <p className="eyebrow">Artifact</p>
              <h2>{activeVersion?.dsl.title ?? "No artifact yet"}</h2>
            </div>
            <div className="artifact-actions">
              <label className="version-picker" htmlFor="version-select">
                <span>Version</span>
                <select
                  id="version-select"
                  value={activeVersion?.id ?? ""}
                  onChange={(event) => setActiveVersionId(event.target.value)}
                  disabled={versions.length === 0}
                >
                  {versions.length === 0 ? <option value="">None</option> : null}
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label} · {formatShortTime(version.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="button secondary" disabled={!activeVersion} onClick={() => void handleCopyDsl()}>
                Copy JSON
              </button>
              <button type="button" className="button secondary" disabled={!activeVersion} onClick={handleDownloadDsl}>
                Download
              </button>
            </div>
          </div>

          <div className="artifact-body">
            {activeVersion ? (
              <StudyCanvasRenderer dsl={activeVersion.dsl} />
            ) : (
              <div className="canvas-empty">
                <p>No artifact generated yet.</p>
                <p>Upload files and generate to open your first interactive canvas version.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
