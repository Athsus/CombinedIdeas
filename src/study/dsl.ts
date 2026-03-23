export type StudySkill = "auto" | "flash_cards" | "quick_quiz" | "study_plan";

export type GeneratedStudySkill = Exclude<StudySkill, "auto"> | "mixed";

export type StudyFlashCard = {
  id: string;
  front: string;
  back: string;
  hint?: string;
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
  title: string;
  summary: string;
  modules: StudyModule[];
  actions: string[];
};

function looksChinese(text: string): boolean {
  return /[\u3400-\u9FFF]/.test(text);
}

export function buildFallbackDsl(knowledgeSummary: string, seedText = ""): StudyCanvasDsl {
  const zh = looksChinese(`${knowledgeSummary}\n${seedText}`);

  return {
    version: "1.0",
    tool: "study_canvas",
    skill: "flash_cards",
    title: zh ? "学习画布（本地回退）" : "Learning Canvas (Local Fallback)",
    summary: knowledgeSummary,
    modules: [
      {
        type: "flashcards",
        title: zh ? "核心概念" : "Core Concepts",
        description: zh
          ? "Claude 暂时不可用。下面是基于你上传内容结构化的起步卡片。"
          : "Claude is temporarily unavailable. Here is a starter deck based on your uploaded content.",
        cards: [
          {
            id: "fallback-1",
            front: zh ? "请总结这份资料最核心的三个主题。" : "Summarize the three most important themes in this source.",
            back: zh
              ? "从定义、关键原理、典型应用三个角度各写一句。"
              : "Write one sentence each for definition, key principle, and practical use.",
          },
          {
            id: "fallback-2",
            front: zh ? "这份资料里最容易混淆的点是什么？" : "What is the most confusing point in this source?",
            back: zh
              ? "把它改写成一个“错误说法 vs 正确说法”的对照。"
              : "Rewrite it as a contrast: common misconception vs correct statement.",
          },
        ],
      },
    ],
    actions: zh ? ["继续生成", "细化目标", "切换学习方法"] : ["Regenerate", "Refine goal", "Switch method"],
  };
}

function extractFirstJsonObject(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function isFlashCard(value: unknown): value is StudyFlashCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Partial<StudyFlashCard>;
  return typeof card.id === "string" && typeof card.front === "string" && typeof card.back === "string";
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
    return Array.isArray(module.cards) && module.cards.length > 0 && module.cards.every((card) => isFlashCard(card));
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

  if (dsl.version !== "1.0" || dsl.tool !== "study_canvas" || !isGeneratedSkill(dsl.skill)) {
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
