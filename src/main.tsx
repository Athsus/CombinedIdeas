import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { getAuthReturnHashStorageKey } from "./supabase";
import "./styles.css";

const hasOAuthCode = new URLSearchParams(window.location.search).has("code");
const hasHashRoute = window.location.hash.startsWith("#/");

if (hasOAuthCode && !hasHashRoute) {
  const returnHash = window.localStorage.getItem(getAuthReturnHashStorageKey()) || "#/todo/workspace";
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${returnHash}`);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>,
);
