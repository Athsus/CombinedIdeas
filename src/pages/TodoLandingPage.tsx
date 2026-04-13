import { Link } from "react-router-dom";
import { useTodoTheme } from "../todoTheme";
import "../todo.css";

export default function TodoLandingPage() {
  const { theme, toggleTheme } = useTodoTheme();

  return (
    <section className={`todo-marketing-page theme-${theme}`}>
      <button type="button" className="todo-theme-corner-button" onClick={toggleTheme}>
        {theme === "light" ? "Dark mode" : "Light mode"}
      </button>

      <div className="todo-marketing-minimal">
        <p className="todo-auth-kicker">TODO</p>
        <h1>Private planning workspace.</h1>
        <p>Projects, due dates, calendar sync, and natural language task control.</p>
        <Link className="todo-auth-link" to="/todo/login">
          Sign in
        </Link>
      </div>
    </section>
  );
}
