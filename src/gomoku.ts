export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;

export type CellValue = "black" | "white" | null;
export type Board = CellValue[][];

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

export function createBoard(size = BOARD_SIZE): Board {
  return Array.from({ length: size }, () => Array<CellValue>(size).fill(null));
}

export function getNextPlayer(currentPlayer: Exclude<CellValue, null>): Exclude<CellValue, null> {
  return currentPlayer === "black" ? "white" : "black";
}

export function placeStone(
  board: Board,
  row: number,
  col: number,
  player: Exclude<CellValue, null>,
): Board {
  if (board[row]?.[col] !== null) {
    return board;
  }

  return board.map((line, lineIndex) =>
    line.map((cell, cellIndex) => {
      if (lineIndex === row && cellIndex === col) {
        return player;
      }

      return cell;
    }),
  );
}

export function getWinner(board: Board): Exclude<CellValue, null> | null {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const player = board[row][col];

      if (!player) {
        continue;
      }

      for (const [deltaRow, deltaCol] of DIRECTIONS) {
        let count = 1;

        while (
          count < WIN_LENGTH &&
          board[row + deltaRow * count]?.[col + deltaCol * count] === player
        ) {
          count += 1;
        }

        if (count === WIN_LENGTH) {
          return player;
        }
      }
    }
  }

  return null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

export function getStatusText(
  winner: Exclude<CellValue, null> | null,
  currentPlayer: Exclude<CellValue, null>,
  isDraw: boolean,
): string {
  if (winner) {
    return `${winner === "black" ? "Black" : "White"} wins`;
  }

  if (isDraw) {
    return "Draw";
  }

  return `${currentPlayer === "black" ? "Black" : "White"} to move`;
}
