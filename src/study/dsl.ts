export type StudySkill = "flash_cards";

export type StudyFlashCard = {
  id: string;
  front: string;
  back: string;
  hint?: string;
};

export type StudyModule = {
  type: "flashcards";
  title: string;
  description: string;
  cards: StudyFlashCard[];
};

export type StudyCanvasDsl = {
  version: "1.0";
  tool: "study_canvas";
  skill: StudySkill;
  title: string;
  summary: string;
  modules: StudyModule[];
  actions: string[];
};

export function buildFallbackDsl(knowledgeSummary: string): StudyCanvasDsl {
  return {
    version: "1.0",
    tool: "study_canvas",
    skill: "flash_cards",
    title: "Generated Flash Cards",
    summary: knowledgeSummary,
    modules: [
      {
        type: "flashcards",
        title: "Core Concepts",
        description: "Review these seed cards while Claude output is unavailable.",
        cards: [
          {
            id: "fallback-1",
            front: "What is the key topic in your uploaded knowledge source?",
            back: "The key topic is extracted from your documents. Re-run generation for a model-backed deck.",
          },
          {
            id: "fallback-2",
            front: "How should you use this tool?",
            back: "Upload sources, generate cards, click each card to flip, and mark known vs review.",
          },
        ],
      },
    ],
    actions: ["Start review", "Shuffle deck", "Generate another deck"],
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

function isStudyDsl(value: unknown): value is StudyCanvasDsl {
  if (!value || typeof value !== "object") {
    return false;
  }

  const dsl = value as Partial<StudyCanvasDsl>;

  if (dsl.version !== "1.0" || dsl.tool !== "study_canvas" || dsl.skill !== "flash_cards") {
    return false;
  }

  if (typeof dsl.title !== "string" || typeof dsl.summary !== "string" || !Array.isArray(dsl.modules) || !Array.isArray(dsl.actions)) {
    return false;
  }

  return dsl.modules.every((module) => {
    if (!module || typeof module !== "object") {
      return false;
    }

    const current = module as Partial<StudyModule>;

    return (
      current.type === "flashcards" &&
      typeof current.title === "string" &&
      typeof current.description === "string" &&
      Array.isArray(current.cards) &&
      current.cards.every((card) => isFlashCard(card))
    );
  });
}

export function parseDslPayload(payload: unknown): StudyCanvasDsl | null {
  if (isStudyDsl(payload)) {
    return payload;
  }

  return null;
}

export function parseDslFromText(text: string): StudyCanvasDsl | null {
  const jsonText = extractFirstJsonObject(text);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parseDslPayload(parsed);
  } catch {
    return null;
  }
}
