import { Navigate, Route, Routes } from "react-router-dom";
import FlashCardsStudioPage from "./pages/FlashCardsStudioPage";
import GomokuPage from "./pages/GomokuPage";
import ProductIndexPage from "./pages/ProductIndexPage";
import StudyToolsHomePage from "./pages/StudyToolsHomePage";

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<ProductIndexPage />} />
        <Route path="/gomoku" element={<GomokuPage />} />
        <Route path="/study-tools" element={<StudyToolsHomePage />} />
        <Route path="/study-tools/flash-cards" element={<FlashCardsStudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
