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

type AnthropicResult = {
  ok: boolean;
  text: string;
  status: number;
  requestId: string | null;
};

type DomainProfile = {
  kind: "english_learning" | "general";
  confidence: number;
  evidence: string[];
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

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "that",
    "with",
    "from",
    "this",
    "have",
    "will",
    "into",
    "your",
    "about",
    "topic",
    "notes",
    "file",
    "draft",
    "chapter",
  ]);

  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));

  return Array.from(new Set(terms)).slice(0, 20);
}

function summarizeSource(source: KnowledgeSource): string {
  const filenameKeywords = extractKeywords(source.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
  const bodyKeywords = extractKeywords(source.text).slice(0, 12);
  const keywords = Array.from(new Set([...filenameKeywords, ...bodyKeywords])).slice(0, 12);

  return `- ${source.name}: keywords => ${keywords.join(", ") || "n/a"}`;
}

function getAllowedSourceRefs(payload: RequestPayload): string[] {
  return payload.knowledgeSources.map((source) => source.name);
}

function inferDomainProfile(payload: RequestPayload): DomainProfile {
  const combined = payload.knowledgeSources
    .map((source) => `${source.name}\n${source.text.slice(0, 4000)}`)
    .join("\n")
    .toLowerCase();

  const indicators = ["ielts", "toefl", "english", "vocabulary", "grammar", "speaking", "reading", "listening", "writing", "phrase"];
  const evidence = indicators.filter((word) => combined.includes(word));

  if (evidence.length >= 2) {
    return {
      kind: "english_learning",
      confidence: Math.min(1, 0.4 + evidence.length * 0.1),
      evidence,
    };
  }

  return {
    kind: "general",
    confidence: 0.55,
    evidence: evidence.slice(0, 3),
  };
}

function validateSourceRefs(dsl: unknown, allowedRefs: string[]): { ok: boolean; reason?: string } {
  if (!dsl || typeof dsl !== "object") {
    return { ok: false, reason: "DSL must be a JSON object." };
  }

  const dslRecord = dsl as Record<string, unknown>;
  if (!Array.isArray(dslRecord.modules)) {
    return { ok: false, reason: "DSL.modules must be an array." };
  }

  const moduleList = dslRecord.modules as Array<Record<string, unknown>>;
  const flashModules = moduleList.filter((module) => module.type === "flashcards");
  if (flashModules.length === 0) {
    return { ok: true };
  }

  for (const module of flashModules) {
    const cards = module.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      return { ok: false, reason: "Flashcards module must contain cards." };
    }

    for (const card of cards) {
      if (!card || typeof card !== "object") {
        return { ok: false, reason: "Invalid flashcard entry." };
      }

      const refs = (card as Record<string, unknown>).sourceRefs;
      if (!Array.isArray(refs) || refs.length === 0) {
        return { ok: false, reason: "Every flashcard must include non-empty sourceRefs." };
      }

      const invalid = refs.find((ref) => typeof ref !== "string" || !allowedRefs.includes(ref));
      if (invalid !== undefined) {
        return { ok: false, reason: `sourceRefs must use exact uploaded filenames. Invalid ref: ${String(invalid)}` };
      }
    }
  }

  return { ok: true };
}

function validateDomainGrounding(dsl: unknown, profile: DomainProfile): { ok: boolean; reason?: string } {
  if (profile.kind !== "english_learning") {
    return { ok: true };
  }

  const text = JSON.stringify(dsl).toLowerCase();
  const targetTerms = ["english", "vocabulary", "grammar", "ielts", "writing", "speaking", "reading", "listening", "phrase"];
  const hits = targetTerms.filter((term) => text.includes(term));

  if (hits.length < 2) {
    return {
      ok: false,
      reason: `Likely domain mismatch. Expected English-learning content due to sources, but found too few English-learning terms. Hits: ${hits.join(", ")}`,
    };
  }

  return { ok: true };
}

