import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TodoRecord = {
  id: string;
  owner_id: string;
  title: string;
  details: string | null;
  project_name: string;
  section_name: string;
  goal_name: string | null;
  is_milestone: boolean;
  google_calendar_event_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RequestBody = {
  action?: "sync_calendar";
  message?: string;
  providerToken?: string | null;
  autoSyncCalendar?: boolean;
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

function parseRelativeDate(text: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (text.includes("tomorrow")) {
    today.setDate(today.getDate() + 1);
    return today.toISOString().slice(0, 10);
  }

  if (text.includes("today")) {
    return today.toISOString().slice(0, 10);
  }

  const explicit = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return explicit ? explicit[1] : null;
}

function extractField(text: string, prefix: string): string | null {
  const match = text.match(new RegExp(`${prefix}\\s+([a-z0-9 _-]+)`, "i"));
  return match ? match[1].trim() : null;
}

function extractTitle(text: string): string {
  const quoted = text.match(/"([^"]+)"/);
  if (quoted) {
    return quoted[1].trim();
  }

  return text
    .replace(/\b(add|create|new|task|todo|please)\b/gi, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\bproject\s+[a-z0-9 _-]+\b/gi, "")
    .replace(/\bsection\s+[a-z0-9 _-]+\b/gi, "")
    .replace(/\bgoal\s+[a-z0-9 _-]+\b/gi, "")
    .replace(/\bmilestone\b/gi, "")
    .replace(/\b(20\d{2}-\d{2}-\d{2})\b/g, "")
    .trim();
}

function matchTodo(todos: TodoRecord[], text: string): TodoRecord | null {
  const quoted = text.match(/"([^"]+)"/)?.[1]?.trim().toLowerCase();
  const lookup = quoted ?? text.toLowerCase();

  return (
    todos.find((todo) => todo.title.toLowerCase() === lookup) ??
    todos.find((todo) => lookup.includes(todo.title.toLowerCase()) || todo.title.toLowerCase().includes(lookup)) ??
    null
  );
}

function calendarEventPayload(todo: TodoRecord) {
  const dueDate = todo.due_date as string;
  const nextDay = new Date(`${dueDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);

  return {
    summary: todo.is_milestone ? `Milestone: ${todo.title}` : todo.title,
    description: [
      todo.details ?? "",
      `Project: ${todo.project_name}`,
      `Section: ${todo.section_name}`,
      todo.goal_name ? `Goal: ${todo.goal_name}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    start: { date: dueDate },
    end: { date: nextDay.toISOString().slice(0, 10) },
  };
}

