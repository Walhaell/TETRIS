import { COLS, ROTATED, TOTAL_ROWS } from "./constants.ts";
import type { Board, CellValue, Piece, TetrominoType } from "./types.ts";

export function createBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () =>
    Array.from({ length: COLS }, () => null as CellValue),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

/** Absolute cells occupied by a piece in its current position. */
export function pieceCells(piece: Piece): Array<[number, number]> {
  return ROTATED[piece.type][piece.rotation].map(
    ([r, c]) => [piece.row + r, piece.col + c] as [number, number],
  );
}

/**
 * Collision test. A piece is invalid if any cell is out of horizontal bounds,
 * below the floor, or overlaps a filled cell. Cells above the top (row < 0)
 * are allowed so pieces can spawn partially off-screen.
 */
export function collides(board: Board, piece: Piece): boolean {
  for (const [r, c] of pieceCells(piece)) {
    if (c < 0 || c >= COLS || r >= TOTAL_ROWS) return true;
    if (r >= 0 && board[r]?.[c] !== null && board[r]?.[c] !== undefined) return true;
  }
  return false;
}

export function canPlace(board: Board, piece: Piece): boolean {
  return !collides(board, piece);
}

/** Lock a piece into the board. Returns false if any cell locked above the visible top. */
export function lockPiece(board: Board, piece: Piece): boolean {
  let overflow = false;
  for (const [r, c] of pieceCells(piece)) {
    if (r < 0) {
      overflow = true;
      continue;
    }
    const row = board[r];
    if (row) row[c] = piece.type;
  }
  return overflow;
}

/** Rows that are completely filled. */
export function fullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (board[r]?.every((cell) => cell !== null)) rows.push(r);
  }
  return rows;
}

export function clearRows(board: Board, rows: number[]): void {
  if (rows.length === 0) return;
  const rowSet = new Set(rows);
  const kept = board.filter((_, r) => !rowSet.has(r));
  while (kept.length < TOTAL_ROWS) {
    kept.unshift(Array.from({ length: COLS }, () => null as CellValue));
  }
  board.length = 0;
  for (const row of kept) board.push(row);
}

/** True when the board has no filled cells (perfect clear check, before refill). */
export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

/** Highest occupied row index per column, used for the stack glow / danger meter. */
export function stackHeight(board: Board): number {
  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (board[r]?.some((cell) => cell !== null)) return TOTAL_ROWS - r;
  }
  return 0;
}

/** Count of the three/four corner cells around a T piece center for T-spin detection. */
export function tSpinCorners(board: Board, piece: Piece): number {
  if (piece.type !== "T") return 0;
  const corners: Array<[number, number]> = [
    [piece.row, piece.col],
    [piece.row, piece.col + 2],
    [piece.row + 2, piece.col],
    [piece.row + 2, piece.col + 2],
  ];
  let filled = 0;
  for (const [r, c] of corners) {
    if (r < 0 || c < 0 || c >= COLS || r >= TOTAL_ROWS) filled++;
    else if (board[r]?.[c] !== null && board[r]?.[c] !== undefined) filled++;
  }
  return filled;
}

export function randomBag(): TetrominoType[] {
  const bag: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = bag[i] as TetrominoType;
    bag[i] = bag[j] as TetrominoType;
    bag[j] = tmp;
  }
  return bag;
}
