// Carom — the ball's physics and the paddles' integration
// (specs/balls.md, specs/playfield.md).
//
// Everything here is a pure function over plain values: a step takes the ball,
// the paddles, and the obstacles present, and returns the ball after `dt`
// seconds together with the events the step raised. Nothing reads a clock or a
// canvas, so the same call reaches the same result whatever measured `dt`.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  type Rect,
} from "./constants";
import type { BallState, ObstacleState, PaddleState, Side } from "./game";

/** The events one step of the ball can raise, each at most once per step. */
export type BallEvent = "paddleHit" | "wallBounce" | "obstacleBounce";

/** The ball's flight, without the serve bookkeeping the state carries. */
export interface Flight {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
}

export interface StepResult {
  readonly ball: Flight;
  readonly events: ReadonlySet<BallEvent>;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** The ball's speed, `hypot(vx, vy)`. */
export function speedOf(ball: { readonly vx: number; readonly vy: number }) {
  return Math.hypot(ball.vx, ball.vy);
}

// ---- Paddles ----------------------------------------------------------------

/**
 * Moves a paddle at `vy` for `dt` seconds, clamped to the field
 * (specs/playfield.md). A paddle the clamp stopped carries the velocity it
 * actually moved at, so one pinned against a bound reads `vy = 0`.
 */
export function integratePaddle(
  paddle: DeepReadonly<PaddleState>,
  vy: number,
  dt: number,
): PaddleState {
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy =
    next !== paddle.cy + vy * dt && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** The rectangle a paddle on `side` occupies, centered on `cy`. */
export function paddleRect(side: Side, cy: number): Rect {
  return side === "left"
    ? { x0: P1_X0, y0: cy - PADDLE_HALF, x1: P1_X1, y1: cy + PADDLE_HALF }
    : { x0: P2_X0, y0: cy - PADDLE_HALF, x1: P2_X1, y1: cy + PADDLE_HALF };
}

// ---- Circle against an axis-aligned rectangle ------------------------------

export type Face = "left" | "right" | "top" | "bottom";

export interface Contact {
  readonly face: Face;
  readonly ball: Flight;
}

/**
 * Resolves the ball against a rectangle (specs/balls.md): `null` when the
 * ball's center is not strictly inside the rectangle expanded by `BALL_R`, and
 * otherwise the struck face and the ball placed off it with the normal velocity
 * component reversed if it pointed into the face.
 */
export function resolveRect(ball: Flight, rect: Rect): Contact | null {
  const left = ball.x - (rect.x0 - BALL_R);
  const right = rect.x1 + BALL_R - ball.x;
  const top = ball.y - (rect.y0 - BALL_R);
  const bottom = rect.y1 + BALL_R - ball.y;
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return null;

  const depths: readonly (readonly [Face, number])[] = [
    ["left", left],
    ["right", right],
    ["top", top],
    ["bottom", bottom],
  ];
  let face: Face = "left";
  let depth = left;
  for (const [candidate, value] of depths) {
    if (value < depth) {
      face = candidate;
      depth = value;
    }
  }

  switch (face) {
    case "left":
      return {
        face,
        ball: {
          ...ball,
          x: rect.x0 - BALL_R,
          vx: ball.vx > 0 ? -ball.vx : ball.vx,
        },
      };
    case "right":
      return {
        face,
        ball: {
          ...ball,
          x: rect.x1 + BALL_R,
          vx: ball.vx < 0 ? -ball.vx : ball.vx,
        },
      };
    case "top":
      return {
        face,
        ball: {
          ...ball,
          y: rect.y0 - BALL_R,
          vy: ball.vy > 0 ? -ball.vy : ball.vy,
        },
      };
    case "bottom":
      return {
        face,
        ball: {
          ...ball,
          y: rect.y1 + BALL_R,
          vy: ball.vy < 0 ? -ball.vy : ball.vy,
        },
      };
  }
}

// ---- The paddle bounce --------------------------------------------------------

/**
 * The ball leaving a paddle on `side` (specs/balls.md, "Paddle bounce and
 * spin"): the angle from the contact offset, the speed stepped up to the cap, the
 * spin from the paddle's motion, and the ball placed off the paddle's front face.
 */
export function paddleBounce(
  ball: Flight,
  side: Side,
  paddle: DeepReadonly<PaddleState>,
): Flight {
  const offset = clamp((ball.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(speedOf(ball) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  return {
    x: side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R,
    y: ball.y,
    vx: dir * speed * Math.cos(theta),
    vy: speed * Math.sin(theta),
    spin: clamp(
      ball.spin + paddle.vy * SPIN_FROM_PADDLE,
      -SPIN_CLAMP,
      SPIN_CLAMP,
    ),
  };
}

// ---- One sub-step -------------------------------------------------------------

/** Rotates the velocity by `angle` radians, `+x` toward `+y`. */
function rotate(ball: Flight, angle: number): Flight {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    ...ball,
    vx: ball.vx * cos - ball.vy * sin,
    vy: ball.vx * sin + ball.vy * cos,
  };
}

function resolveWalls(ball: Flight, events: Set<BallEvent>): Flight {
  if (ball.y - BALL_R < 0 && ball.vy < 0) {
    events.add("wallBounce");
    return { ...ball, y: BALL_R, vy: -ball.vy };
  }
  if (ball.y + BALL_R > FIELD_H && ball.vy > 0) {
    events.add("wallBounce");
    return { ...ball, y: FIELD_H - BALL_R, vy: -ball.vy };
  }
  return ball;
}

function resolvePaddle(
  ball: Flight,
  side: Side,
  paddle: DeepReadonly<PaddleState>,
  events: Set<BallEvent>,
): Flight {
  const contact = resolveRect(ball, paddleRect(side, paddle.cy));
  if (contact === null) return ball;
  if (contact.face === "left" || contact.face === "right") {
    events.add("paddleHit");
    return paddleBounce(ball, side, paddle);
  }
  events.add("wallBounce");
  return contact.ball;
}

function resolveObstacle(
  ball: Flight,
  obstacle: DeepReadonly<ObstacleState>,
  events: Set<BallEvent>,
): Flight {
  const rect = OBSTACLES[obstacle.index];
  if (rect === undefined) return ball;
  const contact = resolveRect(ball, rect);
  if (contact === null) return ball;
  events.add("obstacleBounce");
  return contact.ball;
}

export interface World {
  readonly paddles: DeepReadonly<{ left: PaddleState; right: PaddleState }>;
  readonly obstacles: DeepReadonly<readonly ObstacleState[]>;
}

/** One sub-step of `h` seconds (specs/balls.md, "Sub-steps"). */
export function subStep(
  ball: Flight,
  h: number,
  world: World,
  events: Set<BallEvent>,
): Flight {
  const speed = speedOf(ball);
  let next = speed > 0 ? rotate(ball, (ball.spin / speed) * h) : ball;
  next = { ...next, spin: next.spin * Math.pow(0.5, h / SPIN_HALFLIFE) };
  next = { ...next, x: next.x + next.vx * h, y: next.y + next.vy * h };
  next = resolveWalls(next, events);
  next = resolvePaddle(next, "left", world.paddles.left, events);
  next = resolvePaddle(next, "right", world.paddles.right, events);
  const sorted = [...world.obstacles].sort((a, b) => a.index - b.index);
  for (const obstacle of sorted) next = resolveObstacle(next, obstacle, events);
  return next;
}

/** How many sub-steps a frame of `dt` seconds is cut into at `speed`. */
export function subStepCount(speed: number, dt: number): number {
  return Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
}

/**
 * Advances a flying ball by `dt` seconds in sub-steps, resolving every
 * collision, and reports the events the frame raised.
 */
export function stepBall(
  ball: DeepReadonly<BallState>,
  dt: number,
  world: World,
): StepResult {
  const events = new Set<BallEvent>();
  const n = subStepCount(speedOf(ball), dt);
  const h = dt / n;
  let flight: Flight = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  for (let i = 0; i < n; i++) flight = subStep(flight, h, world, events);
  return { ball: flight, events };
}
