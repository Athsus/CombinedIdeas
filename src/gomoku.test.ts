import { describe, expect, it } from "vitest";
import { createBoard, getStatusText, getWinner, isBoardFull, placeStone } from "./gomoku";

describe("gomoku helpers", () => {
  it("detects a horizontal winner", () => {
    let board = createBoard();

    for (let col = 0; col < 5; col += 1) {
      board = placeStone(board, 7, col, "black");
    }

    expect(getWinner(board)).toBe("black");
  });

  it("detects a full board", () => {
    const board = createBoard(2);
    board[0][0] = "black";
    board[0][1] = "black";
    board[1][0] = "black";
    board[1][1] = "black";

    expect(isBoardFull(board)).toBe(true);
  });

  it("builds status text", () => {
    expect(getStatusText(null, "black", false)).toBe("Black to move");
    expect(getStatusText("white", "black", false)).toBe("White wins");
    expect(getStatusText(null, "black", true)).toBe("Draw");
  });
});
