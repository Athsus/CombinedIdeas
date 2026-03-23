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
  skill: "flash_cards";
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

  return [
    "You are generating a Study Canvas JSON DSL for a learning tool.",
    "Return JSON only. No markdown, no code fences, no extra text.",
    "Schema:",
    JSON.stringify(
      {
        version: "1.0",
        tool: "study_canvas",
        skill: "flash_cards",
        title: "string",
        summary: "string",
        modules: [
          {
            type: "flashcards",
            title: "string",
            description: "string",
            cards: [
              {
                id: "string",
                front: "string",
                back: "string",
                hint: "optional string",
              },
            ],
          },
        ],
        actions: ["string"],
      },
      null,
      2,
    ),
    "Constraints:",
    "- skill must be flash_cards",
    "- produce exactly one flashcards module",
    "- generate between 10 and 16 cards",
    "- cards should be concise and test understanding, not trivia",
    "- use plain text only",
    "- actions should be short actionable labels",
    `Learning goal: ${payload.learningGoal}`,
    `Difficulty: ${payload.difficulty}`,
    "Knowledge sources:",
    documents,
  ].join("\n\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!anthropicApiKey) {
    return jsonResponse({ error: "Missing ANTHROPIC_API_KEY secret in edge function." }, 500);
  }

  let payload: RequestPayload;

  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!payload.knowledgeSources || payload.knowledgeSources.length === 0) {
    return jsonResponse({ error: "knowledgeSources is required." }, 400);
  }

  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-7-sonnet-latest";

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
      messages: [
        {
          role: "user",
          content: buildPrompt(payload),
        },
      ],
    }),
  });

  if (!anthropicResponse.ok) {
    const text = await anthropicResponse.text();
    return jsonResponse({ error: `Anthropic request failed: ${text}` }, 502);
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
    return jsonResponse({ error: "Claude output did not contain a JSON object.", text }, 502);
  }

  try {
    const dsl = JSON.parse(jsonString);
    return jsonResponse({ dsl, text });
  } catch {
    return jsonResponse({ error: "Claude output JSON parse failed.", text }, 502);
  }
});
