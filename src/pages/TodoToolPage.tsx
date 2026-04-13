import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import {
  createTodo,
  createTodoProject,
  deleteTodo,
  invokeTodoAgent,
  listTodoProjects,
  listTodos,
  moveTodoToSection,
  syncTodosToGoogleCalendar,
  type TodoProjectRecord,
  type TodoRecord,
  updateTodo,
  updateTodoProject,
  updateTodoStatus,
} from "../supabase";
import { useTodoTheme } from "../todoTheme";
import "../todo.css";

type ViewMode = "home" | "my_tasks" | "project";
type TaskView = "list" | "board" | "calendar" | "gantt" | "dashboard" | "files";
type FilterPreset = "all" | "incomplete" | "completed" | "due_this_week" | "due_next_week" | "overdue";
type SortKey = "due_date" | "created_on" | "alphabetical" | "project" | "completed_on";
type GroupKey = "sections" | "project" | "due_bucket" | "completion";
type TodoTone = "overdue" | "soon" | "safe" | "done";
type ChatMessage = { role: "assistant" | "user"; text: string };
type DashboardMetric = { label: string; value: number; helper: string };
type TodoDraft = {
  title: string;
  details: string;
  dueDate: string;
  projectName: string;
  sectionName: string;
  goalName: string;
  isMilestone: boolean;
};

type WorkspaceState =
  | { kind: "home" }
  | { kind: "my_tasks" }
  | { kind: "project"; name: string };

const DEFAULT_PROJECT = "Personal";
const DEFAULT_SECTION = "Recently assigned";
const DEFAULT_SECTIONS = ["Recently assigned", "Do today", "Do next week", "Do later"];
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

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDueDate(dueDate: string | null): Date | null {
  return dueDate ? new Date(`${dueDate}T00:00:00`) : null;
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function formatShortDateTime(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDueLabel(dueDate: string | null): string {
  const due = parseDueDate(dueDate);
  if (!due) {
    return "No due date";
  }

  return due.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDayNumber(date: Date): string {
  return date.toLocaleDateString([], { day: "numeric" });
}

function differenceInDays(left: Date, right: Date): number {
  return Math.floor((left.getTime() - right.getTime()) / 86_400_000);
}

function daysUntilDue(dueDate: string | null): number | null {
  const due = parseDueDate(dueDate);
  if (!due) {
    return null;
  }

  return Math.ceil((due.getTime() - startOfToday().getTime()) / 86_400_000);
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

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
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

  return {
    start,
    days: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1),
  };
}

function trimOrFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function inferSection(todo: TodoRecord): string {
  if (todo.completed_at) {
    return "Completed";
  }

  const days = daysUntilDue(todo.due_date);
  if (days === null) {
    return todo.section_name || DEFAULT_SECTION;
  }
  if (days <= 0) {
    return "Do today";
  }
  if (days <= 7) {
    return "Do next week";
  }
  return "Do later";
}

function getTodoTone(todo: TodoRecord, threshold = 7): TodoTone {
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
  if (days <= threshold) {
    return "soon";
  }
  return "safe";
}

function sortTodos(todos: TodoRecord[], sortKey: SortKey): TodoRecord[] {
  const items = [...todos];

  if (sortKey === "alphabetical") {
    return items.sort((left, right) => left.title.localeCompare(right.title));
  }
  if (sortKey === "created_on") {
    return items.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }
  if (sortKey === "project") {
    return items.sort((left, right) => {
      const projectCompare = left.project_name.localeCompare(right.project_name);
      return projectCompare !== 0 ? projectCompare : left.title.localeCompare(right.title);
    });
  }
  if (sortKey === "completed_on") {
    return items.sort((left, right) => (right.completed_at ?? "").localeCompare(left.completed_at ?? ""));
  }

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

function matchesPreset(todo: TodoRecord, preset: FilterPreset): boolean {
  const days = daysUntilDue(todo.due_date);

  switch (preset) {
    case "incomplete":
      return !todo.completed_at;
    case "completed":
      return Boolean(todo.completed_at);
    case "due_this_week":
      return !todo.completed_at && days !== null && days >= 0 && days <= 7;
    case "due_next_week":
      return !todo.completed_at && days !== null && days >= 8 && days <= 14;
    case "overdue":
      return !todo.completed_at && days !== null && days < 0;
    default:
      return true;
  }
}

function getGroupLabel(todo: TodoRecord, groupBy: GroupKey): string {
  if (groupBy === "project") {
    return todo.project_name;
  }
  if (groupBy === "completion") {
    return todo.completed_at ? "Completed" : "Open";
  }
  if (groupBy === "due_bucket") {
    const days = daysUntilDue(todo.due_date);
    if (todo.completed_at) {
      return "Completed";
    }
    if (days === null) {
      return "No due date";
    }
    if (days < 0) {
      return "Overdue";
    }
    if (days === 0) {
      return "Today";
    }
    if (days <= 7) {
      return "This week";
    }
    return "Later";
  }

  return inferSection(todo);
}

function groupTodos(todos: TodoRecord[], groupBy: GroupKey): Array<{ label: string; items: TodoRecord[] }> {
  const map = new Map<string, TodoRecord[]>();

  for (const todo of todos) {
    const label = getGroupLabel(todo, groupBy);
    const items = map.get(label) ?? [];
    items.push(todo);
    map.set(label, items);
  }

  const preferredOrder =
    groupBy === "sections"
      ? [...DEFAULT_SECTIONS, "Completed"]
      : groupBy === "due_bucket"
        ? ["Overdue", "Today", "This week", "Later", "No due date", "Completed"]
        : groupBy === "completion"
          ? ["Open", "Completed"]
          : [];

  return Array.from(map.entries())
    .sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left[0]);
      const rightIndex = preferredOrder.indexOf(right[0]);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : 999) - (rightIndex >= 0 ? rightIndex : 999);
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([label, items]) => ({ label, items }));
}

