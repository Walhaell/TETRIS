import type { Cell, Rotation, TetrominoType } from "./types.ts";

/** Playfield dimensions (standard guideline: 10 wide, 20 visible + buffer). */
export const COLS = 10;
export const ROWS = 20;
/** Hidden rows above the visible field where pieces spawn. */
export const HIDDEN_ROWS = 2;
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

export const NEXT_QUEUE_SIZE = 5;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;

/** Gravity table: seconds per row at each level (guideline-flavoured curve). */
export function gravityForLevel(level: number): number {
  const l = Math.max(1, level);
  const seconds = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return Math.max(0.016, seconds) * 1000; // ms per row
}

/** Scoring values (guideline based). */
export const SCORE = {
  single: 100,
  double: 300,
  triple: 500,
  tetris: 800,
  tSpinMini: 100,
  tSpin: 400,
  tSpinSingle: 800,
  tSpinDouble: 1200,
  tSpinTriple: 1600,
  backToBackMultiplier: 1.5,
  perfectClearSingle: 800,
  perfectClearDouble: 1200,
  perfectClearTriple: 1800,
  perfectClearB2BTetris: 2000,
  softDropPerCell: 1,
  hardDropPerCell: 2,
  comboBase: 50,
  linesPerLevel: 10,
} as const;

/** Neon palette per tetromino. Each entry: base, light (top bevel), dark (shadow). */
export interface TetrominoColor {
  base: string;
  light: string;
  dark: string;
  glow: string;
}

export const COLORS: Record<TetrominoType, TetrominoColor> = {
  I: { base: "#22d3ee", light: "#a5f3fc", dark: "#0e7490", glow: "rgba(34,211,238,0.55)" },
  O: { base: "#facc15", light: "#fef08a", dark: "#a16207", glow: "rgba(250,204,21,0.55)" },
  T: { base: "#a855f7", light: "#d8b4fe", dark: "#6b21a8", glow: "rgba(168,85,247,0.55)" },
  S: { base: "#22c55e", light: "#86efac", dark: "#15803d", glow: "rgba(34,197,94,0.55)" },
  Z: { base: "#ef4444", light: "#fca5a5", dark: "#991b1b", glow: "rgba(239,68,68,0.55)" },
  J: { base: "#3b82f6", light: "#93c5fd", dark: "#1e40af", glow: "rgba(59,130,246,0.55)" },
  L: { base: "#f97316", light: "#fdba74", dark: "#9a3412", glow: "rgba(249,115,22,0.55)" },
};

/**
 * Tetromino shapes defined on a 4x4 (I/O) or 3x3 grid, spawn orientation.
 * Coordinates are [row, col] within the local box.
 */
export const SHAPES: Record<TetrominoType, Cell[]> = {
  I: [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
  ],
  O: [
    [0, 1],
    [0, 2],
    [1, 1],
    [1, 2],
  ],
  T: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  S: [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  J: [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  L: [
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
};

/** Bounding box size per piece (I and O use 4, the rest use 3). */
export const BOX: Record<TetrominoType, 3 | 4> = {
  I: 4,
  O: 4,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
};

/**
 * Super Rotation System wall-kick offsets.
 * Keyed by `${from}${to}` transition. Values are [dCol, dRow] (row grows downward).
 */
type KickTable = Record<string, ReadonlyArray<readonly [number, number]>>;

export const KICKS_JLSTZ: KickTable = {
  "01": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "10": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "12": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "21": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "23": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "32": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "30": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "03": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

export const KICKS_I: KickTable = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "10": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "21": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "32": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "30": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "03": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
};

/** 180 rotation kicks (simplified: no offset + small nudges). */
export const KICKS_180: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
];

export const PIECE_TYPES: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];

/** Spawn column so the piece is horizontally centered-ish. */
export function spawnCol(type: TetrominoType): number {
  return type === "O" ? 4 : 3;
}

export function spawnRow(): number {
  return 0;
}

/** Rotate a set of local cells within a box of the given size by 90° CW. */
export function rotateCells(cells: Cell[], box: number, times: number): Cell[] {
  let out = cells.map(([r, c]) => [r, c] as [number, number]);
  const n = ((times % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    out = out.map(([r, c]) => [c, box - 1 - r] as [number, number]);
  }
  return out;
}

/** Precomputed absolute cells for every type at every rotation. */
export const ROTATED: Record<TetrominoType, Record<Rotation, Cell[]>> = (() => {
  const result = {} as Record<TetrominoType, Record<Rotation, Cell[]>>;
  for (const type of PIECE_TYPES) {
    const box = BOX[type];
    const rotations = {} as Record<Rotation, Cell[]>;
    for (let r = 0; r < 4; r++) {
      rotations[r as Rotation] = rotateCells(SHAPES[type], box, r);
    }
    result[type] = rotations;
  }
  return result;
})();
