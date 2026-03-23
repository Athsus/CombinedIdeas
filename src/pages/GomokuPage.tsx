import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BOARD_SIZE,
  type Board,
  type CellValue,
  createBoard,
  getStatusText,
  getWinner,
  isBoardFull,
  placeStone,
} from "../gomoku";
import { insertGomokuSession } from "../supabase";

type Player = Exclude<CellValue, null>;

type Move = {
  row: number;
  col: number;
  player: Player;
  board: Board;
};

const FILE_LABELS = "ABCDEFGHIJKLMNO";

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getPlayerLabel(player: Player): string {
  return player === "black" ? "Black" : "White";
}

function formatMovePosition(move: Move | null): string {
  if (!move) {
    return "Opening";
  }

  return `${FILE_LABELS[move.col]}${move.row + 1}`;
}

function reportSessionError(error: unknown): void {
  if (import.meta.env.DEV) {
    console.error("Failed to record gomoku session.", error);
  }
}

export default function GomokuPage() {
  const initialBoard = useMemo(() => createBoard(), []);
  const [history, setHistory] = useState<Move[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const gameStartedAtRef = useRef(Date.now());
  const hasLoggedCurrentGameRef = useRef(false);
  const board = history.length > 0 ? history[history.length - 1].board : initialBoard;
  const moveCount = history.length;
  const currentPlayer: Player = moveCount % 2 === 0 ? "black" : "white";
  const lastMove = moveCount > 0 ? history[history.length - 1] : null;

  const winner = useMemo(() => getWinner(board), [board]);
  const isDraw = useMemo(() => !winner && isBoardFull(board), [board, winner]);
  const statusText = getStatusText(winner, currentPlayer, isDraw);
  const matchStateLabel = winner || isDraw ? "Result" : "In play";

  useEffect(() => {
    if (moveCount === 0) {
      setElapsedMs(0);
      return;
    }

    if (winner || isDraw) {
      setElapsedMs(Date.now() - gameStartedAtRef.current);
      return;
    }

    setElapsedMs(Date.now() - gameStartedAtRef.current);

    const timerId = window.setInterval(() => {
      setElapsedMs(Date.now() - gameStartedAtRef.current);
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [moveCount, winner, isDraw]);

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
    }).catch((error) => {
      reportSessionError(error);
    });
  }, [winner, isDraw, moveCount]);

  function handleCellClick(row: number, col: number) {
    if (winner || isDraw || board[row][col] !== null) {
      return;
    }

    if (moveCount === 0) {
      gameStartedAtRef.current = Date.now();
    }

    const nextBoard = placeStone(board, row, col, currentPlayer);

    setHistory((previousHistory) => [
      ...previousHistory,
      {
        row,
        col,
        player: currentPlayer,
        board: nextBoard,
      },
    ]);
  }

  function resetMatch() {
    setHistory([]);
    setElapsedMs(0);
    gameStartedAtRef.current = Date.now();
    hasLoggedCurrentGameRef.current = false;
  }

  function handleUndo() {
    if (moveCount === 0 || winner || isDraw) {
      return;
    }

    setHistory((previousHistory) => previousHistory.slice(0, -1));
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
      }).catch((error) => {
        reportSessionError(error);
      });
    }

    resetMatch();
  }

  return (
    <section className="panel game-panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Five in a row</p>
          <h1>Gomoku</h1>
        </div>
        <Link className="text-link" to="/">
          Return
        </Link>
      </div>

      <div className="game-layout">
        <div className="status-card">
          <p className="status-label">{matchStateLabel}</p>
          <p className="status-value">{statusText}</p>
          <div className="details-grid">
            <div className="detail-row">
              <span>To move</span>
              <strong>{winner || isDraw ? "Finished" : getPlayerLabel(currentPlayer)}</strong>
            </div>
            <div className="detail-row">
              <span>Moves</span>
              <strong>{moveCount}</strong>
            </div>
            <div className="detail-row">
              <span>Time</span>
              <strong>{formatDuration(elapsedMs)}</strong>
            </div>
            <div className="detail-row">
              <span>Last move</span>
              <strong>{formatMovePosition(lastMove)}</strong>
            </div>
          </div>
          <div className="action-row">
            <button
              className="button secondary"
              type="button"
              onClick={handleUndo}
              disabled={moveCount === 0 || Boolean(winner) || isDraw}
            >
              Undo
            </button>
            <button className="button" type="button" onClick={handleReset}>
              New game
            </button>
          </div>
          <ul className="notes">
            <li>Black moves first.</li>
            <li>Connect five stones in any direction to win.</li>
            <li>This board is made for two players sharing one screen.</li>
          </ul>
        </div>

        <div className="board-shell">
          <div className="board-meta">
            <p className="board-title">Match board</p>
            <p className="board-subtitle">A calm, traditional free-style game of five in a row.</p>
          </div>
          <div className="board" role="grid" aria-label="Gomoku board">
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  className={[
                    "cell",
                    cell ? "occupied" : "",
                    lastMove?.row === rowIndex && lastMove?.col === colIndex ? "last-move" : "",
                    [3, 7, 11].includes(rowIndex) && [3, 7, 11].includes(colIndex) ? "star-point" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
      </div>
    </section>
  );
}
