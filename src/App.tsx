import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { BOARD_SIZE, createBoard, getNextPlayer, getStatusText, getWinner, isBoardFull, placeStone } from "./gomoku";
import { insertGomokuSession, isSupabaseReady } from "./supabase";

function HomePage() {
  return (
    <section className="panel">
      <p className="eyebrow">Small products workspace</p>
      <h1>Ideas Combine</h1>
      <p className="lead">
        This app will host multiple small products. The first shipped product is Gomoku.
      </p>
      <div className="card-grid">
        <article className="card">
          <h2>Gomoku</h2>
          <p>Playable local-first version with winner detection and restart flow.</p>
          <Link className="button" to="/gomoku">
            Open product
          </Link>
        </article>
      </div>
    </section>
  );
}

function GomokuPage() {
  const [board, setBoard] = useState(() => createBoard());
  const [currentPlayer, setCurrentPlayer] = useState<"black" | "white">("black");
  const [moveCount, setMoveCount] = useState(0);
  const [analyticsMessage, setAnalyticsMessage] = useState(
    isSupabaseReady() ? "Analytics ready" : "Analytics disabled until Supabase env is configured",
  );
  const gameStartedAtRef = useRef(Date.now());
  const hasLoggedCurrentGameRef = useRef(false);

  const winner = useMemo(() => getWinner(board), [board]);
  const isDraw = useMemo(() => !winner && isBoardFull(board), [board, winner]);
  const statusText = getStatusText(winner, currentPlayer, isDraw);

  useEffect(() => {
    if ((!winner && !isDraw) || hasLoggedCurrentGameRef.current || moveCount === 0) {
      return;
    }

    hasLoggedCurrentGameRef.current = true;

    const finishedAt = new Date().toISOString();
    const startedAt = new Date(gameStartedAtRef.current).toISOString();
    const durationMs = Date.now() - gameStartedAtRef.current;
    const outcome = winner === "black" ? "black_win" : winner === "white" ? "white_win" : "draw";

    void insertGomokuSession({
      outcome,
      winner,
      move_count: moveCount,
      board_size: BOARD_SIZE,
      duration_ms: durationMs,
      started_at: startedAt,
      finished_at: finishedAt,
    })
      .then(() => {
        setAnalyticsMessage("Game result saved to Supabase");
      })
      .catch(() => {
        setAnalyticsMessage("Supabase save failed");
      });
  }, [winner, isDraw, moveCount]);

  function handleCellClick(row: number, col: number) {
    if (winner || isDraw || board[row][col] !== null) {
      return;
    }

    setBoard((previousBoard) => placeStone(previousBoard, row, col, currentPlayer));
    setMoveCount((previousCount) => previousCount + 1);
    setCurrentPlayer((previousPlayer) => getNextPlayer(previousPlayer));
  }

  function handleReset() {
    if (moveCount > 0 && !winner && !isDraw && !hasLoggedCurrentGameRef.current) {
      hasLoggedCurrentGameRef.current = true;

      void insertGomokuSession({
        outcome: "abandoned",
        winner: null,
        move_count: moveCount,
        board_size: BOARD_SIZE,
        duration_ms: Date.now() - gameStartedAtRef.current,
        started_at: new Date(gameStartedAtRef.current).toISOString(),
        finished_at: new Date().toISOString(),
      })
        .then(() => {
          setAnalyticsMessage("Abandoned game saved to Supabase");
        })
        .catch(() => {
          setAnalyticsMessage("Supabase save failed");
        });
    }

    setBoard(createBoard());
    setCurrentPlayer("black");
    setMoveCount(0);
    gameStartedAtRef.current = Date.now();
    hasLoggedCurrentGameRef.current = false;
  }

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Product 01</p>
          <h1>Gomoku</h1>
        </div>
        <Link className="text-link" to="/">
          Back to home
        </Link>
      </div>

      <div className="game-layout">
        <div className="status-card">
          <p className="status-label">Status</p>
          <p className="status-value">{statusText}</p>
          <button className="button secondary" type="button" onClick={handleReset}>
            Restart game
          </button>
          <ul className="notes">
            <li>Board size: {BOARD_SIZE} x {BOARD_SIZE}</li>
            <li>Black moves first.</li>
            <li>GitHub Pages friendly routing uses hash-based URLs.</li>
            <li>Moves played: {moveCount}</li>
            <li>{analyticsMessage}</li>
          </ul>
        </div>

        <div className="board" role="grid" aria-label="Gomoku board">
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                className="cell"
                type="button"
                onClick={() => handleCellClick(rowIndex, colIndex)}
                aria-label={`Row ${rowIndex + 1} Column ${colIndex + 1}`}
              >
                {cell ? <span className={`stone ${cell}`} /> : null}
              </button>
            )),
          )}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/gomoku" element={<GomokuPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
