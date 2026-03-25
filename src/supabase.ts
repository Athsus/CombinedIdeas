import { createClient, type Session } from "@supabase/supabase-js";

export type GomokuSessionRecord = {
  outcome: "black_win" | "white_win" | "draw" | "abandoned";
  winner: "black" | "white" | null;
  move_count: number;
  board_size: number;
  duration_ms: number;
  started_at: string;
  finished_at: string;
};

export type TodoRecord = {
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    : null;

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInWithGoogle(scopes = "https://www.googleapis.com/auth/calendar.events"): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}#/todo`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function insertGomokuSession(record: GomokuSessionRecord): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("gomoku_sessions").insert(record);

  if (error) {
    throw error;
  }
}

export async function listTodos(): Promise<TodoRecord[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("todos")
    .select("id, owner_id, title, details, project_name, section_name, goal_name, is_milestone, google_calendar_event_id, due_date, completed_at, created_at, updated_at")
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("project_name", { ascending: true })
    .order("section_name", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data satisfies TodoRecord[];
}

export async function createTodo(input: {
  title: string;
  details?: string | null;
  dueDate?: string | null;
  projectName?: string;
  sectionName?: string;
  goalName?: string | null;
  isMilestone?: boolean;
}): Promise<TodoRecord> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("todos")
    .insert({
      title: input.title,
      details: input.details ?? null,
      project_name: input.projectName ?? "Personal",
      section_name: input.sectionName ?? "Inbox",
      goal_name: input.goalName ?? null,
      is_milestone: input.isMilestone ?? false,
      due_date: input.dueDate ?? null,
    })
    .select("id, owner_id, title, details, project_name, section_name, goal_name, is_milestone, google_calendar_event_id, due_date, completed_at, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data satisfies TodoRecord;
}

export async function updateTodo(
  id: string,
  input: {
    title?: string;
    details?: string | null;
    projectName?: string;
    sectionName?: string;
    goalName?: string | null;
    isMilestone?: boolean;
    dueDate?: string | null;
    completedAt?: string | null;
  },
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const updatePayload: Record<string, string | boolean | null> = {};

  if (input.title !== undefined) {
    updatePayload.title = input.title;
  }

  if (input.details !== undefined) {
    updatePayload.details = input.details;
  }

  if (input.projectName !== undefined) {
    updatePayload.project_name = input.projectName;
  }

  if (input.sectionName !== undefined) {
    updatePayload.section_name = input.sectionName;
  }

  if (input.goalName !== undefined) {
    updatePayload.goal_name = input.goalName;
  }

  if (input.isMilestone !== undefined) {
    updatePayload.is_milestone = input.isMilestone;
  }

  if (input.dueDate !== undefined) {
    updatePayload.due_date = input.dueDate;
  }

  if (input.completedAt !== undefined) {
    updatePayload.completed_at = input.completedAt;
  }

  const { error } = await supabase.from("todos").update(updatePayload).eq("id", id);

  if (error) {
    throw error;
  }
}

export async function updateTodoStatus(id: string, completed: boolean): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("todos")
    .update({
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function moveTodoToSection(id: string, sectionName: string): Promise<void> {
  return updateTodo(id, { sectionName });
}

export async function deleteTodo(id: string): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("todos").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function invokeTodoAgent(input: {
  message: string;
  providerToken?: string | null;
  autoSyncCalendar?: boolean;
}): Promise<{
  reply: string;
  todos: TodoRecord[];
}> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("todo-agent", {
    body: input,
  });

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Todo agent failed.");
  }

  return {
    reply: typeof data.reply === "string" ? data.reply : "Done.",
    todos: Array.isArray(data.todos) ? (data.todos as TodoRecord[]) : [],
  };
}

export async function syncTodosToGoogleCalendar(providerToken: string): Promise<{
  synced: number;
  todos: TodoRecord[];
}> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("todo-agent", {
    body: {
      action: "sync_calendar",
      providerToken,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Calendar sync failed.");
  }

  return {
    synced: typeof data.synced === "number" ? data.synced : 0,
    todos: Array.isArray(data.todos) ? (data.todos as TodoRecord[]) : [],
  };
}
