import type { GameEngine } from "./engine.ts";

/** Delayed Auto Shift + Auto Repeat Rate for smooth, competitive-grade movement. */
const DAS_MS = 133; // time before auto-repeat kicks in
const ARR_MS = 22; // repeat interval (near-instant)
const SOFT_REPEAT_MS = 35;

type Directional = "left" | "right";

export class InputHandler {
  private engine: GameEngine;
  private held = new Set<string>();
  private dir: Directional | null = null;
  private dirTimer = 0;
  private softTimer = 0;
  private softHeld = false;
  private attached = false;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  private keyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const code = e.code;
    if (this.isGameKey(code)) e.preventDefault();
    if (this.held.has(code)) return;
    this.held.add(code);

    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        this.dir = "left";
        this.dirTimer = 0;
        this.engine.move(-1);
        break;
      case "ArrowRight":
      case "KeyD":
        this.dir = "right";
        this.dirTimer = 0;
        this.engine.move(1);
        break;
      case "ArrowDown":
      case "KeyS":
        this.softHeld = true;
        this.softTimer = 0;
        this.engine.softDrop();
        break;
      case "ArrowUp":
      case "KeyX":
      case "Space":
        if (code === "Space") this.engine.hardDrop();
        else this.engine.rotate("cw");
        break;
      case "KeyZ":
      case "ControlLeft":
        this.engine.rotate("ccw");
        break;
      case "ShiftLeft":
      case "KeyC":
        this.engine.hold();
        break;
      case "KeyR":
        this.engine.rotate("180");
        break;
      case "Enter":
        this.onConfirm();
        break;
      case "Escape":
      case "KeyP":
        this.engine.togglePause();
        break;
    }
  };

  private keyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    this.held.delete(code);
    if ((code === "ArrowLeft" || code === "KeyA") && this.dir === "left") {
      this.dir = this.held.has("ArrowRight") || this.held.has("KeyD") ? "right" : null;
      this.dirTimer = 0;
    }
    if ((code === "ArrowRight" || code === "KeyD") && this.dir === "right") {
      this.dir = this.held.has("ArrowLeft") || this.held.has("KeyA") ? "left" : null;
      this.dirTimer = 0;
    }
    if (code === "ArrowDown" || code === "KeyS") this.softHeld = false;
  };

  private onConfirm(): void {
    const phase = this.engine.state.phase.status;
    if (phase === "menu" || phase === "gameover") this.engine.start();
    else if (phase === "paused") this.engine.togglePause();
  }

  private isGameKey(code: string): boolean {
    return [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Space",
      "KeyA",
      "KeyD",
      "KeyS",
      "KeyW",
      "KeyX",
      "KeyZ",
      "KeyC",
      "KeyR",
    ].includes(code);
  }

  /** Called every frame with dt to drive DAS/ARR and soft-drop repeat. */
  update(dt: number): void {
    if (this.engine.state.phase.status !== "playing") return;
    if (this.dir) {
      this.dirTimer += dt;
      if (this.dirTimer >= DAS_MS) {
        this.dirTimer -= DAS_MS;
        const dx = this.dir === "left" ? -1 : 1;
        // ARR: allow multiple shifts per frame when ARR is tiny.
        let guard = 0;
        while (this.dirTimer >= ARR_MS && guard < 20) {
          this.dirTimer -= ARR_MS;
          if (!this.engine.move(dx)) break;
          guard++;
        }
      }
    }
    if (this.softHeld) {
      this.softTimer += dt;
      while (this.softTimer >= SOFT_REPEAT_MS) {
        this.softTimer -= SOFT_REPEAT_MS;
        if (!this.engine.softDrop()) break;
      }
    }
  }

  attach(): void {
    if (this.attached) return;
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    this.attached = true;
  }

  detach(): void {
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.attached = false;
  }
}