function MiniBarChart({ items }: { items: Array<{ label: string; value: number; tone: TodoTone | "safe" }> }) {
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

function DonutChart({ complete, incomplete }: { complete: number; incomplete: number }) {
  const total = Math.max(1, complete + incomplete);
  const completeArc = (complete / total) * 360;

  return (
    <div
      className="todo-donut"
      style={{
        background: `conic-gradient(#8b949e 0deg ${completeArc}deg, #f0f6fc ${completeArc}deg 360deg)`,
      }}
    >
      <div className="todo-donut-center">{complete}</div>
    </div>
  );
}

function TodoRow({ todo, onToggle, onEdit, onDelete }: { todo: TodoRecord; onToggle: (todo: TodoRecord) => void; onEdit: (todo: TodoRecord) => void; onDelete: (todo: TodoRecord) => void }) {
  const tone = getTodoTone(todo);
  return (
    <div className={`todo-table-row ${tone}`}>
      <div className="todo-table-cell todo-title-cell">
        <button type="button" className={`todo-check ${todo.completed_at ? "checked" : ""}`} onClick={() => onToggle(todo)}>
          <span />
        </button>
        <button type="button" className="todo-title-button" onClick={() => onEdit(todo)}>
          <span className="todo-title-main">{todo.title}</span>
          {todo.details ? <span className="todo-title-sub">{todo.details}</span> : null}
        </button>
      </div>
      <div className="todo-table-cell">{formatDueLabel(todo.due_date)}</div>
      <div className="todo-table-cell">
        <span className="todo-pill">{todo.project_name}</span>
      </div>
      <div className="todo-table-cell">
        <span className={`todo-status-pill ${tone}`}>{getGroupLabel(todo, "sections")}</span>
      </div>
      <div className="todo-table-cell todo-actions-cell">
        <button type="button" className="todo-inline-button" onClick={() => onEdit(todo)}>
          Edit
        </button>
        <button type="button" className="todo-inline-button" onClick={() => onDelete(todo)}>
          Delete
        </button>
      </div>
    </div>
  );
}

export default function TodoToolPage() {
  const { session, signIn, signOut, isConfigured, isReady } = useAuth();
  const { theme, toggleTheme } = useTodoTheme();
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [projects, setProjects] = useState<TodoProjectRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceState>({ kind: "my_tasks" });
  const [taskView, setTaskView] = useState<TaskView>("list");
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("all");
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [groupBy, setGroupBy] = useState<GroupKey>("sections");
  const [search, setSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfToday());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [inlineSectionDrafts, setInlineSectionDrafts] = useState<Record<string, string>>({});
  const [createDraft, setCreateDraft] = useState<TodoDraft>(() => createEmptyDraft());
  const [projectDraftName, setProjectDraftName] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TodoDraft>(() => createEmptyDraft());
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: 'I can manage your todos with natural language. Try: add "finish launch brief" tomorrow in project work section recently assigned.' },
  ]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isProjectSaving, setIsProjectSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!session) {
      setTodos([]);
      setProjects([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void Promise.allSettled([listTodos(), listTodoProjects()])
      .then(([todoResult, projectResult]) => {
        if (cancelled) {
          return;
        }

        if (todoResult.status === "fulfilled") {
          setTodos(todoResult.value);
        } else {
          setTodos([]);
          setError(todoResult.reason instanceof Error ? todoResult.reason.message : "Failed to load tasks.");
        }

        if (projectResult.status === "fulfilled") {
          setProjects(projectResult.value);
        } else {
          setProjects([]);
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

  useEffect(() => {
    if (workspace.kind === "project") {
      setCreateDraft((current) => ({ ...current, projectName: workspace.name }));
    }
    setMobileSidebarOpen(false);
    setShowProfileMenu(false);
  }, [workspace]);

  useEffect(() => {
    if (workspace.kind !== "project" && taskView === "gantt") {
      setTaskView("list");
    }
  }, [taskView, workspace.kind]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowProfileMenu(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const projectNames = useMemo(() => {
    const set = new Set<string>([DEFAULT_PROJECT]);
    for (const project of projects) {
      set.add(project.name);
    }
    for (const todo of todos) {
      set.add(todo.project_name);
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [projects, todos]);

  const projectSummaries = useMemo(() => {
    return projectNames.map((name) => {
      const items = todos.filter((todo) => todo.project_name === name);
      const open = items.filter((todo) => !todo.completed_at).length;
      const overdue = items.filter((todo) => getTodoTone(todo) === "overdue").length;
      const upcoming = items.filter((todo) => getTodoTone(todo) === "soon").length;
      const completed = items.filter((todo) => Boolean(todo.completed_at)).length;
      const record = projects.find((project) => project.name === name) ?? null;
      return { name, record, total: items.length, open, overdue, upcoming, completed };
    });
  }, [projectNames, projects, todos]);

  const scopedTodos = useMemo(() => {
    if (workspace.kind === "project") {
      return todos.filter((todo) => todo.project_name === workspace.name);
    }
    return todos;
  }, [todos, workspace]);

  const searchedTodos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scopedTodos.filter((todo) => {
      if (term.length === 0) {
        return true;
      }
      return (
        todo.title.toLowerCase().includes(term) ||
        (todo.details ?? "").toLowerCase().includes(term) ||
        todo.project_name.toLowerCase().includes(term) ||
        todo.section_name.toLowerCase().includes(term) ||
        (todo.goal_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [scopedTodos, search]);

  const filteredTodos = useMemo(() => sortTodos(searchedTodos.filter((todo) => matchesPreset(todo, filterPreset)), sortKey), [filterPreset, searchedTodos, sortKey]);
  const groupedTodos = useMemo(() => groupTodos(filteredTodos, groupBy), [filteredTodos, groupBy]);
  const ganttRange = useMemo(() => getTimelineRange(filteredTodos), [filteredTodos]);

  const dashboardMetrics = useMemo<DashboardMetric[]>(() => {
    const incomplete = filteredTodos.filter((todo) => !todo.completed_at).length;
    const overdue = filteredTodos.filter((todo) => getTodoTone(todo) === "overdue").length;
    const completed = filteredTodos.filter((todo) => Boolean(todo.completed_at)).length;
    return [
      { label: "Total completed tasks", value: completed, helper: filterPreset === "all" ? "No filters" : "1 filter" },
      { label: "Total incomplete tasks", value: incomplete, helper: filterPreset === "all" ? "No filters" : "1 filter" },
      { label: "Total overdue tasks", value: overdue, helper: filterPreset === "all" ? "No filters" : "1 filter" },
      { label: "Total tasks", value: filteredTodos.length, helper: filterPreset === "all" ? "No filters" : "1 filter" },
    ];
  }, [filterPreset, filteredTodos]);

  const sectionChart = useMemo(() => groupTodos(filteredTodos, "sections").map((group) => ({ label: group.label, value: group.items.length, tone: "safe" as const })), [filteredTodos]);
  const completionStats = useMemo(() => ({ complete: filteredTodos.filter((todo) => Boolean(todo.completed_at)).length, incomplete: filteredTodos.filter((todo) => !todo.completed_at).length }), [filteredTodos]);
  const calendarMap = useMemo(() => {
    const map = new Map<string, TodoRecord[]>();
    for (const todo of filteredTodos.filter((item) => Boolean(item.due_date))) {
      const key = todo.due_date as string;
      const items = map.get(key) ?? [];
      items.push(todo);
      map.set(key, items);
    }
    return map;
  }, [filteredTodos]);
  const calendarGrid = useMemo(() => getCalendarGrid(calendarMonth), [calendarMonth]);

  const homeSummary = useMemo(() => {
    const upcoming = todos.filter((todo) => !todo.completed_at && getTodoTone(todo) === "soon").slice(0, 5);
    const overdue = todos.filter((todo) => !todo.completed_at && getTodoTone(todo) === "overdue").slice(0, 5);
    const completed = todos.filter((todo) => Boolean(todo.completed_at)).slice(0, 5);
    return { upcoming, overdue, completed };
  }, [todos]);

  function setCreateDraftField<K extends keyof TodoDraft>(key: K, value: TodoDraft[K]) {
    setCreateDraft((current) => ({ ...current, [key]: value }));
  }

  function setEditDraftField<K extends keyof TodoDraft>(key: K, value: TodoDraft[K]) {
    setEditDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSidebarToggle() {
    if (window.matchMedia("(max-width: 1180px)").matches) {
      setMobileSidebarOpen((current) => !current);
      return;
    }

    setSidebarCollapsed((current) => !current);
  }

  function setInlineSectionDraft(sectionName: string, value: string) {
    setInlineSectionDrafts((current) => ({ ...current, [sectionName]: value }));
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
      setCreateDraft((current) => createEmptyDraft(trimOrFallback(current.projectName, DEFAULT_PROJECT), DEFAULT_SECTION));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectDraftName.trim();
    if (!name) {
      setError("Project name is required.");
      return;
    }

    setIsProjectSaving(true);
    setError(null);

    try {
      const created = await createTodoProject({ name, summaryThresholdDays: 3 });
      setProjects((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setProjectDraftName("");
      setWorkspace({ kind: "project", name: created.name });
    } catch (projectError) {
      setError(projectError instanceof Error ? projectError.message : "Failed to create project.");
    } finally {
      setIsProjectSaving(false);
    }
  }

  async function handleInlineCreateTodo(sectionName: string) {
    const draftTitle = inlineSectionDrafts[sectionName]?.trim();
    if (!draftTitle) {
      return;
    }

    const projectName = workspace.kind === "project" ? workspace.name : createDraft.projectName;
    setIsSaving(true);
    setError(null);

    try {
      const created = await createTodo({
        title: draftTitle,
        projectName: trimOrFallback(projectName, DEFAULT_PROJECT),
        sectionName,
      });
      setTodos((current) => [created, ...current]);
      setInlineSectionDrafts((current) => ({ ...current, [sectionName]: "" }));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleTodo(todo: TodoRecord) {
    const completedAt = todo.completed_at ? null : new Date().toISOString();
    setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, completed_at: completedAt } : item)));

    try {
      await updateTodoStatus(todo.id, !todo.completed_at);
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
    setEditDraft({
      title: todo.title,
      details: todo.details ?? "",
      dueDate: todo.due_date ?? "",
      projectName: todo.project_name,
      sectionName: todo.section_name,
      goalName: todo.goal_name ?? "",
      isMilestone: todo.is_milestone,
    });
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTodoId || !editDraft.title.trim()) {
      setError("Task title is required.");
      return;
    }

    const previous = todos;
    const nextProjectName = trimOrFallback(editDraft.projectName, DEFAULT_PROJECT);
    const nextSectionName = trimOrFallback(editDraft.sectionName, DEFAULT_SECTION);

    setTodos((current) =>
      current.map((todo) =>
        todo.id === editingTodoId
          ? { ...todo, title: editDraft.title.trim(), details: editDraft.details.trim() || null, due_date: editDraft.dueDate || null, project_name: nextProjectName, section_name: nextSectionName, goal_name: editDraft.goalName.trim() || null, is_milestone: editDraft.isMilestone }
          : todo,
      ),
    );
    setEditingTodoId(null);

    try {
      await updateTodo(editingTodoId, {
        title: editDraft.title.trim(),
        details: editDraft.details.trim() || null,
        dueDate: editDraft.dueDate || null,
        projectName: nextProjectName,
        sectionName: nextSectionName,
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

  async function handleProjectReminderChange(project: TodoProjectRecord, input: { dailySummaryEnabled?: boolean; summaryThresholdDays?: number }) {
    const previous = projects;
    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? {
              ...item,
              daily_summary_enabled: input.dailySummaryEnabled ?? item.daily_summary_enabled,
              summary_threshold_days: input.summaryThresholdDays ?? item.summary_threshold_days,
            }
          : item,
      ),
    );

    try {
      await updateTodoProject(project.id, input);
    } catch (updateError) {
      setProjects(previous);
      setError(updateError instanceof Error ? updateError.message : "Failed to update project settings.");
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) {
      return;
    }

    setChatMessages((current) => [...current, { role: "user", text: message }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const providerToken = session?.provider_token ?? null;
      const result = await invokeTodoAgent({ message, providerToken, autoSyncCalendar: Boolean(providerToken) });
      setTodos(result.todos);
      setChatMessages((current) => [...current, { role: "assistant", text: result.reply }]);
    } catch (chatError) {
      const text = chatError instanceof Error ? chatError.message : "Chat command failed.";
      setError(text);
      setChatMessages((current) => [...current, { role: "assistant", text }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleCalendarSync() {
    const providerToken = session?.provider_token;
    if (!providerToken) {
      await signIn("https://www.googleapis.com/auth/calendar.events", window.location.hash || "#/todo/workspace");
      return;
    }

    setIsCalendarSyncing(true);
    try {
      const result = await syncTodosToGoogleCalendar(providerToken);
      setTodos(result.todos);
      setChatMessages((current) => [...current, { role: "assistant", text: `Synced ${result.synced} task${result.synced === 1 ? "" : "s"} to Google Calendar.` }]);
    } catch (syncError) {
      const text = syncError instanceof Error ? (syncError.message.includes("404") ? "Calendar sync backend is not reachable right now." : syncError.message) : "Calendar sync failed.";
      setError(text);
      setChatMessages((current) => [...current, { role: "assistant", text }]);
    } finally {
      setIsCalendarSyncing(false);
    }
  }

  if (!isConfigured) {
    return (
      <section className={`todo-workspace todo-auth-shell theme-${theme}`}>
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
      <section className={`todo-workspace todo-auth-shell theme-${theme}`}>
        <div className="todo-auth-card">
          <p className="todo-auth-kicker">TODO Tool</p>
          <h1>Checking your session</h1>
        </div>
      </section>
    );
  }

  if (!session) {
    return <Navigate to="/todo/login" replace />;
  }

  const selectedProjectRecord = workspace.kind === "project" ? projects.find((project) => project.name === workspace.name) ?? null : null;
  const pageTitle = workspace.kind === "home" ? "Home" : workspace.kind === "my_tasks" ? "My tasks" : workspace.name;
  const pageSubtitle = workspace.kind === "home" ? "Overview of your projects and task status." : workspace.kind === "my_tasks" ? "Everything assigned to you across all projects." : "Project overview and grouped tasks.";
  const editingTodo = editingTodoId ? todos.find((todo) => todo.id === editingTodoId) ?? null : null;
  const availableViews =
    workspace.kind === "project"
      ? (["list", "board", "gantt", "calendar", "dashboard", "files"] as TaskView[])
      : (["list", "board", "calendar", "dashboard", "files"] as TaskView[]);

  return (
    <section className={`todo-workspace theme-${theme} todo-asana-shell ${sidebarCollapsed ? "sidebar-collapsed" : "sidebar-expanded"} ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}>
      <header className="todo-global-topbar">
        <div className="todo-asana-headerleft">
          <button type="button" className="todo-hamburger-button" onClick={handleSidebarToggle} aria-label="Toggle sidebar">
            <span />
            <span />
            <span />
          </button>
        </div>
        <div className="todo-asana-searchwrap">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, projects, goals" />
        </div>
        <div className="todo-profile-menu" ref={profileMenuRef}>
          <button
            type="button"
            className="todo-profile-trigger"
            onClick={() => setShowProfileMenu((current) => !current)}
            aria-label="Open profile menu"
            aria-expanded={showProfileMenu}
          >
            <span className="todo-avatar-dot">{(session.user.email ?? "me").slice(0, 2).toUpperCase()}</span>
          </button>
          {showProfileMenu ? (
            <div className="todo-profile-popover">
              <div className="todo-profile-summary">
                <strong>{session.user.email ?? "Signed in"}</strong>
                <span>Personal workspace</span>
              </div>
              <button type="button" className="todo-profile-action" onClick={toggleTheme}>
                {theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              </button>
              <button
                type="button"
                className="todo-profile-action"
                onClick={() => {
                  setShowProfileMenu(false);
                  void handleCalendarSync();
                }}
              >
                {isCalendarSyncing ? "Syncing calendar..." : session.provider_token ? "Sync Google Calendar" : "Connect Google Calendar"}
              </button>
              <button
                type="button"
                className="todo-profile-action danger"
                onClick={() => {
                  setShowProfileMenu(false);
                  void signOut();
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="todo-shell-body">
        <aside className="todo-sidebar todo-asana-sidebar">
          <div className="todo-sidebar-top">
            <button type="button" className="todo-create-button" onClick={() => setEditingTodoId(null)}>
              <span className="todo-create-plus">+</span>
              <span>Create</span>
            </button>
          </div>

          <nav className="todo-asana-nav">
            <button type="button" className={`todo-nav-item ${workspace.kind === "home" ? "active" : ""}`} onClick={() => setWorkspace({ kind: "home" })}>
              <span className="todo-sidebar-icon" aria-hidden="true" />
              <span>Home</span>
            </button>
            <button type="button" className={`todo-nav-item ${workspace.kind === "my_tasks" ? "active" : ""}`} onClick={() => setWorkspace({ kind: "my_tasks" })}>
              <span className="todo-sidebar-icon" aria-hidden="true" />
              <span>My tasks</span>
            </button>
            <button type="button" className="todo-nav-item muted" disabled>
              <span className="todo-sidebar-icon alert" aria-hidden="true" />
              <span>Inbox</span>
            </button>
          </nav>

          <div className="todo-sidebar-divider" />

          <div className="todo-sidebar-section">
            <div className="todo-sidebar-heading todo-sidebar-heading-row">
              <span>Insights</span>
              <button type="button" className="todo-sidebar-add-button" disabled>+</button>
            </div>
            <div className="todo-sidebar-links">
              <button type="button" className="todo-nav-item muted" disabled>
                <span className="todo-sidebar-icon" aria-hidden="true" />
                <span>Reporting</span>
              </button>
              <button type="button" className="todo-nav-item muted" disabled>
                <span className="todo-sidebar-icon" aria-hidden="true" />
                <span>Portfolios</span>
              </button>
              <button type="button" className="todo-nav-item muted" disabled>
                <span className="todo-sidebar-icon" aria-hidden="true" />
                <span>Goals</span>
              </button>
            </div>
          </div>

          <div className="todo-sidebar-section">
            <div className="todo-sidebar-heading todo-sidebar-heading-row">
              <span>Projects</span>
              <button type="button" className="todo-sidebar-add-button" onClick={() => void 0}>+</button>
            </div>
            <div className="todo-project-list todo-project-list-stacked">
              {projectSummaries.map((project) => (
                <button key={project.name} type="button" className={`todo-project-chip ${workspace.kind === "project" && workspace.name === project.name ? "active" : ""}`} onClick={() => setWorkspace({ kind: "project", name: project.name })}>
                  <span className="todo-project-swatch" aria-hidden="true" />
                  <span>{project.name}</span>
                  <strong>{project.open}</strong>
                </button>
              ))}
            </div>
            {!sidebarCollapsed ? (
              <form className="todo-inline-form" onSubmit={handleCreateProject}>
                <input type="text" value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} placeholder="Add project" maxLength={80} />
                <button type="submit" className="todo-secondary-button" disabled={isProjectSaving}>
                  {isProjectSaving ? "..." : "+"}
                </button>
              </form>
            ) : null}
          </div>

          <div className="todo-sidebar-section">
            <div className="todo-sidebar-heading">Teams</div>
            <button type="button" className="todo-nav-item muted" disabled>
              <span className="todo-sidebar-icon" aria-hidden="true" />
              <span>IT Team</span>
            </button>
          </div>
        </aside>

        {mobileSidebarOpen ? <button type="button" className="todo-mobile-sidebar-scrim" onClick={() => setMobileSidebarOpen(false)} aria-label="Close sidebar" /> : null}

        <main className="todo-main-shell todo-asana-main">
          <section className="todo-asana-surface">
            <div className="todo-page-header-row">
              <div>
                <p className="todo-page-date">{formatFullDate(startOfToday())}</p>
                <h1>{workspace.kind === "home" ? "Good evening" : pageTitle}</h1>
                <p className="todo-page-subtitle">{pageSubtitle}</p>
              </div>
              {workspace.kind === "project" && selectedProjectRecord ? (
                <div className="todo-project-reminder-card">
                  <label className="todo-checkbox-field compact">
                    <input type="checkbox" checked={selectedProjectRecord.daily_summary_enabled} onChange={(event) => void handleProjectReminderChange(selectedProjectRecord, { dailySummaryEnabled: event.target.checked })} />
                    <span>Daily summary</span>
                  </label>
                  <label className="todo-select-field compact-select">
                    <span>Due soon threshold</span>
                    <select value={selectedProjectRecord.summary_threshold_days} onChange={(event) => void handleProjectReminderChange(selectedProjectRecord, { summaryThresholdDays: Number(event.target.value) })}>
                      <option value="1">1 day</option>
                      <option value="3">3 days</option>
                      <option value="5">5 days</option>
                      <option value="7">7 days</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>

            {workspace.kind === "home" ? (
              <div className="todo-home-grid">
              <section className="todo-home-hero-card">
                <div className="todo-home-hero-head">
                  <h2>Projects</h2>
                  <span>{projectSummaries.length} total</span>
                </div>
                <div className="todo-project-card-grid">
                  {projectSummaries.map((project) => (
                    <button key={project.name} type="button" className="todo-project-card" onClick={() => setWorkspace({ kind: "project", name: project.name })}>
                      <strong>{project.name}</strong>
                      <span>{project.open} open tasks</span>
                      <div className="todo-project-card-meta">
                        <span>{project.upcoming} upcoming</span>
                        <span>{project.overdue} overdue</span>
                        <span>{project.completed} completed</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="todo-home-lists-card">
                <div className="todo-section-head"><div><h3>Upcoming</h3><p>Tasks approaching due date.</p></div></div>
                <div className="todo-summary-list">
                  {homeSummary.upcoming.length === 0 ? <div className="todo-empty compact-empty">No upcoming tasks.</div> : null}
                  {homeSummary.upcoming.map((todo) => (
                    <button key={todo.id} type="button" className="todo-summary-item" onClick={() => startEditing(todo)}>
                      <strong>{todo.title}</strong>
                      <span>{todo.project_name} · {formatDueLabel(todo.due_date)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="todo-home-lists-card">
                <div className="todo-section-head"><div><h3>Overdue</h3><p>Tasks already slipping.</p></div></div>
                <div className="todo-summary-list">
                  {homeSummary.overdue.length === 0 ? <div className="todo-empty compact-empty">No overdue tasks.</div> : null}
                  {homeSummary.overdue.map((todo) => (
                    <button key={todo.id} type="button" className="todo-summary-item danger" onClick={() => startEditing(todo)}>
                      <strong>{todo.title}</strong>
                      <span>{todo.project_name} · {formatDueLabel(todo.due_date)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="todo-home-lists-card">
                <div className="todo-section-head"><div><h3>Completed</h3><p>Recently closed work.</p></div></div>
                <div className="todo-summary-list">
                  {homeSummary.completed.length === 0 ? <div className="todo-empty compact-empty">No completed tasks yet.</div> : null}
                  {homeSummary.completed.map((todo) => (
                    <button key={todo.id} type="button" className="todo-summary-item success" onClick={() => startEditing(todo)}>
                      <strong>{todo.title}</strong>
                      <span>{todo.project_name}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            ) : (
              <>
              <div className="todo-asana-tabs-shell">
                <div className="todo-page-identity">
                  <span className="todo-avatar-dot">{(workspace.kind === "project" ? workspace.name : "My tasks").slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{workspace.kind === "project" ? workspace.name : "My tasks"}</strong>
                  </div>
                </div>
                <div className="todo-asana-tabs-row">
                  <div className="todo-tabs-scroll">
                    <div className="todo-view-switcher todo-asana-view-switcher">
                      {availableViews.map((item) => (
                        <button key={item} type="button" className={`todo-view-chip ${taskView === item ? "active" : ""}`} onClick={() => setTaskView(item)}>
                          {item.charAt(0).toUpperCase() + item.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <section className="todo-asana-toolbar">
                <form className="todo-create-inline" onSubmit={handleCreateTodo}>
                  <button type="submit" className="todo-primary-button" disabled={isSaving}>{isSaving ? "Saving..." : "+ Add task"}</button>
                  <input type="text" value={createDraft.title} onChange={(event) => setCreateDraftField("title", event.target.value)} placeholder="Task title" maxLength={120} />
                  <input type="date" value={createDraft.dueDate} onChange={(event) => setCreateDraftField("dueDate", event.target.value)} />
                  <select value={createDraft.projectName} onChange={(event) => setCreateDraftField("projectName", event.target.value)}>
                    {projectNames.map((projectName) => (
                      <option key={projectName} value={projectName}>{projectName}</option>
                    ))}
                  </select>
                </form>

                <div className="todo-toolbar-action-row">
                  <div className="todo-toolbar-menu-wrap">
                    <button type="button" className={`todo-toolbar-menu-button ${showFilters ? "active" : ""}`} onClick={() => { setShowFilters((current) => !current); setShowSort(false); setShowGroup(false); }}>
                      Filter
                    </button>
                    {showFilters ? (
                      <div className="todo-toolbar-popover todo-filter-popover">
                        <div className="todo-popover-head">
                          <strong>Filters</strong>
                          <button type="button" className="todo-inline-button" onClick={() => setFilterPreset("all")}>Clear</button>
                        </div>
                        <div className="todo-filter-chip-row">
                          {([
                            ["all", "All tasks"],
                            ["incomplete", "Incomplete tasks"],
                            ["completed", "Completed tasks"],
                            ["due_this_week", "Due this week"],
                            ["due_next_week", "Due next week"],
                            ["overdue", "Overdue"],
                          ] as Array<[FilterPreset, string]>).map(([key, label]) => (
                            <button key={key} type="button" className={`todo-filter-chip ${filterPreset === key ? "active" : ""}`} onClick={() => setFilterPreset(key)}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="todo-toolbar-menu-wrap">
                    <button type="button" className={`todo-toolbar-menu-button ${showSort ? "active" : ""}`} onClick={() => { setShowSort((current) => !current); setShowFilters(false); setShowGroup(false); }}>
                      Sort
                    </button>
                    {showSort ? (
                      <div className="todo-toolbar-popover todo-list-popover">
                        {([
                          ["due_date", "Due date"],
                          ["created_on", "Created on"],
                          ["completed_on", "Completed on"],
                          ["alphabetical", "Alphabetical"],
                          ["project", "Project"],
                        ] as Array<[SortKey, string]>).map(([key, label]) => (
                          <button key={key} type="button" className={`todo-popover-option ${sortKey === key ? "active" : ""}`} onClick={() => setSortKey(key)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="todo-toolbar-menu-wrap">
                    <button type="button" className={`todo-toolbar-menu-button ${showGroup ? "active" : ""}`} onClick={() => { setShowGroup((current) => !current); setShowFilters(false); setShowSort(false); }}>
                      Group
                    </button>
                    {showGroup ? (
                      <div className="todo-toolbar-popover todo-group-popover">
                        <div className="todo-popover-head">
                          <strong>Groups</strong>
                          <button type="button" className="todo-inline-button" onClick={() => setGroupBy("sections")}>Clear</button>
                        </div>
                        <div className="todo-group-row">
                          <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupKey)}>
                            <option value="sections">Sections</option>
                            <option value="project">Project</option>
                            <option value="due_bucket">Due bucket</option>
                            <option value="completion">Completion</option>
                          </select>
                          <div className="todo-pill">Custom order</div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button type="button" className="todo-toolbar-menu-button muted">Options</button>
                </div>
              </section>

              {error ? <p className="error-text">{error}</p> : null}

              {taskView === "list" ? (
                <section className="todo-content-card todo-asana-list-card">
                  <div className="todo-table-header">
                    <span>Name</span>
                    <span>Due date</span>
                    <span>Projects</span>
                    <span>Section</span>
                    <span>Task actions</span>
                  </div>
                  {isLoading ? <div className="todo-empty">Loading tasks...</div> : null}
                  {!isLoading && groupedTodos.length === 0 ? <div className="todo-empty">No tasks match this view.</div> : null}
                  {groupedTodos.map((group) => (
                    <div key={group.label} className="todo-group-block">
                      <div className="todo-group-title">{group.label}</div>
                      {group.items.map((todo) => (
                        <TodoRow key={todo.id} todo={todo} onToggle={handleToggleTodo} onEdit={startEditing} onDelete={handleDeleteTodo} />
                      ))}
                      {!group.label.toLowerCase().includes("completed") ? (
                        <div className="todo-inline-add-row">
                          <button type="button" className="todo-inline-add-button" onClick={() => void handleInlineCreateTodo(group.label)}>
                            +
                          </button>
                          <input
                            type="text"
                            value={inlineSectionDrafts[group.label] ?? ""}
                            onChange={(event) => setInlineSectionDraft(group.label, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleInlineCreateTodo(group.label);
                              }
                            }}
                            placeholder="Add task..."
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {taskView === "board" ? (
                <section className="todo-board-grid todo-asana-board-grid">
                  {groupedTodos.map((group) => (
                    <article key={group.label} className="todo-board-column" onDragOver={(event) => event.preventDefault()} onDrop={() => void handleDropToSection(group.label)}>
                      <header className="todo-board-column-head">
                        <div><h3>{group.label}</h3><p>{group.items.length} tasks</p></div>
                        <strong>{group.items.filter((item) => getTodoTone(item) === "soon").length} due soon</strong>
                      </header>
                      <div className="todo-board-column-body">
                        {group.items.length === 0 ? <div className="todo-board-empty">Drop tasks here</div> : null}
                        {group.items.map((todo) => (
                          <article key={todo.id} className={`todo-board-card ${getTodoTone(todo)}`} draggable onDragStart={() => setDraggedTodoId(todo.id)}>
                            <div className="todo-board-card-top">
                              <button type="button" className={`todo-check ${todo.completed_at ? "checked" : ""}`} onClick={() => handleToggleTodo(todo)}>
                                <span />
                              </button>
                              <div className="todo-board-card-title-wrap">
                                <button type="button" className="todo-board-card-title" onClick={() => startEditing(todo)}>{todo.title}</button>
                                {todo.details ? <p className="todo-board-card-copy">{todo.details}</p> : null}
                              </div>
                            </div>
                            <div className="todo-board-card-meta">
                              <span>{formatDueLabel(todo.due_date)}</span>
                              <span className="todo-pill">{todo.project_name}</span>
                            </div>
                            <div className="todo-board-card-tags">
                              <span className="todo-pill subtle">{group.label}</span>
                              {todo.goal_name ? <span className="todo-pill subtle">{todo.goal_name}</span> : null}
                            </div>
                          </article>
                        ))}
                        {!group.label.toLowerCase().includes("completed") ? (
                          <div className="todo-board-add-card">
                            <input
                              type="text"
                              value={inlineSectionDrafts[group.label] ?? ""}
                              onChange={(event) => setInlineSectionDraft(group.label, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleInlineCreateTodo(group.label);
                                }
                              }}
                              placeholder="+ Add task"
                            />
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}

              {taskView === "calendar" ? (
                <section className="todo-content-card">
                  <div className="todo-calendar-head">
                    <button type="button" className="todo-inline-button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>Previous</button>
                    <h3>{formatMonthLabel(calendarMonth)}</h3>
                    <button type="button" className="todo-inline-button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>Next</button>
                  </div>
                  <div className="todo-calendar-grid">
                    {WEEKDAY_LABELS.map((day) => <span key={day} className="todo-calendar-weekday">{day}</span>)}
                    {calendarGrid.map((day) => {
                      const key = toIsoDay(day);
                      const items = calendarMap.get(key) ?? [];
                      return (
                        <div key={key} className={`todo-calendar-cell ${isSameMonth(day, calendarMonth) ? "" : "muted"} ${key === toIsoDay(startOfToday()) ? "today" : ""}`}>
                          <div className="todo-calendar-date">{formatDayNumber(day)}</div>
                          <div className="todo-calendar-events">
                            {items.slice(0, 3).map((todo) => <div key={todo.id} className={`todo-calendar-event ${getTodoTone(todo)}`}>{todo.title}</div>)}
                            {items.length > 3 ? <div className="todo-calendar-more">+{items.length - 3} more</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {taskView === "gantt" ? (
                <section className="todo-content-card todo-gantt-view-card">
                  <div className="todo-section-head">
                    <div>
                      <h3>Timeline</h3>
                      <p>Project schedule across a shared time range.</p>
                    </div>
                  </div>
                  {!ganttRange ? <div className="todo-empty compact-empty">Add due dates to render the timeline.</div> : (
                    <div className="todo-gantt todo-gantt-expanded">
                      <div className="todo-gantt-header">
                        <span className="todo-gantt-header-spacer" />
                        {Array.from({ length: ganttRange.days }, (_, index) => {
                          const day = new Date(ganttRange.start);
                          day.setDate(ganttRange.start.getDate() + index);
                          return <span key={toIsoDay(day)}>{day.toLocaleDateString([], { month: "short", day: "numeric" })}</span>;
                        })}
                      </div>
                      {filteredTodos.filter((todo) => Boolean(todo.due_date)).map((todo) => {
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
                              <span>{todo.project_name}</span>
                            </div>
                            <div className="todo-gantt-track">
                              <button
                                type="button"
                                className={`todo-gantt-bar ${getTodoTone(todo)}`}
                                style={{ left: `${(offset / ganttRange.days) * 100}%`, width: `${Math.max((span / ganttRange.days) * 100, 3)}%` }}
                                onClick={() => startEditing(todo)}
                              >
                                {todo.title}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {filteredTodos.filter((todo) => !todo.due_date).length > 0 ? (
                        <div className="todo-gantt-unscheduled">
                          <strong>Unscheduled</strong>
                          <div className="todo-gantt-unscheduled-list">
                            {filteredTodos.filter((todo) => !todo.due_date).map((todo) => (
                              <button key={todo.id} type="button" className="todo-pill subtle" onClick={() => startEditing(todo)}>
                                {todo.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}

              {taskView === "dashboard" ? (
                <section className="todo-dashboard-grid">
                  {dashboardMetrics.map((metric) => (
                    <article key={metric.label} className="todo-metric-card">
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                      <small>{metric.helper}</small>
                    </article>
                  ))}
                  <article className="todo-content-card todo-dashboard-panel">
                    <div className="todo-section-head"><div><h3>Total tasks by section</h3><p>Grouped according to current filters.</p></div></div>
                    <MiniBarChart items={sectionChart.length > 0 ? sectionChart : [{ label: "Empty", value: 0, tone: "done" }]} />
                  </article>
                  <article className="todo-content-card todo-dashboard-panel">
                    <div className="todo-section-head"><div><h3>Tasks by completion status</h3><p>Completion balance in this view.</p></div></div>
                    <div className="todo-donut-wrap">
                      <DonutChart complete={completionStats.complete} incomplete={completionStats.incomplete} />
                    </div>
                  </article>
                  <article className="todo-content-card todo-dashboard-panel todo-gantt-panel">
                    <div className="todo-section-head"><div><h3>Timeline</h3><p>Due-date spread for visible tasks.</p></div></div>
                    {!ganttRange ? <div className="todo-empty compact-empty">Add due dates to render the timeline.</div> : (
                      <div className="todo-gantt">
                        <div className="todo-gantt-header">
                          {Array.from({ length: ganttRange.days }, (_, index) => {
                            const day = new Date(ganttRange.start);
                            day.setDate(ganttRange.start.getDate() + index);
                            return <span key={toIsoDay(day)}>{day.toLocaleDateString([], { month: "short", day: "numeric" })}</span>;
                          })}
                        </div>
                        {filteredTodos.filter((todo) => Boolean(todo.due_date)).map((todo) => {
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
                              <div className="todo-gantt-label"><strong>{todo.title}</strong><span>{todo.project_name}</span></div>
                              <div className="todo-gantt-track"><div className={`todo-gantt-bar ${getTodoTone(todo)}`} style={{ left: `${(offset / ganttRange.days) * 100}%`, width: `${Math.max((span / ganttRange.days) * 100, 3)}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                </section>
              ) : null}

              {taskView === "files" ? (
                <section className="todo-content-card todo-files-card">
                  <div className="todo-section-head"><div><h3>Files</h3><p>Reasonable first pass: task notes and references extracted as file-like entries.</p></div></div>
                  <div className="todo-files-list">
                    {filteredTodos.filter((todo) => Boolean(todo.details)).length === 0 ? <div className="todo-empty">No notes or reference files yet.</div> : null}
                    {filteredTodos.filter((todo) => Boolean(todo.details)).map((todo) => (
                      <article key={todo.id} className="todo-file-row">
                        <div>
                          <strong>{todo.title}</strong>
                          <p>{todo.details}</p>
                        </div>
                        <div className="todo-file-meta">
                          <span>{todo.project_name}</span>
                          <span>{formatDueLabel(todo.due_date)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              </>
            )}
          </section>
        </main>
      </div>

      <aside className={`todo-chat-dock ${isChatOpen ? "open" : "closed"}`}>
        <button type="button" className="todo-chat-toggle" onClick={() => setIsChatOpen((current) => !current)}>{isChatOpen ? "Hide MCP Chat" : "Open MCP Chat"}</button>
        {isChatOpen ? (
          <div className="todo-chat-panel">
            <div className="todo-chat-head"><strong>MCP Task Chat</strong><p>Use natural language to create, update, delete, list, and sync tasks.</p></div>
            <div className="todo-chat-body">
              {chatMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`todo-chat-bubble ${message.role}`}>{message.text}</div>)}
            </div>
            <form className="todo-chat-form" onSubmit={handleChatSubmit}>
              <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} rows={3} placeholder='Example: add "book dentist" tomorrow in project personal section do today' />
              <button type="submit" className="todo-primary-button" disabled={isChatLoading}>{isChatLoading ? "Working..." : "Send"}</button>
            </form>
          </div>
        ) : null}
      </aside>

      {editingTodoId ? <button type="button" className="todo-detail-scrim" aria-label="Close task details" onClick={() => setEditingTodoId(null)} /> : null}
      {editingTodoId ? (
        <aside className="todo-detail-drawer">
          <div className="todo-detail-approval">
            <span>This task detail is private to your workspace.</span>
          </div>
          <form className="todo-detail-shell" onSubmit={handleSaveEdit}>
            <div className="todo-detail-head">
              <input
                className="todo-detail-title-input"
                type="text"
                value={editDraft.title}
                onChange={(event) => setEditDraftField("title", event.target.value)}
                maxLength={120}
                placeholder="Task title"
              />
              <button type="button" className="todo-detail-close" onClick={() => setEditingTodoId(null)} aria-label="Close task details">
                x
              </button>
            </div>

            <div className="todo-detail-meta-list">
              <div className="todo-detail-row">
                <span>Assignee</span>
                <strong>{session.user.email ?? "Signed in"}</strong>
              </div>
              <div className="todo-detail-row">
                <span>Due date</span>
                <input type="date" value={editDraft.dueDate} onChange={(event) => setEditDraftField("dueDate", event.target.value)} />
              </div>
              <div className="todo-detail-row">
                <span>Project</span>
                <input type="text" value={editDraft.projectName} onChange={(event) => setEditDraftField("projectName", event.target.value)} maxLength={80} />
              </div>
              <div className="todo-detail-row">
                <span>Section</span>
                <input type="text" value={editDraft.sectionName} onChange={(event) => setEditDraftField("sectionName", event.target.value)} maxLength={80} />
              </div>
              <div className="todo-detail-row">
                <span>Goal</span>
                <input type="text" value={editDraft.goalName} onChange={(event) => setEditDraftField("goalName", event.target.value)} maxLength={120} placeholder="Goal" />
              </div>
              <div className="todo-detail-row">
                <span>Milestone</span>
                <label className="todo-checkbox-field compact">
                  <input type="checkbox" checked={editDraft.isMilestone} onChange={(event) => setEditDraftField("isMilestone", event.target.checked)} />
                  <span>{editDraft.isMilestone ? "Yes" : "No"}</span>
                </label>
              </div>
            </div>

            <div className="todo-detail-section">
              <h3>Notes</h3>
              <textarea value={editDraft.details} onChange={(event) => setEditDraftField("details", event.target.value)} rows={6} maxLength={400} placeholder="Add notes" />
            </div>

            {editingTodo ? (
              <div className="todo-detail-section">
                <h3>Context</h3>
                <div className="todo-detail-context">
                  <span>Created {formatShortDateTime(editingTodo.created_at)}</span>
                  <span>{editingTodo.project_name}</span>
                  <span>{editingTodo.section_name}</span>
                </div>
              </div>
            ) : null}

            <div className="todo-editor-actions todo-detail-actions">
              <button type="submit" className="todo-primary-button">Save changes</button>
              <button type="button" className="todo-secondary-button" onClick={() => setEditingTodoId(null)}>Cancel</button>
            </div>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
