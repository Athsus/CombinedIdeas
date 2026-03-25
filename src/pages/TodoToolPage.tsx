import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { createTodo, deleteTodo, listTodos, type TodoRecord, updateTodoStatus } from "../supabase";
import "../todo.css";

type TodoStatusTone = "overdue" | "soon" | "safe" | "done";
type FilterKey = "all" | "open" | "due_today" | "due_soon" | "overdue" | "completed";
type SortKey = "smart" | "due_asc" | "due_desc" | "created_desc" | "title_asc";
type ViewKey = "list" | "board" | "calendar" | "gantt" | "charts";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function formatDayNumber(date: Date): string {
  return date.toLocaleDateString([], { day: "numeric" });
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
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

function getTimelineRange(todos: TodoRecord[]): { start: Date; end: Date; days: number } | null {
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
  return { start, end, days };
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
  onToggle,
  onDelete,
}: {
  todo: TodoRecord;
  thresholdDays: number;
  onToggle: (todo: TodoRecord) => void;
  onDelete: (todo: TodoRecord) => void;
}) {
  const tone = getStatusTone(todo, thresholdDays);
  const statusLabel = getStatusLabel(todo, thresholdDays);

  return (
    <article className={`todo-row ${tone}`}>
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
        {todo.details ? <p>{todo.details}</p> : null}
        <div className="todo-row-meta">
          <span>{formatDueLabel(todo.due_date)}</span>
          <button type="button" className="todo-inline-button" onClick={() => onDelete(todo)}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export default function TodoToolPage() {
  const { session, signIn, signOut, isConfigured, isReady } = useAuth();
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [thresholdDays, setThresholdDays] = useState(7);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("smart");
  const [view, setView] = useState<ViewKey>("list");
  const [search, setSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfToday());
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

  const summary = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let open = 0;
    let completed = 0;

    for (const todo of todos) {
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
  }, [thresholdDays, todos]);

  const filteredTodos = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sortTodos(
      todos.filter((todo) => {
        const matchesSearch =
          term.length === 0 ||
          todo.title.toLowerCase().includes(term) ||
          (todo.details ?? "").toLowerCase().includes(term);

        return matchesSearch && matchesFilter(todo, filter, thresholdDays);
      }),
      sort,
      thresholdDays,
    );
  }, [filter, search, sort, thresholdDays, todos]);

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

  const chartDueBuckets = useMemo(() => {
    let today = 0;
    let thisWeek = 0;
    let later = 0;
    let noDate = 0;

    for (const todo of todos) {
      if (todo.completed_at) {
        continue;
      }

      const days = daysUntilDue(todo.due_date);

      if (days === null) {
        noDate += 1;
      } else if (days <= 0) {
        today += 1;
      } else if (days <= 7) {
        thisWeek += 1;
      } else {
        later += 1;
      }
    }

    return [
      { label: "Today / overdue", value: today, tone: "overdue" as const },
      { label: "Next 7 days", value: thisWeek, tone: "soon" as const },
      { label: "Later", value: later, tone: "safe" as const },
      { label: "No date", value: noDate, tone: "done" as const },
    ];
  }, [todos]);

  const boardColumns = useMemo(
    () => [
      {
        key: "overdue",
        title: "Overdue",
        subtitle: "Needs attention",
        items: filteredTodos.filter((todo) => getStatusTone(todo, thresholdDays) === "overdue"),
      },
      {
        key: "soon",
        title: "Due soon",
        subtitle: `Within ${thresholdDays} days`,
        items: filteredTodos.filter((todo) => getStatusTone(todo, thresholdDays) === "soon"),
      },
      {
        key: "safe",
        title: "Upcoming",
        subtitle: "Scheduled later",
        items: filteredTodos.filter((todo) => getStatusTone(todo, thresholdDays) === "safe"),
      },
      {
        key: "done",
        title: "Completed",
        subtitle: "Finished work",
        items: filteredTodos.filter((todo) => getStatusTone(todo, thresholdDays) === "done"),
      },
    ],
    [filteredTodos, thresholdDays],
  );

  async function handleCreateTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Add a task title.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const created = await createTodo({
        title: title.trim(),
        details: details.trim() || null,
        dueDate: dueDate || null,
      });

      setTodos((current) => [created, ...current]);
      setTitle("");
      setDetails("");
      setDueDate("");
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
    setError(null);

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
    setError(null);

    try {
      await deleteTodo(todo.id);
    } catch (deleteError) {
      setTodos(previous);
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete task.");
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
    <section className="todo-workspace">
      <aside className="todo-left-rail">
        <div className="todo-brand-block">
          <p className="todo-brand-label">Tasks</p>
          <h1>My Day</h1>
          <p>{formatMonthLabel(startOfToday())}</p>
        </div>

        <nav className="todo-nav">
          <button type="button" className={`todo-nav-item ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            <span>All</span>
            <strong>{todos.length}</strong>
          </button>
          <button type="button" className={`todo-nav-item ${filter === "open" ? "active" : ""}`} onClick={() => setFilter("open")}>
            <span>Open</span>
            <strong>{summary.open}</strong>
          </button>
          <button
            type="button"
            className={`todo-nav-item ${filter === "due_today" ? "active" : ""}`}
            onClick={() => setFilter("due_today")}
          >
            <span>Today</span>
            <strong>{todos.filter((todo) => !todo.completed_at && daysUntilDue(todo.due_date) === 0).length}</strong>
          </button>
          <button
            type="button"
            className={`todo-nav-item ${filter === "due_soon" ? "active" : ""}`}
            onClick={() => setFilter("due_soon")}
          >
            <span>Planned</span>
            <strong>{summary.dueSoon}</strong>
          </button>
          <button
            type="button"
            className={`todo-nav-item ${filter === "overdue" ? "active" : ""}`}
            onClick={() => setFilter("overdue")}
          >
            <span>Overdue</span>
            <strong>{summary.overdue}</strong>
          </button>
          <button
            type="button"
            className={`todo-nav-item ${filter === "completed" ? "active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </button>
        </nav>

        <section className="todo-quick-panel">
          <div className="todo-panel-heading">
            <h2>Add a task</h2>
            <p>Simple capture, visible due dates.</p>
          </div>

          <form className="todo-form" onSubmit={handleCreateTodo}>
            <label>
              Task title
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Prepare Monday review"
                maxLength={120}
              />
            </label>
            <label>
              Notes
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                placeholder="Optional context"
                maxLength={400}
              />
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <button type="submit" className="todo-primary-button" disabled={isSaving}>
              {isSaving ? "Saving..." : "Add task"}
            </button>
          </form>
        </section>
      </aside>

      <main className="todo-main-shell">
        <header className="todo-topbar">
          <div>
            <p className="todo-topbar-label">TODO Tool</p>
            <h2>Private planner</h2>
          </div>
          <div className="todo-topbar-actions">
            <span className="todo-user-pill">{session.user.email ?? "Signed in"}</span>
            <button type="button" className="todo-secondary-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <section className="todo-toolbar">
          <div className="todo-search-wrap">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" />
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

        <section className="todo-view-switcher">
          {(["list", "board", "calendar", "gantt", "charts"] as ViewKey[]).map((item) => (
            <button key={item} type="button" className={`todo-view-chip ${view === item ? "active" : ""}`} onClick={() => setView(item)}>
              {item === "list"
                ? "List"
                : item === "board"
                  ? "Board"
                  : item === "calendar"
                    ? "Calendar"
                    : item === "gantt"
                      ? "Gantt"
                      : "Charts"}
            </button>
          ))}
        </section>

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
                    onToggle={(item) => void handleToggleTodo(item)}
                    onDelete={(item) => void handleDeleteTodo(item)}
                  />
                ))
              : null}
          </section>
        ) : null}

        {view === "board" ? (
          <section className="todo-board-grid">
            {boardColumns.map((column) => (
              <article key={column.key} className={`todo-board-column ${column.key}`}>
                <header className="todo-board-column-head">
                  <div>
                    <h3>{column.title}</h3>
                    <p>{column.subtitle}</p>
                  </div>
                  <strong>{column.items.length}</strong>
                </header>

                <div className="todo-board-column-body">
                  {column.items.length === 0 ? (
                    <div className="todo-board-empty">No tasks</div>
                  ) : (
                    column.items.map((todo) => (
                      <TodoTaskCard
                        key={todo.id}
                        todo={todo}
                        thresholdDays={thresholdDays}
                        onToggle={(item) => void handleToggleTodo(item)}
                        onDelete={(item) => void handleDeleteTodo(item)}
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
              <button
                type="button"
                className="todo-inline-button"
                onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              >
                Previous
              </button>
              <h3>{formatMonthLabel(calendarMonth)}</h3>
              <button
                type="button"
                className="todo-inline-button"
                onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              >
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

                return (
                  <div key={key} className={`todo-calendar-cell ${isCurrentMonth ? "" : "muted"} ${isToday ? "today" : ""}`}>
                    <div className="todo-calendar-date">{formatDayNumber(day)}</div>
                    <div className="todo-calendar-events">
                      {items.slice(0, 3).map((todo) => (
                        <div key={todo.id} className={`todo-calendar-event ${getStatusTone(todo, thresholdDays)}`}>
                          {todo.title}
                        </div>
                      ))}
                      {items.length > 3 ? <div className="todo-calendar-more">+{items.length - 3} more</div> : null}
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
                    return (
                      <span key={toIsoDay(day)}>{day.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    );
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
                        <strong>{todo.title}</strong>
                        <span>{formatDueLabel(todo.due_date)}</span>
                      </div>
                      <div className="todo-gantt-track">
                        <div
                          className={`todo-gantt-bar ${getStatusTone(todo, thresholdDays)}`}
                          style={{
                            left: `${(offset / ganttRange.days) * 100}%`,
                            width: `${Math.max((span / ganttRange.days) * 100, 3)}%`,
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

        {view === "charts" ? (
          <section className="todo-chart-grid">
            <article className="todo-content-card">
              <div className="todo-panel-heading">
                <h3>Status snapshot</h3>
                <p>Fast read of current task pressure.</p>
              </div>
              <MiniBarChart
                items={[
                  { label: "Open", value: summary.open, tone: "safe" },
                  { label: "Due soon", value: summary.dueSoon, tone: "soon" },
                  { label: "Overdue", value: summary.overdue, tone: "overdue" },
                  { label: "Completed", value: summary.completed, tone: "done" },
                ]}
              />
            </article>

            <article className="todo-content-card">
              <div className="todo-panel-heading">
                <h3>Calendar pressure</h3>
                <p>How work is distributed by due date.</p>
              </div>
              <MiniBarChart items={chartDueBuckets} />
            </article>
          </section>
        ) : null}
      </main>
    </section>
  );
}