async function syncGoogleCalendar(
  supabase: ReturnType<typeof createClient>,
  todos: TodoRecord[],
  providerToken: string,
): Promise<number> {
  let synced = 0;

  for (const todo of todos) {
    if (todo.completed_at && todo.google_calendar_event_id) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${todo.google_calendar_event_id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${providerToken}`,
        },
      });

      await supabase.from("todos").update({ google_calendar_event_id: null }).eq("id", todo.id);
      synced += 1;
      continue;
    }

    if (!todo.due_date || todo.completed_at) {
      continue;
    }

    const method = todo.google_calendar_event_id ? "PATCH" : "POST";
    const endpoint = todo.google_calendar_event_id
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${todo.google_calendar_event_id}`
      : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    const response = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(calendarEventPayload(todo)),
    });

    if (!response.ok) {
      throw new Error(`Google Calendar sync failed for "${todo.title}".`);
    }

    const event = await response.json();
    await supabase.from("todos").update({ google_calendar_event_id: event.id }).eq("id", todo.id);
    synced += 1;
  }

  return synced;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse({ ok: false, error: "Missing authorization header." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ ok: false, error: "Supabase runtime env is missing." }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ ok: false, error: "User not authenticated." }, 401);
    }

    const body = (await req.json()) as RequestBody;
    const providerToken = body.providerToken ?? null;

    if (body.action === "sync_calendar") {
      if (!providerToken) {
        return jsonResponse({ ok: false, error: "Google provider token is required for calendar sync." }, 200);
      }

      const { data: allTodos, error } = await supabase
        .from("todos")
        .select("id, owner_id, title, details, project_name, section_name, goal_name, is_milestone, google_calendar_event_id, due_date, completed_at, created_at, updated_at");

      if (error) {
        throw error;
      }

      const synced = await syncGoogleCalendar(supabase, (allTodos ?? []) as TodoRecord[], providerToken);
      const { data: refreshed } = await supabase
        .from("todos")
        .select("id, owner_id, title, details, project_name, section_name, goal_name, is_milestone, google_calendar_event_id, due_date, completed_at, created_at, updated_at");

      return jsonResponse({ ok: true, synced, todos: refreshed ?? [] });
    }

    const message = (body.message ?? "").trim();

    if (!message) {
      return jsonResponse({ ok: false, error: "Message is required." }, 200);
    }

    const { data: currentTodos, error: listError } = await supabase
      .from("todos")
      .select("id, owner_id, title, details, project_name, section_name, goal_name, is_milestone, google_calendar_event_id, due_date, completed_at, created_at, updated_at");

    if (listError) {
      throw listError;
    }

    const todos = (currentTodos ?? []) as TodoRecord[];
    const lower = message.toLowerCase();
    let reply = "Done.";

    if (/\b(show|list|what|which)\b/.test(lower)) {
      const matches = todos.filter((todo) => {
        if (lower.includes("today")) {
          return todo.due_date === parseRelativeDate("today");
        }
        if (lower.includes("completed")) {
          return Boolean(todo.completed_at);
        }
        return true;
      });

      reply =
        matches.length === 0
          ? "No matching tasks."
          : `Found ${matches.length} task${matches.length === 1 ? "" : "s"}: ${matches.slice(0, 5).map((todo) => todo.title).join(", ")}.`;
    } else if (/\b(delete|remove)\b/.test(lower)) {
      const target = matchTodo(todos, lower);
      if (!target) {
        return jsonResponse({ ok: false, error: "I could not find the task to delete." }, 200);
      }

      const { error } = await supabase.from("todos").delete().eq("id", target.id);
      if (error) {
        throw error;
      }
      reply = `Deleted "${target.title}".`;
    } else if (/\b(complete|finish|done|tick)\b/.test(lower)) {
      const target = matchTodo(todos, lower);
      if (!target) {
        return jsonResponse({ ok: false, error: "I could not find the task to complete." }, 200);
      }

      const { error } = await supabase
        .from("todos")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", target.id);
      if (error) {
        throw error;
      }
      reply = `Marked "${target.title}" as done.`;
    } else if (/\b(move)\b/.test(lower)) {
      const target = matchTodo(todos, lower);
      const sectionName = extractField(lower, "to");
      if (!target || !sectionName) {
        return jsonResponse({ ok: false, error: 'Use something like: move "Task name" to waiting.' }, 200);
      }

      const { error } = await supabase.from("todos").update({ section_name: sectionName }).eq("id", target.id);
      if (error) {
        throw error;
      }
      reply = `Moved "${target.title}" to ${sectionName}.`;
    } else if (/\b(edit|rename|update|set due)\b/.test(lower)) {
      const target = matchTodo(todos, lower);
      if (!target) {
        return jsonResponse({ ok: false, error: "I could not find the task to update." }, 200);
      }

      const nextDueDate = parseRelativeDate(lower);
      const projectName = extractField(lower, "project");
      const sectionName = extractField(lower, "section");
      const goalName = extractField(lower, "goal");
      const isMilestone = /\bmilestone\b/.test(lower);

      const { error } = await supabase
        .from("todos")
        .update({
          due_date: nextDueDate ?? target.due_date,
          project_name: projectName ?? target.project_name,
          section_name: sectionName ?? target.section_name,
          goal_name: goalName ?? target.goal_name,
          is_milestone: isMilestone || target.is_milestone,
        })
        .eq("id", target.id);

      if (error) {
        throw error;
      }
      reply = `Updated "${target.title}".`;
    } else {
      const title = extractTitle(lower);
      if (!title) {
        return jsonResponse({ ok: false, error: "I could not understand the task title." }, 200);
      }

      const dueDate = parseRelativeDate(lower);
      const projectName = extractField(lower, "project") ?? "Personal";
      const sectionName = extractField(lower, "section") ?? "Inbox";
      const goalName = extractField(lower, "goal");
      const isMilestone = /\bmilestone\b/.test(lower);

      const { error } = await supabase.from("todos").insert({
        title,
        due_date: dueDate,
        project_name: projectName,
        section_name: sectionName,
        goal_name: goalName,
        is_milestone: isMilestone,
      });

      if (error) {
        throw error;
      }
      reply = `Added "${title}".`;
    }

    let synced = 0;

    const { data: refreshedTodos, error: refreshError } = await supabase
      .from("todos")
      .select("id, owner_id, title, details, project_name, section_name, goal_name, is_milestone, google_calendar_event_id, due_date, completed_at, created_at, updated_at");

    if (refreshError) {
      throw refreshError;
    }

    if (body.autoSyncCalendar && providerToken) {
      synced = await syncGoogleCalendar(supabase, (refreshedTodos ?? []) as TodoRecord[], providerToken);
      reply += ` Synced ${synced} calendar item${synced === 1 ? "" : "s"}.`;
    }

    return jsonResponse({
      ok: true,
      reply,
      synced,
      todos: refreshedTodos ?? [],
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error.",
      },
      200,
    );
  }
});