function buildPrompt(payload: RequestPayload): string {
  const allowedRefs = getAllowedSourceRefs(payload);
  const domainProfile = inferDomainProfile(payload);
  const documents = payload.knowledgeSources
    .map((source, index) => `Source ${index + 1}: ${source.name} (${source.extension})\n${source.text}`)
    .join("\n\n---\n\n");
  const sourceProfiles = payload.knowledgeSources.map((source) => summarizeSource(source)).join("\n");

  const skillInstruction =
    payload.skill === "auto"
      ? "Choose the best method. You may return one method or a mixed strategy."
      : `Use the requested learning method exactly: ${payload.skill}.`;

  return [
    "You are generating a Study Canvas JSON DSL for a production UI.",
    "Return JSON only. No markdown, no code fences, no extra text.",
    "All output must be English.",
    "Do not output placeholders, templates, TODO text, or generic filler.",
    "All learning content must be derived from the supplied knowledge sources.",
    "Stay on-topic with the uploaded files. Never switch to unrelated domains.",
    `Inferred primary domain: ${domainProfile.kind} (confidence: ${domainProfile.confidence.toFixed(2)}, evidence: ${domainProfile.evidence.join(", ") || "none"}).`,
    domainProfile.kind === "english_learning"
      ? "Hard rule: this canvas must teach English learning content (IELTS/English vocabulary/usage). Finance/business themes are invalid unless directly present in sources."
      : "Hard rule: keep the generated content aligned with the inferred source domain.",
    skillInstruction,
    "Flashcard Rendering Rule v1 (strict):",
    "- Front side shows: label + prompt",
    "- Back side shows: answer + example + checkpoint",
    "- Controls are AI-defined labels mapped to valid actions",
    "- Every flash card must include difficulty and mode",
    "- Every flash card must include sourceRefs and each value must exactly match one uploaded filename",
    "- mode must be one of: concept | compare | process | application",
    "- difficulty must be one of: easy | medium | hard",
    "- Keep each field concise and scan-friendly",
    "- controls.action must be one of: prev_card | next_card | flip_card | mark_known | mark_again",
    "- controls.style must be one of: primary | secondary | ghost",
    "Schema:",
    JSON.stringify(
      {
        version: "1.0",
        tool: "study_canvas",
        skill: "flash_cards | quick_quiz | study_plan | mixed",
        language: "en",
        title: "string",
        summary: "string",
        modules: [
          {
            type: "flashcards",
            title: "string",
            description: "string",
            controls: [{ action: "prev_card | next_card | flip_card | mark_known | mark_again", label: "string", style: "primary | secondary | ghost" }],
            cards: [
              {
                id: "string",
                label: "string",
                prompt: "string",
                answer: "string",
                example: "string",
                checkpoint: "string",
                difficulty: "easy | medium | hard",
                mode: "concept | compare | process | application",
                sourceRefs: ["exact filename from uploaded sources"],
              },
            ],
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
    "- language must be en",
    "- if skill is flash_cards: one flashcards module with 10-16 cards",
    "- if skill is quick_quiz: one quiz module with 6-12 questions",
    "- if skill is study_plan: one study_plan module with 5-10 sessions",
    "- if skill is auto: choose one method OR mixed with 2 modules max",
    "- if a flashcards module is present, controls are optional (0-5)",
    "- include controls only when useful for the learning flow; do not force generic controls",
    "- if controls are present, keep actions unique",
    "- sourceRefs must only use this allowed filename list:",
    allowedRefs.join(", "),
    "- plain text only",
    `Learning goal: ${payload.learningGoal}`,
    `Difficulty: ${payload.difficulty}`,
    "Source profile summary:",
    sourceProfiles,
    "Knowledge sources:",
    documents,
  ].join("\n\n");
}

function buildRepairPrompt(rawText: string, allowedRefs: string[]): string {
  return [
    "Convert the following model output into ONE valid JSON object.",
    "Return JSON only. No markdown.",
    "Preserve meaning. Keep all content in English.",
    "For flashcards: include controls and ensure each card.sourceRefs uses exact filenames only from this list:",
    allowedRefs.join(", "),
    "Controls may be empty if unnecessary.",
    "Text:",
    rawText,
  ].join("\n\n");
}

async function callAnthropic(
  prompt: string,
  model: string,
  apiKey: string,
  maxTokens: number,
  thinkingBudget: number,
  attemptWithoutThinking = false,
): Promise<AnthropicResult> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  };

  if (!attemptWithoutThinking && thinkingBudget > 0) {
    body.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget,
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const requestId = response.headers.get("request-id") || response.headers.get("anthropic-request-id");

  if (!response.ok) {
    const errorText = await response.text();

    if (!attemptWithoutThinking && response.status === 400 && errorText.toLowerCase().includes("thinking")) {
      return callAnthropic(prompt, model, apiKey, maxTokens, thinkingBudget, true);
    }

    return {
      ok: false,
      text: errorText,
      status: response.status,
      requestId,
    };
  }

  const raw = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = (raw.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");

  return {
    ok: true,
    text,
    status: response.status,
    requestId,
  };
}

function parseJsonCandidates(text: string): unknown[] {
  const candidates: string[] = [];
  const trimmed = text.trim();

  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  }

  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fencedRegex)) {
    if (match[1]) {
      candidates.push(match[1].trim());
    }
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          candidates.push(trimmed.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  const parsed: unknown[] = [];
  for (const candidate of candidates) {
    try {
      parsed.push(JSON.parse(candidate));
    } catch {
      // keep trying
    }
  }

  return parsed;
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

    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5";
    const thinkingBudget = Number(Deno.env.get("ANTHROPIC_THINKING_BUDGET") ?? "2048");
    const allowedRefs = getAllowedSourceRefs(payload);
    const domainProfile = inferDomainProfile(payload);

    const first = await callAnthropic(buildPrompt(payload), model, anthropicApiKey, 2600, thinkingBudget);
    if (!first.ok) {
      return fail("Anthropic request failed.", {
        status: first.status,
        requestId: first.requestId,
        body: first.text,
      });
    }

    const firstParsed = parseJsonCandidates(first.text);
    if (firstParsed.length > 0) {
      const grounded = validateSourceRefs(firstParsed[0], allowedRefs);
      if (!grounded.ok) {
        return fail("Claude output failed source grounding validation.", { reason: grounded.reason, allowedRefs });
      }

      const domainCheck = validateDomainGrounding(firstParsed[0], domainProfile);
      if (!domainCheck.ok) {
        return fail("Claude output failed domain validation.", {
          reason: domainCheck.reason,
          inferredDomain: domainProfile,
        });
      }

      return ok({
        dsl: firstParsed[0],
        text: first.text,
      });
    }

    const repair = await callAnthropic(buildRepairPrompt(first.text, allowedRefs), model, anthropicApiKey, 1800, thinkingBudget);
    if (!repair.ok) {
      return fail("Claude output JSON parse failed and repair request failed.", {
        firstRequestId: first.requestId,
        repairRequestId: repair.requestId,
        firstPreview: first.text.slice(0, 1000),
        repairStatus: repair.status,
        repairBody: repair.text,
      });
    }

    const repairParsed = parseJsonCandidates(repair.text);
    if (repairParsed.length > 0) {
      const grounded = validateSourceRefs(repairParsed[0], allowedRefs);
      if (!grounded.ok) {
        return fail("Claude repaired output failed source grounding validation.", { reason: grounded.reason, allowedRefs });
      }

      const domainCheck = validateDomainGrounding(repairParsed[0], domainProfile);
      if (!domainCheck.ok) {
        return fail("Claude repaired output failed domain validation.", {
          reason: domainCheck.reason,
          inferredDomain: domainProfile,
        });
      }

      return ok({
        dsl: repairParsed[0],
        text: repair.text,
      });
    }

    return fail("Claude output JSON parse failed.", {
      model,
      firstRequestId: first.requestId,
      repairRequestId: repair.requestId,
      firstPreview: first.text.slice(0, 1000),
      repairPreview: repair.text.slice(0, 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled edge function error.";
    return fail(message);
  }
});
