import {
  BOX,
  COLORS,
  COLS,
  HIDDEN_ROWS,
  NEXT_QUEUE_SIZE,
  ROTATED,
  ROWS,
} from "./constants.ts";
import type { ClearResult, GameState, TetrominoType } from "./types.ts";
import type { GameEngine } from "./engine.ts";
import { ParticleSystem } from "./particles.ts";

interface Layout {
  cell: number;
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  panelW: number;
  leftX: number;
  rightX: number;
  w: number;
  h: number;
}

interface ClearingRow {
  row: number;
  colors: TetrominoType[];
}

interface ActiveEffect {
  t: number;
  dur: number;
  rows: ClearingRow[];
  label: string;
  labelColor: string;
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private layout: Layout;
  readonly particles = new ParticleSystem();
  private shake = 0;
  private flash = 0;
  private effect: ActiveEffect | null = null;
  private time = 0;
  private bgStars: Array<{ x: number; y: number; z: number; s: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.layout = this.computeLayout();
    this.resize();
  }

  get freezeActive(): boolean {
    return this.effect !== null;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout = this.computeLayout();
    this.initStars();
  }

  private initStars(): void {
    this.bgStars = [];
    const count = Math.floor((this.layout.w * this.layout.h) / 16000);
    for (let i = 0; i < count; i++) {
      this.bgStars.push({
        x: Math.random() * this.layout.w,
        y: Math.random() * this.layout.h,
        z: 0.3 + Math.random() * 0.7,
        s: Math.random() * 1.6 + 0.4,
      });
    }
  }

  private computeLayout(): Layout {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const panelW = Math.max(120, Math.min(200, w * 0.16));
    const margin = 24;
    const usableW = w - panelW * 2 - margin * 3;
    const usableH = h - margin * 2;
    let cell = Math.min(usableW / COLS, usableH / ROWS);
    cell = Math.max(14, Math.min(42, cell));
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const boardX = Math.round((w - boardW) / 2);
    const boardY = Math.round((h - boardH) / 2);
    const leftX = boardX - panelW - margin;
    const rightX = boardX + boardW + margin;
    return { cell, boardX, boardY, boardW, boardH, panelW, leftX, rightX, w, h };
  }

  /** Triggered by engine.onClear. */
  triggerClear(result: ClearResult, level: number): void {
    if (result.kind !== "lines") return;
    const { cell, boardX, boardY } = this.layout;
    const rows: ClearingRow[] = result.rows.map((r, i) => ({
      row: r,
      colors: result.colors[i] ?? [],
    }));
    let label = "";
    let labelColor = "#ffffff";
    if (result.tSpin !== "none") {
      label = result.tSpin === "mini" ? "T-SPIN MINI" : "T-SPIN";
      labelColor = COLORS.T.base;
    } else if (result.count === 4) {
      label = "TETRIS!";
      labelColor = COLORS.I.base;
    } else if (result.count >= 1) {
      label = ["", "SINGLE", "DOUBLE", "TRIPLE"][result.count] ?? "";
      labelColor = "#e5e7eb";
    }
    if (result.backToBack) label = "B2B " + label;
    if (result.perfectClear) {
      label = "PERFECT CLEAR";
      labelColor = COLORS.O.base;
    }

    for (const cr of rows) {
      const y = boardY + (cr.row - HIDDEN_ROWS + 0.5) * cell;
      const color = cr.colors[0] ? COLORS[cr.colors[0]].base : "#ffffff";
      this.particles.rowSpray(boardX, boardX + this.layout.boardW, y, color, cell * 0.5);
      this.particles.ring(boardX + this.layout.boardW / 2, y, color);
    }

    if (result.count >= 4 || result.tSpin !== "none" || result.perfectClear) {
      this.shake = Math.min(1, this.shake + 0.8);
      this.flash = 1;
    } else if (result.count >= 1) {
      this.shake = Math.min(1, this.shake + 0.35);
      this.flash = 0.5;
    }

    if (label) {
      this.particles.text(
        boardX + this.layout.boardW / 2,
        boardY + this.layout.boardH * 0.4,
        label,
        labelColor,
        result.count >= 4 || result.perfectClear ? 34 : 26,
      );
    }

    const dur = result.count >= 4 || result.perfectClear ? 320 : 200;
    this.effect = { t: 0, dur, rows, label, labelColor };
    void level;
  }

  triggerLock(pieceType: TetrominoType, cells: Array<[number, number]>): void {
    const { cell, boardX, boardY } = this.layout;
    const color = COLORS[pieceType].base;
    for (const [r, c] of cells) {
      if (r < HIDDEN_ROWS) continue;
      const x = boardX + (c + 0.5) * cell;
      const y = boardY + (r - HIDDEN_ROWS + 1) * cell;
      this.particles.burst(x, y, color, 2, { gravity: 0.12, size: 3 });
    }
    this.shake = Math.min(1, this.shake + 0.12);
  }

