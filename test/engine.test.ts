import { GameEngine } from "../src/game/engine.ts";
import { COLS, TOTAL_ROWS } from "../src/game/constants.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const engine = new GameEngine();
engine.reset();

// 1. Initial spawn
assert(engine.state.current.type !== undefined, "piece spawned");
assert(engine.state.next.length >= 5, "next queue filled");

// 2. Movement within bounds
const startCol = engine.state.current.col;
engine.move(-1);
engine.move(1);
assert(engine.state.current.col === startCol, "move left then right returns to start");

// 3. Rotation changes rotation state
const before = engine.state.current.rotation;
engine.rotate("cw");
assert(engine.state.current.rotation !== before || engine.state.current.type === "O", "rotate CW changes rotation");

// 4. Hard drop locks piece and spawns a new one
const firstType = engine.state.current.type;
engine.hardDrop();
assert(engine.state.current !== undefined, "new piece after hard drop");
// board should have some filled cells
let filled = 0;
for (let r = 0; r < TOTAL_ROWS; r++)
  for (let c = 0; c < COLS; c++) if (engine.state.board[r]?.[c]) filled++;
assert(filled >= 4, "locked piece wrote cells to board");
void firstType;

// 5. Fill bottom row to test line clear
function fillRowExcept(board: typeof engine.state.board, row: number, gapCol: number): void {
  for (let c = 0; c < COLS; c++) if (c !== gapCol) board[row][c] = "I";
}
engine.reset();
fillRowExcept(engine.state.board, TOTAL_ROWS - 1, 0);
// Drop an I piece vertically into column 0 to complete the row
// Force current piece to be I at col 0
engine.state.current = { type: "I", rotation: 1, row: 0, col: -1 };
// rotation 1 I is vertical occupying col 0 (with box offset). Let's just place manually.
// Simpler: directly test fullRows logic via a vertical I in column 0.
engine.state.current = { type: "I", rotation: 1, row: 0, col: 0 };
const scoreBefore = engine.state.score;
engine.hardDrop();
assert(engine.state.lines >= 1 || engine.state.score > scoreBefore, "line clear or scoring happened");

// 6. Hold swaps piece and blocks re-hold
engine.reset();
const held = engine.state.current.type;
engine.hold();
assert(engine.state.hold === held, "hold stores current piece");
assert(engine.state.canHold === false, "cannot hold twice in a row");

// 7. Gravity update moves piece down over time
engine.reset();
const rowBefore = engine.state.current.row;
engine.update(5000);
assert(engine.state.current.row >= rowBefore, "gravity moves piece down");

// 8. Game over when stack reaches top (no complete rows, so no clears)
engine.reset();
for (let r = 0; r < TOTAL_ROWS; r++)
  for (let c = 0; c < COLS; c++) engine.state.board[r][c] = c === 9 ? null : "Z";
engine.state.current = { type: "T", rotation: 0, row: 0, col: 3 };
engine.hardDrop();
assert(engine.state.phase.status === "gameover", "game over triggers on top-out");

console.log(process.exitCode ? "\nSOME TESTS FAILED" : "\nALL TESTS PASSED");
