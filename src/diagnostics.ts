// Carom — the diagnostic sources the engine's overlay shows
// (specs/instrumentation.md, "Diagnostics"). Every source is a pure read.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { CaromState, PaddleState } from "./game";

const NONE = "-";

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function paddleLine(paddle: DeepReadonly<PaddleState>): string {
  return `cy ${fixed(paddle.cy)} vy ${fixed(paddle.vy)}${
    paddle.driven ? " driven" : ""
  }`;
}

/** Registers every source. */
export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  diagnostics.register("ball pos", (s) =>
    s.ball ? `${fixed(s.ball.x)}, ${fixed(s.ball.y)}` : NONE,
  );
  diagnostics.register("ball vel", (s) =>
    s.ball ? `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}` : NONE,
  );
  diagnostics.register("ball speed", (s) =>
    s.ball ? fixed(Math.hypot(s.ball.vx, s.ball.vy)) : NONE,
  );
  diagnostics.register("ball spin", (s) =>
    s.ball ? fixed(s.ball.spin) : NONE,
  );
  diagnostics.register("left paddle", (s) => paddleLine(s.paddles.left));
  diagnostics.register("right paddle", (s) => paddleLine(s.paddles.right));
}
