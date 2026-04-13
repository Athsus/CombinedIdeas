import { Link, Navigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth";
import { useTodoTheme } from "../todoTheme";
import "../todo.css";

export default function TodoLoginPage() {
  const { session, signIn, isConfigured, isReady } = useAuth();
  const { theme, toggleTheme } = useTodoTheme();
  const [email, setEmail] = useState("");

  if (session) {
    return <Navigate to="/todo/workspace" replace />;
  }

  if (!isConfigured) {
    return (
      <section className={`todo-login-page theme-${theme}`}>
        <div className="todo-auth-card">
          <p className="todo-auth-kicker">TODO Login</p>
          <h1>Private task space</h1>
          <p>Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Google sign-in and synced tasks.</p>
          <div className="todo-auth-actions">
            <button type="button" className="todo-secondary-button" onClick={toggleTheme}>
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
            <Link className="todo-auth-link" to="/todo">
              Back to TODO
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`todo-login-page theme-${theme}`}>
      <button type="button" className="todo-theme-corner-button" onClick={toggleTheme}>
        {theme === "light" ? "Dark mode" : "Light mode"}
      </button>

      <div className="todo-login-minimal-shell">
        <div className="todo-login-minimal-head">
          <h1>Welcome to TODO</h1>
          <p>Sign in to get started.</p>
        </div>

        <button type="button" className="todo-google-login-button" onClick={() => void signIn(undefined, "#/todo/workspace")} disabled={!isReady}>
          <span className="todo-google-mark" aria-hidden="true">
            G
          </span>
          <span>{isReady ? "Continue with Google" : "Checking session..."}</span>
        </button>

        <div className="todo-login-divider" aria-hidden="true">
          <span />
          <strong>OR</strong>
          <span />
        </div>

        <label className="todo-login-field">
          <span>Email address</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="" />
        </label>

        <button type="button" className="todo-login-continue-button" disabled>
          Continue
        </button>

        <div className="todo-login-footer">
          <Link className="todo-auth-link" to="/todo">
            Back to TODO
          </Link>
        </div>
      </div>
    </section>
  );
}
