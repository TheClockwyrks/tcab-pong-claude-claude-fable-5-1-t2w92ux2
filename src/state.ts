// Carom — building and resetting the state.
//
// The transitions every menu shares: the title-screen state, parking the ball,
// starting a match, and returning to the title (specs/state.md, specs/ui.md,
// specs/balls.md). Each returns a new state and leaves the one it was given as
// it was.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

type S = DeepReadonly<CaromState>;

// ---- Copies -------------------------------------------------------------------

export function copyBall(ball: DeepReadonly<BallState>): BallState {
  return { ...ball, trail: ball.trail.map((sample) => ({ ...sample })) };
}

export function copyPaddle(paddle: DeepReadonly<PaddleState>): PaddleState {
  return { ...paddle };
}

export function copyObstacles(
  obstacles: DeepReadonly<readonly ObstacleState[]>,
): ObstacleState[] {
  return obstacles.map((obstacle) => ({ ...obstacle }));
}

/** A writable copy of the state with every array and object its own. */
export function copyState(state: S): CaromState {
  return {
    ...state,
    score: { ...state.score },
    paddles: {
      left: copyPaddle(state.paddles.left),
      right: copyPaddle(state.paddles.right),
    },
    ai: { ...state.ai },
    ball: state.ball === null ? null : copyBall(state.ball),
    obstacles: copyObstacles(state.obstacles),
    menuPresses: state.menuPresses.map((press) => ({ ...press })),
  };
}

// ---- Building -----------------------------------------------------------------

/** A draw of `1` or `-1`, each equally likely. */
export type SignSource = () => 1 | -1;

/** The default sign source: a fair coin over `Math.random`. */
export const randomSign: SignSource = () => (Math.random() < 0.5 ? 1 : -1);

/** A paddle at rest at the field's vertical center, under its own player. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/**
 * A parked ball: at its home point, held, with the hold timer full, zero velocity,
 * zero spin, an empty trail, and a freshly drawn serve sign.
 */
export function parkedBall(sign: SignSource = randomSign): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: sign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new RangeError(`Carom: there is no obstacle ${index}`);
  }
  return { index, cx: center.x, cy: center.y };
}

/** Both obstacles, in the order of `OBSTACLE_CENTERS`. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** The state the game opens on: the title screen (specs/state.md). */
export function titleState(options: {
  muted: boolean;
  sign?: SignSource;
}): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(options.sign),
    obstacles: allObstacles(),
    simTime: 0,
    muted: options.muted,
    menuPresses: [],
  };
}

/**
 * Starts a match in `mode` from any screen (specs/ui.md, "Starting a match").
 * The driven flags, the AI faculties, the obstacles, `titleIndex`, `simTime`,
 * and `muted` are kept.
 */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
  sign: SignSource = randomSign,
): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(sign),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    obstacles: [...state.obstacles],
    menuPresses: [],
  };
}

/**
 * Returns to the title (specs/ui.md, "Returning to the title"): every declared
 * field takes its title-screen value except `titleIndex`, `simTime`, and
 * `muted`, which keep theirs, and `menuIndex`, which becomes `titleIndex`.
 */
export function returnToTitle(
  state: DeepReadonly<CaromState>,
  sign: SignSource = randomSign,
): CaromState {
  return {
    ...titleState({ muted: state.muted, sign }),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}