  triggerHardDrop(cells: number): void {
    this.shake = Math.min(1, this.shake + 0.25 + cells * 0.02);
  }

  triggerLevelUp(level: number): void {
    const { boardX, boardY, boardW, boardH } = this.layout;
    this.particles.text(boardX + boardW / 2, boardY + boardH / 2, `LEVEL ${level}`, COLORS.O.base, 40);
    this.flash = 0.8;
    this.shake = Math.min(1, this.shake + 0.5);
  }

  update(dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt / 400);
    this.flash = Math.max(0, this.flash - dt / 300);
    if (this.effect) {
      this.effect.t += dt;
      if (this.effect.t >= this.effect.dur) this.effect = null;
    }
  }

  /** Whether the game loop should pause the engine this frame (line-clear freeze). */
  shouldFreeze(): boolean {
    return this.effect !== null && this.effect.t < this.effect.dur * 0.7;
  }

  draw(engine: GameEngine): void {
    const ctx = this.ctx;
    const { w, h } = this.layout;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    if (this.shake > 0) {
      const mag = this.shake * 10;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    this.drawBackground();
    this.drawPanels(engine.state);
    this.drawBoardFrame();
    this.drawBoard(engine.state);
    this.drawGhost(engine.state);
    this.drawActivePiece(engine.state);
    this.drawClearEffect();
    this.particles.draw(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.28})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    this.drawOverlay(engine.state);
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const { h } = this.layout;
    ctx.save();
    for (const star of this.bgStars) {
      const tw = 0.5 + 0.5 * Math.sin(this.time / 700 + star.x);
      ctx.globalAlpha = 0.15 + star.z * 0.35 * tw;
      ctx.fillStyle = star.z > 0.7 ? COLORS.I.base : star.z > 0.5 ? COLORS.T.base : "#94a3b8";
      const y = (star.y + (this.time / 40) * star.z) % h;
      ctx.fillRect(star.x, y, star.s, star.s);
    }
    ctx.restore();
  }

  private drawBoardFrame(): void {
    const ctx = this.ctx;
    const { boardX, boardY, boardW, boardH } = this.layout;
    ctx.save();
    // Outer glow frame
    const pad = 10;
    const grad = ctx.createLinearGradient(boardX, boardY, boardX, boardY + boardH);
    grad.addColorStop(0, "rgba(139,92,246,0.25)");
    grad.addColorStop(1, "rgba(34,211,238,0.25)");
    ctx.shadowColor = "rgba(139,92,246,0.5)";
    ctx.shadowBlur = 30;
    this.roundRect(boardX - pad, boardY - pad, boardW + pad * 2, boardH + pad * 2, 14);
    ctx.fillStyle = "rgba(10,10,22,0.72)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    this.roundRect(boardX - pad, boardY - pad, boardW + pad * 2, boardH + pad * 2, 14);
    ctx.stroke();
    ctx.restore();
  }

  private drawBoard(state: GameState): void {
    const ctx = this.ctx;
    const { cell, boardX, boardY } = this.layout;
    ctx.save();
    // grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(boardX + c * cell, boardY);
      ctx.lineTo(boardX + c * cell, boardY + this.layout.boardH);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(boardX, boardY + r * cell);
      ctx.lineTo(boardX + this.layout.boardW, boardY + r * cell);
      ctx.stroke();
    }
    // cells
    for (let r = HIDDEN_ROWS; r < state.board.length; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = state.board[r]?.[c];
        if (!val) continue;
        const x = boardX + c * cell;
        const y = boardY + (r - HIDDEN_ROWS) * cell;
        this.drawCell(x, y, cell, val, 1);
      }
    }
    ctx.restore();
  }

  private drawGhost(state: GameState): void {
    if (state.phase.status !== "playing") return;
    const ctx = this.ctx;
    const { cell, boardX, boardY } = this.layout;
    const ghostRow = this.engineGhostRow(state);
    const piece = state.current;
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (const [dr, dc] of ROTATED[piece.type][piece.rotation]) {
      const r = ghostRow + dr;
      const c = piece.col + dc;
      if (r < HIDDEN_ROWS) continue;
      const x = boardX + c * cell;
      const y = boardY + (r - HIDDEN_ROWS) * cell;
      const col = COLORS[piece.type];
      ctx.strokeStyle = col.base;
      ctx.lineWidth = 2;
      this.roundRect(x + 3, y + 3, cell - 6, cell - 6, 5);
      ctx.stroke();
      ctx.fillStyle = col.glow;
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 0.28;
    }
    ctx.restore();
  }

  private engineGhostRow(state: GameState): number {
    // Recompute landing row without needing the engine instance.
    let row = state.current.row;
    const cells = ROTATED[state.current.type][state.current.rotation];
    const fits = (testRow: number): boolean => {
      for (const [dr, dc] of cells) {
        const r = testRow + dr;
        const c = state.current.col + dc;
        if (c < 0 || c >= COLS || r >= state.board.length) return false;
        if (r >= 0 && state.board[r]?.[c]) return false;
      }
      return true;
    };
    while (fits(row + 1)) row++;
    return row;
  }

  private drawActivePiece(state: GameState): void {
    if (state.phase.status !== "playing" && state.phase.status !== "levelup") return;
    const ctx = this.ctx;
    const { cell, boardX, boardY } = this.layout;
    const piece = state.current;
    const pulse = 0.5 + 0.5 * Math.sin(this.time / 220);
    ctx.save();
    for (const [dr, dc] of ROTATED[piece.type][piece.rotation]) {
      const r = piece.row + dr;
      const c = piece.col + dc;
      if (r < HIDDEN_ROWS) continue;
      const x = boardX + c * cell;
      const y = boardY + (r - HIDDEN_ROWS) * cell;
      ctx.shadowColor = COLORS[piece.type].glow;
      ctx.shadowBlur = 12 + pulse * 10;
      this.drawCell(x, y, cell, piece.type, 1);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  private drawClearEffect(): void {
    if (!this.effect) return;
    const ctx = this.ctx;
    const { cell, boardX, boardY } = this.layout;
    const p = clamp01(this.effect.t / this.effect.dur);
    const e = easeOut(p);
    ctx.save();
    for (const cr of this.effect.rows) {
      if (cr.row < HIDDEN_ROWS) continue;
      const y = boardY + (cr.row - HIDDEN_ROWS) * cell;
      // shrinking bright bar
      const inset = e * cell * 0.5;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 24;
      ctx.fillRect(boardX, y + inset, this.layout.boardW, Math.max(0, cell - inset * 2));
    }
    ctx.restore();
  }

  private drawPanels(state: GameState): void {
    const { cell, panelW, leftX, rightX, boardY, boardH } = this.layout;
    // HOLD (left)
    this.drawPanelBox(leftX, boardY, panelW, 120, "HOLD");
    if (state.hold) {
      this.drawMiniPiece(leftX + panelW / 2, boardY + 72, state.hold, cell * 0.62, state.canHold ? 1 : 0.4);
    }
    // STATS (left, below hold)
    this.drawStats(leftX, boardY + 136, panelW, state);

    // NEXT (right)
    this.drawPanelBox(rightX, boardY, panelW, boardH, "NEXT");
    const queue = state.next.slice(0, NEXT_QUEUE_SIZE);
    queue.forEach((type, i) => {
      const scale = i === 0 ? 0.72 : 0.56;
      const cy = boardY + 60 + i * (cell * 3.1);
      this.drawMiniPiece(rightX + panelW / 2, cy, type, cell * scale, i === 0 ? 1 : 0.85);
    });
  }

  private drawPanelBox(x: number, y: number, w: number, h: number, title: string): void {
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(x, y, w, h, 12);
    ctx.fillStyle = "rgba(10,10,22,0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(226,232,240,0.55)";
    ctx.font = "600 13px Rajdhani, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title, x + 14, y + 24);
    ctx.restore();
  }

  private drawStats(x: number, y: number, w: number, state: GameState): void {
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(x, y, w, 150, 12);
    ctx.fillStyle = "rgba(10,10,22,0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.stroke();

    const items: Array<[string, string, string]> = [
      ["SCORE", state.score.toLocaleString(), COLORS.I.base],
      ["LEVEL", String(state.level), COLORS.T.base],
      ["LINES", String(state.lines), COLORS.S.base],
    ];
    items.forEach(([label, value, color], i) => {
      const iy = y + 34 + i * 40;
      ctx.fillStyle = "rgba(148,163,184,0.7)";
      ctx.font = "600 12px Rajdhani, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, x + 14, iy);
      ctx.fillStyle = color;
      ctx.font = "700 22px Orbitron, sans-serif";
      ctx.textAlign = "right";
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillText(value, x + w - 14, iy + 4);
      ctx.shadowBlur = 0;
    });
    if (state.combo > 0) {
      ctx.fillStyle = COLORS.O.base;
      ctx.font = "700 14px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${state.combo} COMBO`, x + w / 2, y + 140);
    }
    ctx.restore();
  }

  private drawMiniPiece(cx: number, cy: number, type: TetrominoType, cell: number, alpha: number): void {
    const ctx = this.ctx;
    const cells = ROTATED[type][0];
    const box = BOX[type];
    let minR = 9,
      maxR = -9,
      minC = 9,
      maxC = -9;
    for (const [r, c] of cells) {
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
    }
    const wCells = maxC - minC + 1;
    const hCells = maxR - minR + 1;
    const offX = cx - (wCells * cell) / 2;
    const offY = cy - (hCells * cell) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [r, c] of cells) {
      const x = offX + (c - minC) * cell;
      const y = offY + (r - minR) * cell;
      this.drawCell(x, y, cell, type, 1);
    }
    ctx.restore();
    void box;
  }

  private drawCell(x: number, y: number, size: number, type: TetrominoType, alpha: number): void {
    const ctx = this.ctx;
    const col = COLORS[type];
    const pad = Math.max(1, size * 0.06);
    const s = size - pad * 2;
    const r = Math.max(2, size * 0.16);
    ctx.save();
    ctx.globalAlpha = alpha;
    // base gradient
    const grad = ctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0, col.light);
    grad.addColorStop(0.5, col.base);
    grad.addColorStop(1, col.dark);
    this.roundRect(x + pad, y + pad, s, s, r);
    ctx.fillStyle = grad;
    ctx.fill();
    // top bevel highlight
    ctx.globalAlpha = alpha * 0.5;
    this.roundRect(x + pad + s * 0.12, y + pad + s * 0.1, s * 0.76, s * 0.22, r * 0.6);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
    // inner border
    ctx.globalAlpha = alpha;
    this.roundRect(x + pad, y + pad, s, s, r);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawOverlay(state: GameState): void {
    const ctx = this.ctx;
    const { w, h, boardX, boardY, boardW, boardH } = this.layout;
    const status = state.phase.status;
    if (status === "playing" || status === "levelup") return;

    ctx.save();
    ctx.fillStyle = "rgba(5,5,12,0.82)";
    ctx.fillRect(0, 0, w, h);

    const cx = boardX + boardW / 2;
    const cy = boardY + boardH / 2;

    if (status === "menu") {
      this.drawTitle(cx, cy - 120);
      ctx.fillStyle = "rgba(226,232,240,0.85)";
      ctx.font = "600 18px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Press ENTER or tap to play", cx, cy + 20);
      this.drawControls(cx, cy + 60);
    } else if (status === "paused") {
      this.bigText("PAUSED", cx, cy - 10, COLORS.I.base, 52);
      ctx.fillStyle = "rgba(226,232,240,0.7)";
      ctx.font = "600 16px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Press P / ESC to resume", cx, cy + 40);
    } else if (status === "gameover") {
      this.bigText("GAME OVER", cx, cy - 60, COLORS.Z.base, 52);
      this.bigText(state.score.toLocaleString(), cx, cy + 10, "#ffffff", 40);
      ctx.fillStyle = "rgba(148,163,184,0.8)";
      ctx.font = "600 16px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Level ${state.level} · ${state.lines} lines`, cx, cy + 48);
      ctx.fillStyle = "rgba(226,232,240,0.85)";
      ctx.fillText("Press ENTER to restart", cx, cy + 92);
    }
    ctx.restore();
  }

  private drawTitle(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    const letters = "TETRIS";
    const colors = [COLORS.Z.base, COLORS.I.base, COLORS.S.base, COLORS.O.base, COLORS.T.base, COLORS.J.base];
    ctx.font = "900 72px Orbitron, sans-serif";
    const widths = letters.split("").map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = cx - total / 2;
    letters.split("").forEach((ch, i) => {
      const c = colors[i] as string;
      const bob = Math.sin(this.time / 400 + i) * 6;
      ctx.fillStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 22;
      ctx.textAlign = "left";
      ctx.fillText(ch, x, cy + bob);
      x += widths[i] as number;
    });
    ctx.restore();
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = "600 16px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Q W E N   E D I T I O N", cx, cy + 40);
  }

  private drawControls(cx: number, cy: number): void {
    const ctx = this.ctx;
    const rows: Array<[string, string]> = [
      ["← →  /  A D", "Move"],
      ["↑  /  X", "Rotate CW"],
      ["Z", "Rotate CCW"],
      ["Space", "Hard Drop"],
      ["↓  /  S", "Soft Drop"],
      ["C  /  Shift", "Hold"],
      ["P  /  ESC", "Pause"],
    ];
    ctx.font = "600 15px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    rows.forEach(([key, action], i) => {
      const y = cy + i * 24;
      ctx.fillStyle = COLORS.I.base;
      ctx.textAlign = "right";
      ctx.fillText(key, cx - 12, y);
      ctx.fillStyle = "rgba(203,213,225,0.8)";
      ctx.textAlign = "left";
      ctx.fillText(action, cx + 12, y);
    });
  }

  private bigText(text: string, x: number, y: number, color: string, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
