import { supabase } from "../supabase";
import { parseDslFromText, parseDslPayload, type StudyCanvasDsl, type StudySkill } from "./dsl";
import type { ParsedKnowledgeFile } from "./fileParsers";

export type GenerateStudyCanvasInput = {
  files: ParsedKnowledgeFile[];
  skill: StudySkill;
  learningGoal: string;
  difficulty: "easy" | "medium" | "hard";
};

export async function generateStudyCanvas(input: GenerateStudyCanvasInput): Promise<StudyCanvasDsl> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

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

  const { data, error } = await supabase.functions.invoke("claude-study", { body: payload });

  if (error) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || error.message || "Failed to call claude-study function.");
  }

  const fromPayload = parseDslPayload((data as { dsl?: unknown } | null)?.dsl);
  if (fromPayload) {
    return fromPayload;
  }

  const raw = (data as { text?: string } | null)?.text;
  const fromText = raw ? parseDslFromText(raw) : null;

  if (!fromText) {
    const functionError = (data as { error?: string } | null)?.error;
    throw new Error(functionError || "Claude response did not match expected Study DSL.");
  }

  return fromText;
}
