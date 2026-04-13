export type StudySkill = "auto" | "flash_cards" | "quick_quiz" | "study_plan";

export type GeneratedStudySkill = Exclude<StudySkill, "auto"> | "mixed";

export type FlashCardDifficulty = "easy" | "medium" | "hard";

export type FlashCardMode = "concept" | "compare" | "process" | "application";

export type StudyFlashCard = {
  id: string;
  label: string;
  prompt: string;
  answer: string;
  example: string;
  checkpoint: string;
  difficulty: FlashCardDifficulty;
  mode: FlashCardMode;
  sourceRefs: string[];
};

export type FlashControlAction = "prev_card" | "next_card" | "flip_card" | "mark_known" | "mark_again";

export type FlashControlStyle = "primary" | "secondary" | "ghost";

export type FlashDeckControl = {
  action: FlashControlAction;
  label: string;
  style: FlashControlStyle;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type StudyPlanSession = {
  id: string;
  day: string;
  focus: string;
  tasks: string[];
};

export type FlashCardsModule = {
  type: "flashcards";
  title: string;
  description: string;
  cards: StudyFlashCard[];
  controls?: FlashDeckControl[];
};

export type QuizModule = {
  type: "quiz";
  title: string;
  description: string;
  questions: QuizQuestion[];
};

export type PlanModule = {
  type: "study_plan";
  title: string;
  description: string;
  sessions: StudyPlanSession[];
};

export type StudyModule = FlashCardsModule | QuizModule | PlanModule;

export type StudyCanvasDsl = {
  version: "1.0";
  tool: "study_canvas";
  skill: GeneratedStudySkill;
  language: "en";
  title: string;
  summary: string;
  modules: StudyModule[];
  actions: string[];
};

function extractFirstJsonObject(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function isFlashCardDifficulty(value: unknown): value is FlashCardDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isFlashCardMode(value: unknown): value is FlashCardMode {
  return value === "concept" || value === "compare" || value === "process" || value === "application";
}

function isFlashCard(value: unknown): value is StudyFlashCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Partial<StudyFlashCard>;
  return (
    typeof card.id === "string" &&
    typeof card.label === "string" &&
    typeof card.prompt === "string" &&
    typeof card.answer === "string" &&
    typeof card.example === "string" &&
    typeof card.checkpoint === "string" &&
    isFlashCardDifficulty(card.difficulty) &&
    isFlashCardMode(card.mode) &&
    Array.isArray(card.sourceRefs) &&
    card.sourceRefs.length > 0 &&
    card.sourceRefs.every((item) => typeof item === "string")
  );
}

function isFlashControlAction(value: unknown): value is FlashControlAction {
  return value === "prev_card" || value === "next_card" || value === "flip_card" || value === "mark_known" || value === "mark_again";
}

function isFlashControlStyle(value: unknown): value is FlashControlStyle {
  return value === "primary" || value === "secondary" || value === "ghost";
}

function isFlashDeckControl(value: unknown): value is FlashDeckControl {
  if (!value || typeof value !== "object") {
    return false;
  }

  const control = value as Partial<FlashDeckControl>;
  return isFlashControlAction(control.action) && typeof control.label === "string" && isFlashControlStyle(control.style);
}

function isQuizQuestion(value: unknown): value is QuizQuestion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const question = value as Partial<QuizQuestion>;
  return (
    typeof question.id === "string" &&
    typeof question.prompt === "string" &&
    Array.isArray(question.options) &&
    question.options.length >= 2 &&
    question.options.every((item) => typeof item === "string") &&
    typeof question.answerIndex === "number" &&
    question.answerIndex >= 0 &&
    question.answerIndex < question.options.length &&
    typeof question.explanation === "string"
  );
}

function isStudyPlanSession(value: unknown): value is StudyPlanSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<StudyPlanSession>;
  return (
    typeof session.id === "string" &&
    typeof session.day === "string" &&
    typeof session.focus === "string" &&
    Array.isArray(session.tasks) &&
    session.tasks.length > 0 &&
    session.tasks.every((task) => typeof task === "string")
  );
}

function isGeneratedSkill(value: unknown): value is GeneratedStudySkill {
  return value === "flash_cards" || value === "quick_quiz" || value === "study_plan" || value === "mixed";
}

function isModule(value: unknown): value is StudyModule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const module = value as Partial<StudyModule> & Record<string, unknown>;

  if (typeof module.title !== "string" || typeof module.description !== "string") {
    return false;
  }

  if (module.type === "flashcards") {
    return (
      Array.isArray(module.cards) &&
      module.cards.length > 0 &&
      module.cards.every((card) => isFlashCard(card)) &&
      (module.controls === undefined || (Array.isArray(module.controls) && module.controls.every((control) => isFlashDeckControl(control))))
    );
  }

  if (module.type === "quiz") {
    return Array.isArray(module.questions) && module.questions.length > 0 && module.questions.every((question) => isQuizQuestion(question));
  }

  if (module.type === "study_plan") {
    return Array.isArray(module.sessions) && module.sessions.length > 0 && module.sessions.every((session) => isStudyPlanSession(session));
  }

  return false;
}

function isStudyDsl(value: unknown): value is StudyCanvasDsl {
  if (!value || typeof value !== "object") {
    return false;
  }

  const dsl = value as Partial<StudyCanvasDsl>;

  if (dsl.version !== "1.0" || dsl.tool !== "study_canvas" || !isGeneratedSkill(dsl.skill) || dsl.language !== "en") {
    return false;
  }

  if (typeof dsl.title !== "string" || typeof dsl.summary !== "string" || !Array.isArray(dsl.modules) || !Array.isArray(dsl.actions)) {
    return false;
  }

  return dsl.modules.every((module) => isModule(module)) && dsl.actions.every((action) => typeof action === "string");
}

export function parseDslPayload(payload: unknown): StudyCanvasDsl | null {
  return isStudyDsl(payload) ? payload : null;
}

export function parseDslFromText(text: string): StudyCanvasDsl | null {
  const jsonText = extractFirstJsonObject(text);

  if (!jsonText) {
    return null;
  }

  try {
    return parseDslPayload(JSON.parse(jsonText) as unknown);
  } catch {
    return null;
  }
}
