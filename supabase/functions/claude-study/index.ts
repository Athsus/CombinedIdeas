const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type KnowledgeSource = {
  name: string;
  extension: "txt" | "md" | "docx";
  text: string;
};

type RequestPayload = {
  skill: "auto" | "flash_cards" | "quick_quiz" | "study_plan";
  learningGoal: string;
  difficulty: "easy" | "medium" | "hard";
  knowledgeSources: KnowledgeSource[];
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function ok(body: Record<string, unknown>): Response {
  return jsonResponse({ ok: true, ...body }, 200);
}

function fail(error: string, detail?: unknown): Response {
  return jsonResponse({ ok: false, error, detail }, 200);
}

function extractFirstJsonObject(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function buildPrompt(payload: RequestPayload): string {
  const documents = payload.knowledgeSources
    .map((source, index) => `Source ${index + 1}: ${source.name} (${source.extension})\n${source.text}`)
    .join("\n\n---\n\n");

  const skillInstruction =
    payload.skill === "auto"
      ? "Choose the best method. You may return one method or a mixed strategy."
      : `Use the requested learning method exactly: ${payload.skill}.`;

  return [
    "You are generating a Study Canvas JSON DSL for a learning tool.",
    "Return JSON only. No markdown, no code fences, no extra text.",
    "Keep all content in the same language as the primary knowledge source unless user goal asks otherwise.",
    skillInstruction,
    "Schema:",
    JSON.stringify(
      {
        version: "1.0",
        tool: "study_canvas",
        skill: "flash_cards | quick_quiz | study_plan | mixed",
        title: "string",
        summary: "string",
        modules: [
          {
            type: "flashcards",
            title: "string",
            description: "string",
            cards: [{ id: "string", front: "string", back: "string", hint: "optional string" }],
          },
          {
            type: "quiz",
            title: "string",
            description: "string",
            questions: [{ id: "string", prompt: "string", options: ["string"], answerIndex: 0, explanation: "string" }],
          },
          {
            type: "study_plan",
            title: "string",
            description: "string",
            sessions: [{ id: "string", day: "string", focus: "string", tasks: ["string"] }],
          },
        ],
        actions: ["string"],
      },
      null,
      2,
    ),
    "Constraints:",
    "- version must be 1.0 and tool must be study_canvas",
    "- if skill is flash_cards: one flashcards module with 10-16 cards",
    "- if skill is quick_quiz: one quiz module with 6-12 questions",
    "- if skill is study_plan: one study_plan module with 5-10 sessions",
    "- if skill is auto: choose one method OR mixed with 2 modules max",
    "- plain text only",
    `Learning goal: ${payload.learningGoal}`,
    `Difficulty: ${payload.difficulty}`,
    "Knowledge sources:",
    documents,
  ].join("\n\n");
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return fail("Method not allowed");
    }

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicApiKey) {
      return fail("Missing ANTHROPIC_API_KEY secret in edge function.");
    }

    let payload: RequestPayload;

    try {
      payload = (await request.json()) as RequestPayload;
    } catch {
      return fail("Invalid JSON body.");
    }

    if (!payload.knowledgeSources || payload.knowledgeSources.length === 0) {
      return fail("knowledgeSources is required.");
    }

    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-latest";

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2200,
        temperature: 0.25,
        messages: [{ role: "user", content: buildPrompt(payload) }],
      }),
    });

    if (!anthropicResponse.ok) {
      const text = await anthropicResponse.text();
      return fail("Anthropic request failed.", text);
    }

    const raw = (await anthropicResponse.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const text = (raw.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");

    const jsonString = extractFirstJsonObject(text);

    if (!jsonString) {
      return fail("Claude output did not contain a JSON object.", text);
    }

    try {
      const dsl = JSON.parse(jsonString);
      return ok({ dsl, text });
    } catch {
      return fail("Claude output JSON parse failed.", text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled edge function error.";
    return fail(message);
  }
});
