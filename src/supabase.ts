import { createClient, type Session } from "@supabase/supabase-js";

const AUTH_RETURN_HASH_STORAGE_KEY_PREFIX = "ideas-combine.auth-return-hash";

export function getAuthReturnHashStorageKey(): string {
  if (typeof window === "undefined") {
    return AUTH_RETURN_HASH_STORAGE_KEY_PREFIX;
  }

  return `${AUTH_RETURN_HASH_STORAGE_KEY_PREFIX}:${window.location.origin}${window.location.pathname}`;
}

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

export type TodoProjectRecord = {
  id: string;
  owner_id: string;
  name: string;
  daily_summary_enabled: boolean;
  summary_threshold_days: number;
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

function getSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }

  return String(error);
}

function isMissingRelation(error: unknown, relationName: string): boolean {
  const message = getSupabaseErrorMessage(error).toLowerCase();
  return message.includes(relationName.toLowerCase()) && (message.includes("does not exist") || message.includes("not found"));
}

function isUnavailableFunction(error: unknown): boolean {
  const message = getSupabaseErrorMessage(error).toLowerCase();
  return message.includes("404") || (message.includes("function") && message.includes("not found"));
}

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

export async function signInWithGoogle(
  scopes = "https://www.googleapis.com/auth/calendar.events",
  returnHash = "#/todo/workspace",
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  window.localStorage.setItem(getAuthReturnHashStorageKey(), returnHash);

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
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
    if (isMissingRelation(error, "todos")) {
      return [];
    }
    throw error;
  }

  return data satisfies TodoRecord[];
}

export async function listTodoProjects(): Promise<TodoProjectRecord[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("todo_projects")
    .select("id, owner_id, name, daily_summary_enabled, summary_threshold_days, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingRelation(error, "todo_projects")) {
      return [];
    }
    throw error;
  }

  return data satisfies TodoProjectRecord[];
}

export async function createTodoProject(input: {
  name: string;
  dailySummaryEnabled?: boolean;
  summaryThresholdDays?: number;
}): Promise<TodoProjectRecord> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("todo_projects")
    .insert({
      name: input.name,
      daily_summary_enabled: input.dailySummaryEnabled ?? false,
      summary_threshold_days: input.summaryThresholdDays ?? 3,
    })
    .select("id, owner_id, name, daily_summary_enabled, summary_threshold_days, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingRelation(error, "todo_projects")) {
      throw new Error("Project support is not available until the `todo_projects` table exists.");
    }
    throw error;
  }

  return data satisfies TodoProjectRecord;
}

export async function updateTodoProject(
  id: string,
  input: {
    name?: string;
    dailySummaryEnabled?: boolean;
    summaryThresholdDays?: number;
  },
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const updatePayload: Record<string, string | boolean | number> = {};

  if (input.name !== undefined) {
    updatePayload.name = input.name;
  }

  if (input.dailySummaryEnabled !== undefined) {
    updatePayload.daily_summary_enabled = input.dailySummaryEnabled;
  }

  if (input.summaryThresholdDays !== undefined) {
    updatePayload.summary_threshold_days = input.summaryThresholdDays;
  }

  const { error } = await supabase.from("todo_projects").update(updatePayload).eq("id", id);

  if (error) {
    if (isMissingRelation(error, "todo_projects")) {
      throw new Error("Project settings are not available until the `todo_projects` table exists.");
    }
    throw error;
  }
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
    if (isUnavailableFunction(error)) {
      throw new Error("The todo agent backend is not reachable right now.");
    }
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
    if (isUnavailableFunction(error)) {
      throw new Error("Calendar sync backend is not reachable right now.");
    }
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
