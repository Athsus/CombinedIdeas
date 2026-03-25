import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import FlashCardsStudioPage from "./pages/FlashCardsStudioPage";
import GomokuPage from "./pages/GomokuPage";
import ProductIndexPage from "./pages/ProductIndexPage";
import StudyToolsHomePage from "./pages/StudyToolsHomePage";
import TodoToolPage from "./pages/TodoToolPage";

const PAGE_TITLES: Record<string, string> = {
  "/": "Ideas Combine",
  "/gomoku": "Gomoku | Ideas Combine",
  "/study-tools": "Study Tools | Ideas Combine",
  "/study-tools/flash-cards": "Flash Cards Studio | Ideas Combine",
  "/todo": "TODO Tool | Ideas Combine",
};

function RouteTitleSync() {
  const location = useLocation();

  useEffect(() => {
    document.title = PAGE_TITLES[location.pathname] ?? "Ideas Combine";
  }, [location.pathname]);

  return null;
}

export default function App() {
  const location = useLocation();
  const shellClassName = location.pathname === "/todo" ? "app-shell todo-app-shell" : "app-shell";

  return (
    <div className={shellClassName}>
      <RouteTitleSync />
      <Routes>
        <Route path="/" element={<ProductIndexPage />} />
        <Route path="/gomoku" element={<GomokuPage />} />
        <Route path="/study-tools" element={<StudyToolsHomePage />} />
        <Route path="/study-tools/flash-cards" element={<FlashCardsStudioPage />} />
        <Route path="/todo" element={<TodoToolPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
