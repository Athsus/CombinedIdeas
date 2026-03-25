import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { createTodo, deleteTodo, listTodos, moveTodoToSection, type TodoRecord, updateTodo, updateTodoStatus } from "../supabase";
import "../todo.css";

type TodoStatusTone = "overdue" | "soon" | "safe" | "done";
type FilterKey = "all" | "open" | "due_today" | "due_soon" | "overdue" | "completed";
type SortKey = "smart" | "due_asc" | "due_desc" | "created_desc" | "title_asc";
type ViewKey = "list" | "board" | "calendar" | "gantt" | "charts";
type LayoutMode = "simple" | "detailed";

type TodoDraft = {
  title: string;
  details: string;
  dueDate: string;
  projectName: string;
  sectionName: string;
  goalName: string;
  isMilestone: boolean;
};

const DEFAULT_PROJECT = "Personal";
const DEFAULT_SECTION = "Inbox";
const DEFAULT_BOARD_SECTIONS = ["Inbox", "In Progress", "Waiting", "Done"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function createEmptyDraft(projectName = DEFAULT_PROJECT, sectionName = DEFAULT_SECTION): TodoDraft {
  return {
    title: "",
    details: "",
    dueDate: "",
    projectName,
    sectionName,
    goalName: "",
    isMilestone: false,
  };
}

function trimOrFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseDueDate(dueDate: string | null): Date | null {
  return dueDate ? new Date(`${dueDate}T00:00:00`) : null;
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysUntilDue(dueDate: string | null): number | null {
  const due = parseDueDate(dueDate);

  if (!due) {
    return null;
  }

  return Math.ceil((due.getTime() - startOfToday().getTime()) / 86_400_000);
}

function formatDueLabel(dueDate: string | null): string {
  const due = parseDueDate(dueDate);

  if (!due) {
    return "No deadline";
  }

  return due.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function formatDayNumber(date: Date): string {
  return date.toLocaleDateString([], { day: "numeric" });
}

function getStatusTone(todo: TodoRecord, thresholdDays: number): TodoStatusTone {
  if (todo.completed_at) {
    return "done";
  }

  const days = daysUntilDue(todo.due_date);

  if (days === null) {
    return "safe";
  }

  if (days < 0) {
    return "overdue";
  }

  if (days <= thresholdDays) {
    return "soon";
  }

  return "safe";
}

function getStatusLabel(todo: TodoRecord, thresholdDays: number): string {
  if (todo.completed_at) {
    return "Completed";
  }

  const days = daysUntilDue(todo.due_date);

  if (days === null) {
    return "No due date";
  }

  if (days < 0) {
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  if (days <= thresholdDays) {
    return `Due in ${days} day${days === 1 ? "" : "s"}`;
  }

  return `Scheduled in ${days} day${days === 1 ? "" : "s"}`;
}

function getCalendarGrid(month: Date): Date[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstOfMonth);
  const offset = (firstOfMonth.getDay() + 6) % 7;
  start.setDate(firstOfMonth.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getTimelineRange(todos: TodoRecord[]): { start: Date; days: number } | null {
  const datedTodos = todos.filter((todo) => Boolean(todo.due_date));

  if (datedTodos.length === 0) {
    return null;
  }

  const start = new Date(
    Math.min(
      ...datedTodos.map((todo) => {
        const created = new Date(todo.created_at);
        created.setHours(0, 0, 0, 0);
        return created.getTime();
      }),
    ),
  );

  const end = new Date(
    Math.max(
      ...datedTodos.map((todo) => {
        const due = parseDueDate(todo.due_date);
        return due ? due.getTime() : Date.now();
      }),
    ),
  );

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return { start, days };
}

function differenceInDays(left: Date, right: Date): number {
  return Math.floor((left.getTime() - right.getTime()) / 86_400_000);
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function matchesFilter(todo: TodoRecord, filter: FilterKey, thresholdDays: number): boolean {
  const tone = getStatusTone(todo, thresholdDays);
  const days = daysUntilDue(todo.due_date);

  switch (filter) {
    case "open":
      return !todo.completed_at;
    case "due_today":
      return !todo.completed_at && days === 0;
    case "due_soon":
      return !todo.completed_at && tone === "soon";
    case "overdue":
      return !todo.completed_at && tone === "overdue";
    case "completed":
      return Boolean(todo.completed_at);
    default:
      return true;
  }
}

function sortTodos(todos: TodoRecord[], sort: SortKey, thresholdDays: number): TodoRecord[] {
  const items = [...todos];

  if (sort === "title_asc") {
    return items.sort((left, right) => left.title.localeCompare(right.title));
  }

  if (sort === "created_desc") {
    return items.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  if (sort === "due_asc") {
    return items.sort((left, right) => {
      if (!left.due_date && !right.due_date) {
        return right.created_at.localeCompare(left.created_at);
      }

      if (!left.due_date) {
        return 1;
      }

      if (!right.due_date) {
        return -1;
      }

      return left.due_date.localeCompare(right.due_date);
    });
  }

  if (sort === "due_desc") {
    return items.sort((left, right) => {
      if (!left.due_date && !right.due_date) {
        return right.created_at.localeCompare(left.created_at);
      }

      if (!left.due_date) {
        return 1;
      }

      if (!right.due_date) {
        return -1;
      }

      return right.due_date.localeCompare(left.due_date);
    });
  }

  const rank: Record<TodoStatusTone, number> = {
    overdue: 0,
    soon: 1,
    safe: 2,
    done: 3,
  };

  return items.sort((left, right) => {
    const leftTone = getStatusTone(left, thresholdDays);
    const rightTone = getStatusTone(right, thresholdDays);

    if (rank[leftTone] !== rank[rightTone]) {
      return rank[leftTone] - rank[rightTone];
    }

    if (left.completed_at && right.completed_at) {
      return right.completed_at.localeCompare(left.completed_at);
    }

    if (left.due_date && right.due_date) {
      return left.due_date.localeCompare(right.due_date);
    }

    if (left.due_date) {
      return -1;
    }

    if (right.due_date) {
      return 1;
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function buildDraftFromTodo(todo: TodoRecord): TodoDraft {
  return {
    title: todo.title,
    details: todo.details ?? "",
    dueDate: todo.due_date ?? "",
    projectName: todo.project_name,
    sectionName: todo.section_name,
    goalName: todo.goal_name ?? "",
    isMilestone: todo.is_milestone,
  };
}

function MiniBarChart({ items }: { items: Array<{ label: string; value: number; tone: TodoStatusTone | "safe" }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="todo-chart-list">
      {items.map((item) => (
        <div key={item.label} className="todo-chart-row">
          <span>{item.label}</span>
          <div className="todo-chart-track">
            <div className={`todo-chart-fill ${item.tone}`} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function TodoTaskCard({
  todo,
  thresholdDays,
  mode,
  onToggle,
  onDelete,
  onEdit,
  onDragStart,
}: {
  todo: TodoRecord;
  thresholdDays: number;
  mode: LayoutMode;
  onToggle: (todo: TodoRecord) => void;
  onDelete: (todo: TodoRecord) => void;
  onEdit: (todo: TodoRecord) => void;
  onDragStart?: (todo: TodoRecord) => void;
}) {
  const tone = getStatusTone(todo, thresholdDays);
  const statusLabel = getStatusLabel(todo, thresholdDays);

  return (
    <article className={`todo-row ${tone} ${mode}`} draggable={Boolean(onDragStart)} onDragStart={() => onDragStart?.(todo)}>
      <button
        type="button"
        className={`todo-check ${todo.completed_at ? "checked" : ""}`}
        aria-label={todo.completed_at ? `Mark ${todo.title} as not done` : `Mark ${todo.title} as done`}
        onClick={() => onToggle(todo)}
      >
        <span />
      </button>

      <div className="todo-row-body">
        <div className="todo-row-top">
          <h3>{todo.title}</h3>
          <span className={`todo-status-pill ${tone}`}>{statusLabel}</span>
        </div>

        {mode === "detailed" && todo.details ? <p>{todo.details}</p> : null}

        <div className="todo-row-tags">
          <span className="todo-tag">{todo.project_name}</span>
          <span className="todo-tag">{todo.section_name}</span>
          {todo.goal_name ? <span className="todo-tag accent">{todo.goal_name}</span> : null}
          {todo.is_milestone ? <span className="todo-tag milestone">Milestone</span> : null}
        </div>

        <div className="todo-row-meta">
          <span>{formatDueLabel(todo.due_date)}</span>
          <div className="todo-row-actions">
            <button type="button" className="todo-inline-button" onClick={() => onEdit(todo)}>
              Edit
            </button>
            {mode === "detailed" ? (
              <button type="button" className="todo-inline-button" onClick={() => onDelete(todo)}>
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function TodoToolPage() {
  const { session, signIn, signOut, isConfigured, isReady } = useAuth();
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [createDraft, setCreateDraft] = useState<TodoDraft>(() => createEmptyDraft());
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TodoDraft>(() => createEmptyDraft());
  const [thresholdDays, setThresholdDays] = useState(7);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("smart");
  const [view, setView] = useState<ViewKey>("list");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("detailed");
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("All Projects");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfToday());
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setTodos([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void listTodos()
      .then((records) => {
        if (!cancelled) {
          setTodos(records);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load tasks.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const projects = useMemo(() => {
    const values = Array.from(new Set(todos.map((todo) => todo.project_name))).sort((left, right) => left.localeCompare(right));
    return ["All Projects", ...values];
  }, [todos]);

  const visibleTodos = useMemo(
    () => (selectedProject === "All Projects" ? todos : todos.filter((todo) => todo.project_name === selectedProject)),
    [selectedProject, todos],
  );

  const summary = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let open = 0;
    let completed = 0;

    for (const todo of visibleTodos) {
      const tone = getStatusTone(todo, thresholdDays);

      if (tone === "done") {
        completed += 1;
        continue;
      }

      open += 1;

      if (tone === "overdue") {
        overdue += 1;
      } else if (tone === "soon") {
        dueSoon += 1;
      }
    }

    return { overdue, dueSoon, open, completed };
  }, [thresholdDays, visibleTodos]);

  const filteredTodos = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sortTodos(
      visibleTodos.filter((todo) => {
        const matchesSearch =
          term.length === 0 ||
          todo.title.toLowerCase().includes(term) ||
          (todo.details ?? "").toLowerCase().includes(term) ||
          todo.project_name.toLowerCase().includes(term) ||
          todo.section_name.toLowerCase().includes(term) ||
          (todo.goal_name ?? "").toLowerCase().includes(term);

        return matchesSearch && matchesFilter(todo, filter, thresholdDays);
      }),
      sort,
      thresholdDays,
    );
  }, [filter, search, sort, thresholdDays, visibleTodos]);

  const sectionNames = useMemo(() => {
    const dynamicSections = Array.from(new Set(filteredTodos.map((todo) => todo.section_name)));
    return Array.from(new Set([...DEFAULT_BOARD_SECTIONS, ...dynamicSections]));
  }, [filteredTodos]);

  const goals = useMemo(() => {
    const map = new Map<string, { total: number; completed: number; milestones: number }>();

    for (const todo of filteredTodos) {
      if (!todo.goal_name) {
        continue;
      }

      const current = map.get(todo.goal_name) ?? { total: 0, completed: 0, milestones: 0 };
      current.total += 1;
      if (todo.completed_at) {
        current.completed += 1;
      }
      if (todo.is_milestone) {
        current.milestones += 1;
      }
      map.set(todo.goal_name, current);
    }

    return Array.from(map.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [filteredTodos]);

  const boardColumns = useMemo(
    () =>
      sectionNames.map((sectionName) => ({
        key: sectionName,
        title: sectionName,
        subtitle: filteredTodos.filter((todo) => todo.section_name === sectionName && todo.is_milestone).length > 0 ? "Contains milestones" : "Task section",
        items: filteredTodos.filter((todo) => todo.section_name === sectionName),
      })),
    [filteredTodos, sectionNames],
  );

  const datedTodos = useMemo(() => filteredTodos.filter((todo) => todo.due_date), [filteredTodos]);

  const calendarItems = useMemo(() => {
    const map = new Map<string, TodoRecord[]>();

    for (const todo of datedTodos) {
      const key = todo.due_date as string;
      const existing = map.get(key) ?? [];
      existing.push(todo);
      map.set(key, existing);
    }

    return map;
  }, [datedTodos]);

  const calendarGrid = useMemo(() => getCalendarGrid(calendarMonth), [calendarMonth]);
  const ganttRange = useMemo(() => getTimelineRange(datedTodos), [datedTodos]);

  const chartStatusBuckets = useMemo(
    () => [
      { label: "Open", value: summary.open, tone: "safe" as const },
      { label: "Due soon", value: summary.dueSoon, tone: "soon" as const },
      { label: "Overdue", value: summary.overdue, tone: "overdue" as const },
      { label: "Completed", value: summary.completed, tone: "done" as const },
    ],
    [summary],
  );

  const chartGoalBuckets = useMemo(() => {
    const topGoals = goals.slice(0, 4);
    return topGoals.length > 0
      ? topGoals.map((goal) => ({ label: goal.name, value: goal.total, tone: "safe" as const }))
      : [{ label: "No goals", value: 0, tone: "done" as const }];
  }, [goals]);

  function setCreateDraftField<K extends keyof TodoDraft>(key: K, value: TodoDraft[K]) {
    setCreateDraft((current) => ({ ...current, [key]: value }));
  }

  function setEditDraftField<K extends keyof TodoDraft>(key: K, value: TodoDraft[K]) {
    setEditDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleCreateTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createDraft.title.trim()) {
      setError("Add a task title.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const created = await createTodo({
        title: createDraft.title.trim(),
        details: createDraft.details.trim() || null,
        dueDate: createDraft.dueDate || null,
        projectName: trimOrFallback(createDraft.projectName, DEFAULT_PROJECT),
        sectionName: trimOrFallback(createDraft.sectionName, DEFAULT_SECTION),
        goalName: createDraft.goalName.trim() || null,
        isMilestone: createDraft.isMilestone,
      });

      setTodos((current) => [created, ...current]);
      setCreateDraft(createEmptyDraft(created.project_name, created.section_name));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleTodo(todo: TodoRecord) {
    const nextCompleted = !todo.completed_at;
    const optimisticCompletedAt = nextCompleted ? new Date().toISOString() : null;

    setTodos((current) =>
      current.map((item) => (item.id === todo.id ? { ...item, completed_at: optimisticCompletedAt } : item)),
    );

    try {
      await updateTodoStatus(todo.id, nextCompleted);
    } catch (toggleError) {
      setTodos((current) => current.map((item) => (item.id === todo.id ? todo : item)));
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update task.");
    }
  }

  async function handleDeleteTodo(todo: TodoRecord) {
    const previous = todos;
    setTodos((current) => current.filter((item) => item.id !== todo.id));

    try {
      await deleteTodo(todo.id);
    } catch (deleteError) {
      setTodos(previous);
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete task.");
    }
  }

  function startEditing(todo: TodoRecord) {
    setEditingTodoId(todo.id);
    setEditDraft(buildDraftFromTodo(todo));
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingTodoId || !editDraft.title.trim()) {
      setError("Task title is required.");
      return;
    }

    const previous = todos;

    const updatedLocal = previous.map((todo) =>
      todo.id === editingTodoId
        ? {
            ...todo,
            title: editDraft.title.trim(),
            details: editDraft.details.trim() || null,
            due_date: editDraft.dueDate || null,
            project_name: trimOrFallback(editDraft.projectName, DEFAULT_PROJECT),
            section_name: trimOrFallback(editDraft.sectionName, DEFAULT_SECTION),
            goal_name: editDraft.goalName.trim() || null,
            is_milestone: editDraft.isMilestone,
          }
        : todo,
    );

    setTodos(updatedLocal);
    setEditingTodoId(null);

    try {
      await updateTodo(editingTodoId, {
        title: editDraft.title.trim(),
        details: editDraft.details.trim() || null,
        dueDate: editDraft.dueDate || null,
        projectName: trimOrFallback(editDraft.projectName, DEFAULT_PROJECT),
        sectionName: trimOrFallback(editDraft.sectionName, DEFAULT_SECTION),
        goalName: editDraft.goalName.trim() || null,
        isMilestone: editDraft.isMilestone,
      });
    } catch (updateError) {
      setTodos(previous);
      setError(updateError instanceof Error ? updateError.message : "Failed to save task.");
    }
  }

  async function handleDropToSection(sectionName: string) {
    if (!draggedTodoId) {
      return;
    }

    const previous = todos;
    setTodos((current) => current.map((todo) => (todo.id === draggedTodoId ? { ...todo, section_name: sectionName } : todo)));
    setDraggedTodoId(null);

    try {
      await moveTodoToSection(draggedTodoId, sectionName);
    } catch (moveError) {
      setTodos(previous);
      setError(moveError instanceof Error ? moveError.message : "Failed to move task.");
    }
  }

  if (!isConfigured) {
    return (
      <section className="todo-workspace todo-auth-shell">
        <div className="todo-auth-card">
          <p className="todo-auth-kicker">TODO Tool</p>
          <h1>Private task space</h1>
          <p>Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Google sign-in and synced tasks.</p>
          <Link className="todo-auth-link" to="/">
            Back to products
          </Link>
        </div>
      </section>
    );
  }

  if (!isReady) {
    return (
      <section className="todo-workspace todo-auth-shell">
        <div className="todo-auth-card">
          <p className="todo-auth-kicker">TODO Tool</p>
          <h1>Checking your session</h1>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="todo-workspace todo-auth-shell">
        <div className="todo-auth-card">
          <p className="todo-auth-kicker">Microsoft-style workspace</p>
          <h1>Sign in to open your task hub</h1>
          <p>Google OAuth protects the workspace. Tasks are private to your account through Supabase row-level security.</p>
          <div className="todo-auth-actions">
            <button type="button" className="todo-primary-button" onClick={() => void signIn()}>
              Continue with Google
            </button>
            <Link className="todo-auth-link" to="/">
              Back to products
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`todo-workspace ${layoutMode === "simple" ? "simple-mode" : "detailed-mode"}`}>
      <aside className="todo-left-rail">
        <div className="todo-brand-block">
          <p className="todo-brand-label">Tasks</p>
          <h1>My Day</h1>
          <p>{formatMonthLabel(startOfToday())}</p>
        </div>

        <nav className="todo-nav">
          <button type="button" className={`todo-nav-item ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            <span>All</span>
            <strong>{visibleTodos.length}</strong>
          </button>
          <button type="button" className={`todo-nav-item ${filter === "open" ? "active" : ""}`} onClick={() => setFilter("open")}>
            <span>Open</span>
            <strong>{summary.open}</strong>
          </button>
          <button type="button" className={`todo-nav-item ${filter === "due_today" ? "active" : ""}`} onClick={() => setFilter("due_today")}>
            <span>Today</span>
            <strong>{visibleTodos.filter((todo) => !todo.completed_at && daysUntilDue(todo.due_date) === 0).length}</strong>
          </button>
          <button type="button" className={`todo-nav-item ${filter === "due_soon" ? "active" : ""}`} onClick={() => setFilter("due_soon")}>
            <span>Planned</span>
            <strong>{summary.dueSoon}</strong>
          </button>
          <button type="button" className={`todo-nav-item ${filter === "overdue" ? "active" : ""}`} onClick={() => setFilter("overdue")}>
            <span>Overdue</span>
            <strong>{summary.overdue}</strong>
          </button>
          <button type="button" className={`todo-nav-item ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}>
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </button>
        </nav>

        <section className="todo-project-panel">
          <div className="todo-panel-heading">
            <h2>Projects</h2>
            <p>Group work by project and section.</p>
          </div>
          <div className="todo-project-list">
            {projects.map((project) => (
              <button
                key={project}
                type="button"
                className={`todo-project-chip ${selectedProject === project ? "active" : ""}`}
                onClick={() => {
                  setSelectedProject(project);
                  setCreateDraft((current) => ({
                    ...current,
                    projectName: project === "All Projects" ? DEFAULT_PROJECT : project,
                  }));
                }}
              >
                {project}
              </button>
            ))}
          </div>
        </section>

        <section className="todo-quick-panel">
          <div className="todo-panel-heading">
            <h2>Add a task</h2>
            <p>Project, section, goal, and milestone ready.</p>
          </div>

          <form className="todo-form" onSubmit={handleCreateTodo}>
            <label>
              Task title
              <input type="text" value={createDraft.title} onChange={(event) => setCreateDraftField("title", event.target.value)} placeholder="Prepare Monday review" maxLength={120} />
            </label>
            <label>
              Notes
              <textarea value={createDraft.details} onChange={(event) => setCreateDraftField("details", event.target.value)} rows={3} placeholder="Optional context" maxLength={400} />
            </label>
            <div className="todo-two-column-fields">
              <label>
                Project
                <input type="text" value={createDraft.projectName} onChange={(event) => setCreateDraftField("projectName", event.target.value)} placeholder="Personal" maxLength={80} />
              </label>
              <label>
                Section
                <input type="text" value={createDraft.sectionName} onChange={(event) => setCreateDraftField("sectionName", event.target.value)} placeholder="Inbox" maxLength={80} />
              </label>
            </div>
            <div className="todo-two-column-fields">
              <label>
                Goal
                <input type="text" value={createDraft.goalName} onChange={(event) => setCreateDraftField("goalName", event.target.value)} placeholder="Q2 launch" maxLength={120} />
              </label>
              <label>
                Due date
                <input type="date" value={createDraft.dueDate} onChange={(event) => setCreateDraftField("dueDate", event.target.value)} />
              </label>
            </div>
            <label className="todo-checkbox-field">
              <input type="checkbox" checked={createDraft.isMilestone} onChange={(event) => setCreateDraftField("isMilestone", event.target.checked)} />
              <span>Mark as milestone</span>
            </label>
            <button type="submit" className="todo-primary-button" disabled={isSaving}>
              {isSaving ? "Saving..." : "Add task"}
            </button>
          </form>
        </section>

        {goals.length > 0 ? (
          <section className="todo-goals-panel">
            <div className="todo-panel-heading">
              <h2>Goals</h2>
              <p>Milestones and task progress by goal.</p>
            </div>
            <div className="todo-goal-list">
              {goals.map((goal) => (
                <article key={goal.name} className="todo-goal-card">
                  <strong>{goal.name}</strong>
                  <span>
                    {goal.completed}/{goal.total} done
                  </span>
                  <span>{goal.milestones} milestones</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <main className="todo-main-shell">
        <header className="todo-topbar">
          <div>
            <p className="todo-topbar-label">TODO Tool</p>
            <h2>Private planner</h2>
          </div>
          <div className="todo-topbar-actions">
            <div className="todo-mode-switch" role="tablist" aria-label="Layout mode">
              <button type="button" className={`todo-mode-chip ${layoutMode === "simple" ? "active" : ""}`} onClick={() => setLayoutMode("simple")}>
                Simple
              </button>
              <button type="button" className={`todo-mode-chip ${layoutMode === "detailed" ? "active" : ""}`} onClick={() => setLayoutMode("detailed")}>
                Detailed
              </button>
            </div>
            <span className="todo-user-pill">{session.user.email ?? "Signed in"}</span>
            <button type="button" className="todo-secondary-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <section className="todo-toolbar">
          <div className="todo-search-wrap">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, projects, goals" />
          </div>
          <label className="todo-select-field">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="smart">Smart</option>
              <option value="due_asc">Due date</option>
              <option value="due_desc">Latest due</option>
              <option value="created_desc">Newest</option>
              <option value="title_asc">Title</option>
            </select>
          </label>
          <label className="todo-select-field">
            <span>Alert window</span>
            <select value={thresholdDays} onChange={(event) => setThresholdDays(Number(event.target.value))}>
              <option value="3">3 days</option>
              <option value="5">5 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
            </select>
          </label>
        </section>

        {layoutMode === "detailed" ? (
          <section className="todo-overview-grid">
            <article className="todo-overview-card">
              <span>Open</span>
              <strong>{summary.open}</strong>
            </article>
            <article className="todo-overview-card warning">
              <span>Due soon</span>
              <strong>{summary.dueSoon}</strong>
            </article>
            <article className="todo-overview-card danger">
              <span>Overdue</span>
              <strong>{summary.overdue}</strong>
            </article>
            <article className="todo-overview-card success">
              <span>Completed</span>
              <strong>{summary.completed}</strong>
            </article>
          </section>
        ) : null}

        <section className="todo-view-switcher">
          {(["list", "board", "calendar", "gantt", "charts"] as ViewKey[]).map((item) => (
            <button key={item} type="button" className={`todo-view-chip ${view === item ? "active" : ""}`} onClick={() => setView(item)}>
              {item === "list" ? "List" : item === "board" ? "Board" : item === "calendar" ? "Calendar" : item === "gantt" ? "Gantt" : "Charts"}
            </button>
          ))}
        </section>

        {editingTodoId ? (
          <section className="todo-content-card">
            <div className="todo-panel-heading">
              <h3>Edit task</h3>
              <p>Update title, grouping, goal, milestone, and due date.</p>
            </div>
            <form className="todo-form" onSubmit={handleSaveEdit}>
              <label>
                Task title
                <input type="text" value={editDraft.title} onChange={(event) => setEditDraftField("title", event.target.value)} maxLength={120} />
              </label>
              <label>
                Notes
                <textarea value={editDraft.details} onChange={(event) => setEditDraftField("details", event.target.value)} rows={3} maxLength={400} />
              </label>
              <div className="todo-two-column-fields">
                <label>
                  Project
                  <input type="text" value={editDraft.projectName} onChange={(event) => setEditDraftField("projectName", event.target.value)} maxLength={80} />
                </label>
                <label>
                  Section
                  <input type="text" value={editDraft.sectionName} onChange={(event) => setEditDraftField("sectionName", event.target.value)} maxLength={80} />
                </label>
              </div>
              <div className="todo-two-column-fields">
                <label>
                  Goal
                  <input type="text" value={editDraft.goalName} onChange={(event) => setEditDraftField("goalName", event.target.value)} maxLength={120} />
                </label>
                <label>
                  Due date
                  <input type="date" value={editDraft.dueDate} onChange={(event) => setEditDraftField("dueDate", event.target.value)} />
                </label>
              </div>
              <label className="todo-checkbox-field">
                <input type="checkbox" checked={editDraft.isMilestone} onChange={(event) => setEditDraftField("isMilestone", event.target.checked)} />
                <span>Mark as milestone</span>
              </label>
              <div className="todo-editor-actions">
                <button type="submit" className="todo-primary-button">
                  Save changes
                </button>
                <button type="button" className="todo-secondary-button" onClick={() => setEditingTodoId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}

        {view === "list" ? (
          <section className="todo-content-card todo-list-surface">
            {isLoading ? <div className="todo-empty">Loading tasks...</div> : null}
            {!isLoading && filteredTodos.length === 0 ? (
              <div className="todo-empty">
                <h3>No tasks match this view</h3>
                <p>Adjust filters or add a new task.</p>
              </div>
            ) : null}
            {!isLoading
              ? filteredTodos.map((todo) => (
                  <TodoTaskCard
                    key={todo.id}
                    todo={todo}
                    thresholdDays={thresholdDays}
                    mode={layoutMode}
                    onToggle={(item) => void handleToggleTodo(item)}
                    onDelete={(item) => void handleDeleteTodo(item)}
                    onEdit={startEditing}
                  />
                ))
              : null}
          </section>
        ) : null}

        {view === "board" ? (
          <section className="todo-board-grid">
            {boardColumns.map((column) => (
              <article
                key={column.key}
                className="todo-board-column"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDropToSection(column.title)}
              >
                <header className="todo-board-column-head">
                  <div>
                    <h3>{column.title}</h3>
                    <p>{column.subtitle}</p>
                  </div>
                  <strong>{column.items.length}</strong>
                </header>

                <div className="todo-board-column-body">
                  {column.items.length === 0 ? (
                    <div className="todo-board-empty">Drop tasks here</div>
                  ) : (
                    column.items.map((todo) => (
                      <TodoTaskCard
                        key={todo.id}
                        todo={todo}
                        thresholdDays={thresholdDays}
                        mode={layoutMode}
                        onToggle={(item) => void handleToggleTodo(item)}
                        onDelete={(item) => void handleDeleteTodo(item)}
                        onEdit={startEditing}
                        onDragStart={(item) => setDraggedTodoId(item.id)}
                      />
                    ))
                  )}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {view === "calendar" ? (
          <section className="todo-content-card">
            <div className="todo-calendar-head">
              <button type="button" className="todo-inline-button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
                Previous
              </button>
              <h3>{formatMonthLabel(calendarMonth)}</h3>
              <button type="button" className="todo-inline-button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
                Next
              </button>
            </div>

            <div className="todo-calendar-grid">
              {WEEKDAY_LABELS.map((day) => (
                <span key={day} className="todo-calendar-weekday">
                  {day}
                </span>
              ))}
              {calendarGrid.map((day) => {
                const key = toIsoDay(day);
                const items = calendarItems.get(key) ?? [];
                const isCurrentMonth = isSameMonth(day, calendarMonth);
                const isToday = key === toIsoDay(startOfToday());
                const maxVisible = layoutMode === "simple" ? 2 : 3;

                return (
                  <div key={key} className={`todo-calendar-cell ${isCurrentMonth ? "" : "muted"} ${isToday ? "today" : ""}`}>
                    <div className="todo-calendar-date">{formatDayNumber(day)}</div>
                    <div className="todo-calendar-events">
                      {items.slice(0, maxVisible).map((todo) => (
                        <div key={todo.id} className={`todo-calendar-event ${getStatusTone(todo, thresholdDays)} ${todo.is_milestone ? "milestone" : ""}`}>
                          {todo.is_milestone ? "◆ " : ""}
                          {todo.title}
                        </div>
                      ))}
                      {items.length > maxVisible ? <div className="todo-calendar-more">+{items.length - maxVisible} more</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {view === "gantt" ? (
          <section className="todo-content-card">
            {!ganttRange ? (
              <div className="todo-empty">
                <h3>No dated tasks</h3>
                <p>Add due dates to render the gantt view.</p>
              </div>
            ) : (
              <div className="todo-gantt">
                <div className="todo-gantt-header">
                  {Array.from({ length: ganttRange.days }, (_, index) => {
                    const day = new Date(ganttRange.start);
                    day.setDate(ganttRange.start.getDate() + index);
                    return <span key={toIsoDay(day)}>{day.toLocaleDateString([], { month: "short", day: "numeric" })}</span>;
                  })}
                </div>

                {datedTodos.map((todo) => {
                  const due = parseDueDate(todo.due_date);
                  if (!due) {
                    return null;
                  }

                  const created = new Date(todo.created_at);
                  created.setHours(0, 0, 0, 0);
                  const offset = Math.max(0, differenceInDays(created, ganttRange.start));
                  const span = Math.max(1, differenceInDays(due, created) + 1);

                  return (
                    <div key={todo.id} className="todo-gantt-row">
                      <div className="todo-gantt-label">
                        <strong>{todo.is_milestone ? "◆ " : ""}{todo.title}</strong>
                        <span>
                          {todo.project_name} / {todo.section_name}
                          {todo.goal_name ? ` / ${todo.goal_name}` : ""}
                        </span>
                      </div>
                      <div className="todo-gantt-track">
                        <div
                          className={`todo-gantt-bar ${getStatusTone(todo, thresholdDays)} ${todo.is_milestone ? "milestone" : ""}`}
                          style={{
                            left: `${(offset / ganttRange.days) * 100}%`,
                            width: `${Math.max((span / ganttRange.days) * 100, todo.is_milestone ? 2 : 3)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {view === "charts" && layoutMode === "detailed" ? (
          <section className="todo-chart-grid">
            <article className="todo-content-card">
              <div className="todo-panel-heading">
                <h3>Status snapshot</h3>
                <p>Fast read of current task pressure.</p>
              </div>
              <MiniBarChart items={chartStatusBuckets} />
            </article>

            <article className="todo-content-card">
              <div className="todo-panel-heading">
                <h3>Goal coverage</h3>
                <p>How work is distributed across active goals.</p>
              </div>
              <MiniBarChart items={chartGoalBuckets} />
            </article>
          </section>
        ) : null}

        {view === "charts" && layoutMode === "simple" ? (
          <section className="todo-content-card">
            <div className="todo-panel-heading">
              <h3>Charts hidden in simple mode</h3>
              <p>Switch to Detailed layout to open dashboard charts.</p>
            </div>
          </section>
        ) : null}
      </main>
    </section>
  );
}
