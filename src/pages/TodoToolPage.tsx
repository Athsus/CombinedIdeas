import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { createTodo, deleteTodo, listTodos, type TodoRecord, updateTodoStatus } from "../supabase";
import "../todo.css";

type TodoStatusTone = "overdue" | "soon" | "safe" | "done";

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysUntilDue(dueDate: string | null): number | null {
  if (!dueDate) {
    return null;
  }

  const due = new Date(`${dueDate}T00:00:00`);
  const today = startOfToday();
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function formatDueLabel(dueDate: string | null): string {
  if (!dueDate) {
    return "No deadline";
  }

  return new Date(`${dueDate}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default function TodoToolPage() {
  const { session, signIn, signOut, isConfigured, isReady } = useAuth();
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [thresholdDays, setThresholdDays] = useState(7);
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

  const orderedTodos = useMemo(() => {
    const rank: Record<TodoStatusTone, number> = {
      overdue: 0,
      soon: 1,
      safe: 2,
      done: 3,
    };

    return [...todos].sort((left, right) => {
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
  }, [thresholdDays, todos]);

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
      <section className="panel todo-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">TODO Tool</p>
            <h1>Private task space</h1>
            <p className="lead">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Google sign-in and synced tasks.</p>
          </div>
          <Link className="text-link" to="/">
            Back to products
          </Link>
        </header>
      </section>
    );
  }

  if (!isReady) {
    return (
      <section className="panel todo-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">TODO Tool</p>
            <h1>Private task space</h1>
          </div>
          <Link className="text-link" to="/">
            Back to products
          </Link>
        </header>

        <div className="todo-login-card">
          <p>Checking your session...</p>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="panel todo-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">TODO Tool</p>
            <h1>Sign in to unlock your task dashboard</h1>
            <p className="lead">Google OAuth is required. Tasks stay private behind Supabase auth and row-level security.</p>
          </div>
          <Link className="text-link" to="/">
            Back to products
          </Link>
        </header>

        <div className="todo-login-card">
          <div>
            <h2>Protected workspace</h2>
            <p>Only authenticated users can read or change tasks. Anonymous visitors cannot reach the dashboard data.</p>
          </div>
          <button type="button" className="button" onClick={() => void signIn()}>
            Continue with Google
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel todo-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">TODO Tool</p>
          <h1>Focused list, visible deadlines</h1>
          <p className="lead">A private Microsoft To Do–style board with fast capture, due-date visibility, and urgency signals.</p>
        </div>
        <div className="todo-header-actions">
          <span className="signed-in-pill">{session.user.email ?? "Signed in"}</span>
          <button type="button" className="button secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="todo-layout">
        <aside className="todo-sidebar">
          <article className="todo-summary-card">
            <p className="tool-state">Dashboard</p>
            <h2>Deadline watch</h2>
            <label className="threshold-field" htmlFor="threshold-days">
              <span>Warning threshold</span>
              <div className="threshold-inline">
                <input
                  id="threshold-days"
                  type="range"
                  min="1"
                  max="30"
                  value={thresholdDays}
                  onChange={(event) => setThresholdDays(Number(event.target.value))}
                />
                <strong>{thresholdDays} days</strong>
              </div>
            </label>
            <div className="todo-stat-grid">
              <article className="todo-stat-card danger">
                <span>Overdue</span>
                <strong>{summary.overdue}</strong>
              </article>
              <article className="todo-stat-card alert">
                <span>Due soon</span>
                <strong>{summary.dueSoon}</strong>
              </article>
              <article className="todo-stat-card neutral">
                <span>Open</span>
                <strong>{summary.open}</strong>
              </article>
              <article className="todo-stat-card success">
                <span>Done</span>
                <strong>{summary.completed}</strong>
              </article>
            </div>
          </article>

          <article className="todo-summary-card">
            <p className="tool-state">Quick Add</p>
            <h2>Capture a task</h2>
            <form className="todo-form" onSubmit={handleCreateTodo}>
              <label>
                Task
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Finish onboarding brief"
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
                Deadline
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <button type="submit" className="button" disabled={isSaving}>
                {isSaving ? "Saving..." : "Add task"}
              </button>
            </form>
          </article>
        </aside>

        <section className="todo-main">
          <div className="todo-list-head">
            <div>
              <p className="tool-state">My Dayboard</p>
              <h2>Tasks</h2>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <div className="todo-list-card">
            {isLoading ? <p className="empty-state">Loading tasks...</p> : null}
            {!isLoading && orderedTodos.length === 0 ? (
              <div className="empty-state">
                <h3>No tasks yet</h3>
                <p>Add your first task to start tracking deadlines.</p>
              </div>
            ) : null}

            {!isLoading
              ? orderedTodos.map((todo) => {
                  const tone = getStatusTone(todo, thresholdDays);
                  const statusLabel = getStatusLabel(todo, thresholdDays);

                  return (
                    <article key={todo.id} className={`todo-item ${tone}`}>
                      <button
                        type="button"
                        className={`todo-check ${todo.completed_at ? "checked" : ""}`}
                        aria-label={todo.completed_at ? `Mark ${todo.title} as not done` : `Mark ${todo.title} as done`}
                        onClick={() => void handleToggleTodo(todo)}
                      >
                        <span />
                      </button>

                      <div className="todo-item-body">
                        <div className="todo-item-topline">
                          <h3>{todo.title}</h3>
                          <span className={`todo-badge ${tone}`}>{statusLabel}</span>
                        </div>
                        {todo.details ? <p>{todo.details}</p> : null}
                        <div className="todo-meta-row">
                          <span>{formatDueLabel(todo.due_date)}</span>
                          <button type="button" className="button ghost" onClick={() => void handleDeleteTodo(todo)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              : null}
          </div>
        </section>
      </div>
    </section>
  );
}
