/**
 * Core type definitions for the Tetris engine.
 * Uses discriminated unions for game state (per TypeScript best practices).
 */

export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export type Rotation = 0 | 1 | 2 | 3;

/** A cell coordinate relative to the piece's local 4x4 grid. */
export type Cell = readonly [row: number, col: number];

export interface Piece {
  type: TetrominoType;
  rotation: Rotation;
  /** Row of the piece origin in board space (can be negative above the field). */
  row: number;
  /** Column of the piece origin in board space. */
  col: number;
}

/** Board is a grid of cells; null = empty, otherwise the tetromino color key. */
export type CellValue = TetrominoType | null;
export type Board = CellValue[][];

export type Action =
  | "moveLeft"
  | "moveRight"
  | "softDrop"
  | "hardDrop"
  | "rotateCW"
  | "rotateCCW"
  | "rotate180"
  | "hold";

/** Discriminated union describing the outcome of a lock attempt. */
export type ClearResult =
  | { kind: "none" }
  | {
      kind: "lines";
      rows: number[];
      /** Colors that were in each cleared row (parallel to rows). */
      colors: TetrominoType[][];
      count: number;
      backToBack: boolean;
      tSpin: TSpinKind;
      perfectClear: boolean;
    };

export type TSpinKind = "none" | "mini" | "full";

/** High-level game phases as a discriminated union. */
export type GamePhase =
  | { status: "menu" }
  | { status: "playing" }
  | { status: "paused" }
  | { status: "levelup"; until: number }
  | { status: "gameover" };

export interface GameState {
  board: Board;
  current: Piece;
  next: TetrominoType[];
  hold: TetrominoType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  phase: GamePhase;
  /** Gravity accumulator in ms. */
  dropTimer: number;
  /** Timestamp (ms) when the current piece last changed row, for lock delay. */
  lockTimer: number;
  lockResets: number;
  grounded: boolean;
  /** Last action that caused a rotation, used for T-spin detection. */
  lastMoveWasRotation: boolean;
  lastKickIndex: number;
  /** Total elapsed play time in ms. */
  elapsed: number;
}

/** Snapshot the renderer consumes each frame. */
export interface RenderContext {
  state: GameState;
  /** Interpolated vertical offset (0..1) of the active piece for smooth falling. */
  fallOffset: number;
  /** Ghost piece landing row. */
  ghostRow: number;
  /** Particles + effects live in the renderer, this is timing. */
  time: number;
  /** Screen shake magnitude 0..1. */
  shake: number;
  /** Flash intensity 0..1 on line clear. */
  flash: number;
}
