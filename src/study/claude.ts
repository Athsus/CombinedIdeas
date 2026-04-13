import { supabase } from "../supabase";
import { parseDslFromText, parseDslPayload, type StudyCanvasDsl, type StudySkill } from "./dsl";
import type { ParsedKnowledgeFile } from "./fileParsers";

export type GenerationStatus = {
  phase: "prepare" | "request" | "parse" | "done";
  message: string;
  at: string;
};

export type GenerateStudyCanvasInput = {
  files: ParsedKnowledgeFile[];
  skill: StudySkill;
  learningGoal: string;
  difficulty: "easy" | "medium" | "hard";
};

export type GenerateStudyCanvasResult = {
  dsl: StudyCanvasDsl;
};

type FunctionResponse = {
  ok?: boolean;
  error?: string;
  detail?: unknown;
  dsl?: unknown;
  text?: string;
};

function emit(
  onStatus: ((status: GenerationStatus) => void) | undefined,
  phase: GenerationStatus["phase"],
  message: string,
): void {
  onStatus?.({
    phase,
    message,
    at: new Date().toISOString(),
  });
}

export async function generateStudyCanvas(
  input: GenerateStudyCanvasInput,
  options?: { onStatus?: (status: GenerationStatus) => void },
): Promise<GenerateStudyCanvasResult> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  emit(options?.onStatus, "prepare", "Preparing source payload...");

  const payload = {
    skill: input.skill,
    learningGoal: input.learningGoal,
    difficulty: input.difficulty,
    knowledgeSources: input.files.map((file) => ({
      name: file.name,
      extension: file.extension,
      text: file.text,
    })),
  };

  emit(options?.onStatus, "request", "Sending request to claude-study edge function...");

  const { data, error } = await supabase.functions.invoke("claude-study", { body: payload });
  const response = (data ?? null) as FunctionResponse | null;

  if (error) {
    const message = response?.error || error.message || "Failed to call claude-study function.";
    const detail = response?.detail ? `\nDetail: ${JSON.stringify(response.detail).slice(0, 400)}` : "";
    throw new Error(message + detail);
  }

  if (response?.ok === false) {
    const detail = response.detail ? `\nDetail: ${JSON.stringify(response.detail).slice(0, 600)}` : "";
    throw new Error((response.error || "Edge function returned an error.") + detail);
  }

  emit(options?.onStatus, "parse", "Validating structured JSON DSL...");

  const fromPayload = parseDslPayload(response?.dsl);
  if (fromPayload) {
    emit(options?.onStatus, "done", "Canvas generated successfully.");
    return {
      dsl: fromPayload,
    };
  }

  const fromText = response?.text ? parseDslFromText(response.text) : null;
  if (fromText) {
    emit(options?.onStatus, "done", "Canvas generated successfully.");
    return {
      dsl: fromText,
    };
  }

  throw new Error("Claude response did not match expected Study DSL.");
}
