import "./style.css";
import { GameEngine } from "./game/engine.ts";
import { Renderer } from "./game/renderer.ts";
import { InputHandler } from "./game/input.ts";
import { AudioEngine } from "./game/audio.ts";
import { pieceCells } from "./game/board.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Canvas #game not found");

const audio = new AudioEngine();
const renderer = new Renderer(canvas);

const engine = new GameEngine({
  onPieceLock: (piece, overflow) => {
    if (!overflow) {
      audio.lock();
      renderer.triggerLock(piece.type, pieceCells(piece));
    }
  },
  onClear: (result) => {
    if (result.kind === "lines") {
      renderer.triggerClear(result, engine.state.level);
      if (result.tSpin !== "none") audio.tSpin();
      else audio.clear(result.count);
    }
  },
  onMove: () => audio.move(),
  onRotate: () => audio.rotate(),
  onHold: () => audio.hold(),
  onDrop: (cells, hard) => {
    if (hard && cells > 0) {
      audio.hardDrop();
      renderer.triggerHardDrop(cells);
    }
  },
  onLevelUp: (level) => {
    audio.levelUp();
    renderer.triggerLevelUp(level);
  },
  onGameOver: () => {
    audio.stopMusic();
    audio.gameOver();
  },
});

const input = new InputHandler(engine);
input.attach();

// --- Audio unlock + music on first interaction ---
let audioStarted = false;
function unlockAudio(): void {
  if (audioStarted) return;
  audioStarted = true;
  audio.ensure();
  audio.startMusic();
}
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

// --- Touch / pointer controls ---
interface TouchState {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  startTime: number;
}
const touches = new Map<number, TouchState>();

canvas.addEventListener("pointerdown", (e) => {
  unlockAudio();
  const phase = engine.state.phase.status;
  if (phase === "menu" || phase === "gameover") {
    engine.start();
    return;
  }
  if (phase === "paused") {
    engine.togglePause();
    return;
  }
  touches.set(e.pointerId, {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    moved: false,
    startTime: performance.now(),
  });
});

canvas.addEventListener("pointermove", (e) => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  const dx = e.clientX - t.lastX;
  const dy = e.clientY - t.lastY;
  const threshold = Math.max(24, rendererCell() * 0.9);
  if (Math.abs(dx) >= threshold) {
    engine.move(dx > 0 ? 1 : -1);
    t.lastX += dx > 0 ? threshold : -threshold;
    t.moved = true;
  }
  if (dy >= threshold) {
    engine.softDrop();
    t.lastY += threshold;
    t.moved = true;
  }
});

canvas.addEventListener("pointerup", (e) => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  touches.delete(e.pointerId);
  const dt = performance.now() - t.startTime;
  const totalDx = e.clientX - t.startX;
  const totalDy = e.clientY - t.startY;
  if (!t.moved && dt < 250) {
    // Tap = rotate CW
    engine.rotate("cw");
  } else if (totalDy < -60 && Math.abs(totalDy) > Math.abs(totalDx)) {
    // Swipe up = hard drop
    engine.hardDrop();
  } else if (Math.abs(totalDx) > 80 && Math.abs(totalDx) > Math.abs(totalDy)) {
    // Horizontal swipe handled by move; double-tap zone for hold via two-finger
  }
});

function rendererCell(): number {
  return Math.max(20, Math.min(window.innerWidth, window.innerHeight) / 26);
}

// --- Resize ---
let resizeTimer: number | null = null;
window.addEventListener("resize", () => {
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => renderer.resize(), 100);
});

// --- Main loop ---
let last = performance.now();
function frame(now: number): void {
  let dt = now - last;
  last = now;
  if (dt > 100) dt = 100; // clamp after tab-switch

  input.update(dt);
  renderer.update(dt);

  if (!renderer.shouldFreeze()) {
    engine.update(dt);
  }

  // Auto-resume after level-up banner.
  const phase = engine.state.phase;
  if (phase.status === "levelup" && now >= phase.until) {
    engine.state.phase = { status: "playing" };
  }

  renderer.draw(engine);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
