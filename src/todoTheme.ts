import { useEffect, useState } from "react";

export type TodoTheme = "light" | "dark";

const TODO_THEME_STORAGE_KEY = "ideas-combine.todo-theme";

function getPreferredTheme(): TodoTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(TODO_THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTodoTheme() {
  const [theme, setTheme] = useState<TodoTheme>(() => getPreferredTheme());

  useEffect(() => {
    window.localStorage.setItem(TODO_THEME_STORAGE_KEY, theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((current) => (current === "light" ? "dark" : "light")),
    setTheme,
  };
}
