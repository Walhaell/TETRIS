import {
  BOX,
  COLS,
  HIDDEN_ROWS,
  KICKS_180,
  KICKS_I,
  KICKS_JLSTZ,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  NEXT_QUEUE_SIZE,
  ROTATED,
  SCORE,
  TOTAL_ROWS,
  gravityForLevel,
  spawnCol,
} from "./constants.ts";
import {
  canPlace,
  clearRows,
  collides,
  createBoard,
  fullRows,
  isBoardEmpty,
  lockPiece,
  pieceCells,
  randomBag,
  tSpinCorners,
} from "./board.ts";
import type {
  Action,
  Board,
  ClearResult,
  GameState,
  Piece,
  Rotation,
  TSpinKind,
  TetrominoType,
} from "./types.ts";

export interface EngineEvents {
  onPieceLock?: (piece: Piece, overflow: boolean) => void;
  onClear?: (result: ClearResult, board: Board) => void;
  onMove?: (action: Action) => void;
  onRotate?: (dir: "cw" | "ccw" | "180", kick: number) => void;
  onHold?: () => void;
  onDrop?: (cells: number, hard: boolean) => void;
  onLevelUp?: (level: number) => void;
  onGameOver?: () => void;
  onSpawn?: (type: TetrominoType) => void;
}

export class GameEngine {
  readonly state: GameState;
  private bag: TetrominoType[] = [];
  private events: EngineEvents;

  constructor(events: EngineEvents = {}) {
    this.events = events;
    this.state = {
      board: createBoard(),
      current: this.makePiece("T"),
      next: [],
      hold: null,
      canHold: true,
      score: 0,
      lines: 0,
      level: 1,
      combo: -1,
      backToBack: false,
      phase: { status: "menu" },
      dropTimer: 0,
      lockTimer: 0,
      lockResets: 0,
      grounded: false,
      lastMoveWasRotation: false,
      lastKickIndex: 0,
      elapsed: 0,
    };
    this.refillQueue();
    this.state.current = this.spawnPiece();
  }

  reset(): void {
    this.bag = [];
    this.state.board = createBoard();
    this.state.hold = null;
    this.state.canHold = true;
    this.state.score = 0;
    this.state.lines = 0;
    this.state.level = 1;
    this.state.combo = -1;
    this.state.backToBack = false;
    this.state.dropTimer = 0;
    this.state.lockTimer = 0;
    this.state.lockResets = 0;
    this.state.grounded = false;
    this.state.lastMoveWasRotation = false;
    this.state.lastKickIndex = 0;
    this.state.elapsed = 0;
    this.state.next = [];
    this.refillQueue();
    this.state.current = this.spawnPiece();
    this.state.phase = { status: "playing" };
  }

  start(): void {
    if (this.state.phase.status === "menu" || this.state.phase.status === "gameover") {
      this.reset();
    } else if (this.state.phase.status === "paused") {
      this.state.phase = { status: "playing" };
    }
  }

  togglePause(): void {
    if (this.state.phase.status === "playing") {
      this.state.phase = { status: "paused" };
    } else if (this.state.phase.status === "paused") {
      this.state.phase = { status: "playing" };
    }
  }

  private makePiece(type: TetrominoType): Piece {
    return { type, rotation: 0, row: 0, col: spawnCol(type) };
  }

  private refillQueue(): void {
    while (this.state.next.length < NEXT_QUEUE_SIZE + 1) {
      if (this.bag.length === 0) this.bag = randomBag();
      const next = this.bag.pop();
      if (next) this.state.next.push(next);
    }
  }

  private spawnPiece(): Piece {
    this.refillQueue();
    const type = this.state.next.shift();
    this.refillQueue();
    const piece = this.makePiece(type ?? "T");
    this.state.current = piece;
    this.state.dropTimer = 0;
    this.state.lockTimer = 0;
    this.state.lockResets = 0;
    this.state.grounded = false;
    this.state.lastMoveWasRotation = false;
    this.state.lastKickIndex = 0;
    this.state.canHold = true;
    this.events.onSpawn?.(piece.type);
    // Spawn blocked -> game over.
    if (collides(this.state.board, piece)) {
      this.state.phase = { status: "gameover" };
      this.events.onGameOver?.();
    }
    return piece;
  }

  /** Row where the current piece would land (for the ghost). */
  ghostRow(): number {
    const piece = this.state.current;
    let row = piece.row;
    while (canPlace(this.state.board, { ...piece, row: row + 1 })) row++;
    return row;
  }

  private isGrounded(): boolean {
    const piece = this.state.current;
    return collides(this.state.board, { ...piece, row: piece.row + 1 });
  }

  /** Reset lock delay when the piece moves/rotates while grounded (limited). */
  private tryResetLock(): void {
    if (this.state.grounded && this.state.lockResets < MAX_LOCK_RESETS) {
      this.state.lockTimer = 0;
      this.state.lockResets++;
    }
  }

  move(dx: number): boolean {
    if (this.state.phase.status !== "playing") return false;
    const piece = this.state.current;
    const moved: Piece = { ...piece, col: piece.col + dx };
    if (moved.col < 0 || moved.col + BOX[piece.type] > COLS + 1) {
      // Allow SRS box to extend; rely on collision for exact bounds.
    }
    if (canPlace(this.state.board, moved)) {
      this.state.current = moved;
      this.state.lastMoveWasRotation = false;
      this.tryResetLock();
      this.events.onMove?.(dx < 0 ? "moveLeft" : "moveRight");
      return true;
    }
    return false;
  }

  rotate(dir: "cw" | "ccw" | "180"): boolean {
    if (this.state.phase.status !== "playing") return false;
    const piece = this.state.current;
    if (piece.type === "O") return false;
    const from = piece.rotation;
    const to: Rotation =
      dir === "180"
        ? (((from + 2) % 4) as Rotation)
        : dir === "cw"
          ? (((from + 1) % 4) as Rotation)
          : (((from + 3) % 4) as Rotation);

    const table = piece.type === "I" ? KICKS_I : KICKS_JLSTZ;
    const kicks: ReadonlyArray<readonly [number, number]> =
      dir === "180" ? KICKS_180 : (table[`${from}${to}`] ?? [[0, 0]]);

    for (let i = 0; i < kicks.length; i++) {
      const [dc, dr] = kicks[i] as readonly [number, number];
      const candidate: Piece = {
        ...piece,
        rotation: to,
        col: piece.col + dc,
        row: piece.row + dr,
      };
      if (canPlace(this.state.board, candidate)) {
        this.state.current = candidate;
        this.state.lastMoveWasRotation = true;
        this.state.lastKickIndex = i;
        this.tryResetLock();
        this.events.onRotate?.(dir, i);
        return true;
      }
    }
    return false;
  }

  softDrop(): boolean {
    if (this.state.phase.status !== "playing") return false;
    const piece = this.state.current;
    const moved: Piece = { ...piece, row: piece.row + 1 };
    if (canPlace(this.state.board, moved)) {
      this.state.current = moved;
      this.state.score += SCORE.softDropPerCell;
      this.state.lastMoveWasRotation = false;
      this.state.dropTimer = 0;
      this.events.onDrop?.(1, false);
      return true;
    }
    return false;
  }

  hardDrop(): void {
    if (this.state.phase.status !== "playing") return;
    const piece = this.state.current;
    let dist = 0;
    while (canPlace(this.state.board, { ...piece, row: piece.row + dist + 1 })) dist++;
    this.state.current = { ...piece, row: piece.row + dist };
    this.state.score += dist * SCORE.hardDropPerCell;
    this.state.lastMoveWasRotation = false;
    this.events.onDrop?.(dist, true);
    this.lockPieceNow();
  }

  hold(): void {
    if (this.state.phase.status !== "playing" || !this.state.canHold) return;
    const currentType = this.state.current.type;
    const prev = this.state.hold;
    this.state.hold = currentType;
    if (prev) {
      this.state.current = this.makePiece(prev);
      this.state.dropTimer = 0;
      this.state.lockTimer = 0;
      this.state.lockResets = 0;
      this.state.grounded = false;
      this.state.lastMoveWasRotation = false;
      if (collides(this.state.board, this.state.current)) {
        this.state.phase = { status: "gameover" };
        this.events.onGameOver?.();
      }
    } else {
      this.spawnPiece();
    }
    this.state.canHold = false;
    this.events.onHold?.();
  }

  private detectTSpin(): TSpinKind {
    const piece = this.state.current;
    if (piece.type !== "T" || !this.state.lastMoveWasRotation) return "none";
    const corners = tSpinCorners(this.state.board, piece);
    if (corners < 3) return "none";
    // Full spin if the two "front" corners relative to rotation are filled.
    const frontFilled = this.frontCornersFilled(piece);
    if (frontFilled >= 2) return "full";
    // Kick index 4 (the big kick) upgrades a mini to full.
    if (this.state.lastKickIndex === 4) return "full";
    return "mini";
  }

  private frontCornersFilled(piece: Piece): number {
    // The two corners adjacent to the T's pointing direction.
    const map: Record<Rotation, Array<[number, number]>> = {
      0: [
        [0, 0],
        [0, 2],
      ],
      1: [
        [0, 2],
        [2, 2],
      ],
      2: [
        [2, 0],
        [2, 2],
      ],
      3: [
        [0, 0],
        [2, 0],
      ],
    };
    let count = 0;
    for (const [dr, dc] of map[piece.rotation]) {
      const r = piece.row + dr;
      const c = piece.col + dc;
      if (r < 0 || c < 0 || c >= COLS || r >= TOTAL_ROWS) count++;
      else if (this.state.board[r]?.[c] !== null && this.state.board[r]?.[c] !== undefined) count++;
    }
    return count;
  }

  private lockPieceNow(): void {
    const piece = this.state.current;
    const tSpin = this.detectTSpin();
    const overflow = lockPiece(this.state.board, piece);
    this.events.onPieceLock?.(piece, overflow);

    const rows = fullRows(this.state.board);
    const count = rows.length;
    const clearedColors: TetrominoType[][] = rows.map((r) =>
      (this.state.board[r] ?? []).filter((c): c is TetrominoType => c !== null),
    );

    if (count > 0) clearRows(this.state.board, rows);
    const perfect = count > 0 && isBoardEmpty(this.state.board);

    const result = this.applyScoring(count, tSpin, perfect);
    if (result.kind === "lines") {
      const withColors: ClearResult = { ...result, rows, colors: clearedColors };
      this.events.onClear?.(withColors, this.state.board);
    }

    if (overflow && count === 0) {
      this.state.phase = { status: "gameover" };
      this.events.onGameOver?.();
      return;
    }

    this.spawnPiece();
  }

  private applyScoring(count: number, tSpin: TSpinKind, perfect: boolean): ClearResult {
    if (count === 0 && tSpin === "none") {
      this.state.combo = -1;
      return { kind: "none" };
    }

    let base = 0;
    const difficult = count >= 4 || tSpin !== "none";

    if (tSpin !== "none") {
      if (tSpin === "mini") {
        base = count === 0 ? SCORE.tSpinMini : count === 1 ? SCORE.tSpinSingle : SCORE.tSpinDouble;
      } else {
        if (count === 0) base = SCORE.tSpin;
        else if (count === 1) base = SCORE.tSpinSingle;
        else if (count === 2) base = SCORE.tSpinDouble;
        else base = SCORE.tSpinTriple;
      }
    } else {
      if (count === 1) base = SCORE.single;
      else if (count === 2) base = SCORE.double;
      else if (count === 3) base = SCORE.triple;
      else if (count === 4) base = SCORE.tetris;
    }

    const backToBack = difficult && this.state.backToBack;
    if (backToBack) base = Math.floor(base * SCORE.backToBackMultiplier);

    if (count > 0) {
      this.state.combo++;
      base += this.state.combo > 0 ? this.state.combo * SCORE.comboBase : 0;
    } else {
      this.state.combo = -1;
    }

    if (perfect) {
      if (count === 1) base += SCORE.perfectClearSingle;
      else if (count === 2) base += SCORE.perfectClearDouble;
      else if (count === 3) base += SCORE.perfectClearTriple;
      else if (count === 4) base += SCORE.perfectClearB2BTetris;
    }

    const gained = base * this.state.level;
    this.state.score += gained;
    this.state.lines += count;

    if (difficult) this.state.backToBack = true;
    else if (count > 0) this.state.backToBack = false;

    const newLevel = Math.floor(this.state.lines / SCORE.linesPerLevel) + 1;
    if (newLevel > this.state.level) {
      this.state.level = newLevel;
      this.state.phase = { status: "levelup", until: performance.now() + 1400 };
      this.events.onLevelUp?.(newLevel);
    }

    return {
      kind: "lines",
      rows: [],
      colors: [],
      count,
      backToBack,
      tSpin,
      perfectClear: perfect,
    };
  }

  /** Advance simulation by dt milliseconds. Returns true if a piece locked. */
  update(dt: number): void {
    const phase = this.state.phase.status;
    if (phase !== "playing" && phase !== "levelup") return;
    this.state.elapsed += dt;

    const grounded = this.isGrounded();
    if (grounded && !this.state.grounded) {
      this.state.grounded = true;
      this.state.lockTimer = 0;
    } else if (!grounded) {
      this.state.grounded = false;
    }

    if (this.state.grounded) {
      this.state.lockTimer += dt;
      if (this.state.lockTimer >= LOCK_DELAY_MS) {
        this.lockPieceNow();
      }
      return;
    }

    const gravity = gravityForLevel(this.state.level);
    this.state.dropTimer += dt;
    while (this.state.dropTimer >= gravity) {
      this.state.dropTimer -= gravity;
      const moved: Piece = { ...this.state.current, row: this.state.current.row + 1 };
      if (canPlace(this.state.board, moved)) {
        this.state.current = moved;
        this.state.lastMoveWasRotation = false;
      } else {
        break;
      }
    }
  }

  /** Cells of the current piece (for renderer). */
  currentCells(): Array<[number, number]> {
    return pieceCells(this.state.current);
  }

  cellsFor(type: TetrominoType, rotation: Rotation): ReadonlyArray<readonly [number, number]> {
    return ROTATED[type][rotation];
  }

  get hiddenRows(): number {
    return HIDDEN_ROWS;
  }
}
