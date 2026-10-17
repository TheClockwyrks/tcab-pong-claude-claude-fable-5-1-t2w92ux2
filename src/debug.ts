// Carom — the debug and automation surface (specs/instrumentation.md).
//
// Every operation takes the current state first, as `DeepReadonly<CaromState>`.
// A pose returns the next state, built from the one it was handed; a reading
// returns what it read. A pose that has nothing to act on throws rather than
// refusing quietly.

import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  Screen,
  Side,
  TrailSample,
} from "./game";
import { menuItemRect, type MenuRect } from "./menus";
import { speedOf } from "./physics";
import {
  copyBall,
  copyObstacles,
  copyPaddle,
  copyState,
  obstacleAt,
  parkedBall,
  randomSign,
  titleState,
  type SignSource,
} from "./state";

/** The whole declared state, as `snapshot` reports it. */
export interface Snapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: {
    left: SnapshotPaddle;
    right: SnapshotPaddle;
  };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: SnapshotBall | null;
  obstacles: ObstacleState[];
  simTime: number;
}

export interface SnapshotPaddle {
  cy: number;
  vy: number;
  drivenVy: number;
  driven: boolean;
}

export interface SnapshotBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  held: boolean;
  holdTimer: number;
  serveSign: 1 | -1;
  trail: TrailSample[];
}

type S = DeepReadonly<CaromState>;

/** The surface `initialize` returns beside the state. */
export interface CaromDebugApi {
  readonly version: number;

  clearWorld(state: S): CaromState;
  spawnBall(state: S): CaromState;
  spawnObstacle(state: S, index: number): CaromState;
  reset(state: S): CaromState;
  reconcile(state: S): CaromState;

  setScreen(state: S, screen: Screen): CaromState;
  setMode(state: S, mode: Mode): CaromState;
  setMenuIndex(state: S, index: number): CaromState;
  setTitleIndex(state: S, index: number): CaromState;
  setResumeScreen(state: S, screen: "countdown" | "playing"): CaromState;

  setScore(state: S, p1: number, p2: number): CaromState;
  setWinner(state: S, side: Side | null): CaromState;
  setReceiver(state: S, side: Side): CaromState;

  setPaddleCy(state: S, side: Side, cy: number): CaromState;
  setPaddleVy(state: S, side: Side, vy: number): CaromState;
  setPaddleDriven(state: S, side: Side, driven: boolean): CaromState;

  setBallPosition(state: S, x: number, y: number): CaromState;
  setBallVelocity(state: S, vx: number, vy: number): CaromState;
  setBallSpin(state: S, spin: number): CaromState;
  setBallHeld(state: S, held: boolean): CaromState;
  setBallHoldTimer(state: S, seconds: number): CaromState;
  setBallServeSign(state: S, sign: 1 | -1): CaromState;
  drawBallServeSign(state: S): CaromState;

  setAiTracking(state: S, enabled: boolean): CaromState;
  setAiMovement(state: S, enabled: boolean): CaromState;

  setMuted(state: S, muted: boolean): CaromState;

  snapshot(state: S): Snapshot;
  menuItemRect(state: S, index: number): MenuRect | null;
}

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

// ---- Validation ---------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`Carom debug: ${message}`);
}

function finite(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function integer(value: number, name: string): number {
  finite(value, name);
  if (!Number.isInteger(value) || value < 0) {
    fail(`${name} must be a whole, non-negative number, got ${String(value)}`);
  }
  return value;
}

function flag(value: boolean, name: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${name} must be a boolean, got ${String(value)}`);
  }
  return value;
}

function side(value: Side): Side {
  if (value !== "left" && value !== "right") {
    fail(`side must be "left" or "right", got ${String(value)}`);
  }
  return value;
}

function screen(value: Screen): Screen {
  if (!SCREENS.includes(value)) {
    fail(`screen must be one of ${SCREENS.join(", ")}, got ${String(value)}`);
  }
  return value;
}

function mode(value: Mode): Mode {
  if (value !== "solo" && value !== "versus") {
    fail(`mode must be "solo" or "versus", got ${String(value)}`);
  }
  return value;
}

function sign(value: 1 | -1): 1 | -1 {
  if (value !== 1 && value !== -1) {
    fail(`serveSign must be 1 or -1, got ${String(value)}`);
  }
  return value;
}

function ballOf(state: S): DeepReadonly<BallState> {
  if (state.ball === null) fail("there is no ball on the field to set");
  return state.ball;
}

// ---- Copies -------------------------------------------------------------------

function withBall(state: S, change: Partial<BallState>): CaromState {
  const ball = ballOf(state);
  return { ...copyState(state), ball: { ...copyBall(ball), ...change } };
}

function withPaddle(
  state: S,
  which: Side,
  change: Partial<PaddleState>,
): CaromState {
  const next = copyState(state);
  return {
    ...next,
    paddles: {
      ...next.paddles,
      [which]: { ...next.paddles[which], ...change },
    },
  };
}

// ---- The surface --------------------------------------------------------------

/** Builds the surface. `sign` is the serve-sign draw parking uses. */
export function createDebugApi(
  drawSign: SignSource = randomSign,
): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (state) => ({ ...copyState(state), ball: null, obstacles: [] }),

    spawnBall: (state) => ({
      ...copyState(state),
      ball: parkedBall(drawSign),
    }),

    spawnObstacle: (state, index) => {
      integer(index, "index");
      if (index >= OBSTACLE_CENTERS.length) {
        fail(`there is no obstacle ${index}`);
      }
      const others = state.obstacles.filter((o) => o.index !== index);
      const obstacles = [...copyObstacles(others), obstacleAt(index)].sort(
        (a, b) => a.index - b.index,
      );
      return { ...copyState(state), obstacles };
    },

    reset: (state) => titleState({ muted: state.muted, sign: drawSign }),

    // Every reading is worked out at the read, so there is nothing to bring into
    // agreement: the state comes back as it was.
    reconcile: (state) => copyState(state),

    setScreen: (state, value) => ({
      ...copyState(state),
      screen: screen(value),
    }),
    setMode: (state, value) => ({ ...copyState(state), mode: mode(value) }),
    setMenuIndex: (state, index) => ({
      ...copyState(state),
      menuIndex: integer(index, "index"),
    }),
    setTitleIndex: (state, index) => ({
      ...copyState(state),
      titleIndex: integer(index, "index"),
    }),
    setResumeScreen: (state, value) => {
      if (value !== "countdown" && value !== "playing") {
        fail(
          `resumeScreen must be "countdown" or "playing", got ${String(value)}`,
        );
      }
      return { ...copyState(state), resumeScreen: value };
    },

    setScore: (state, p1, p2) => ({
      ...copyState(state),
      score: { p1: integer(p1, "p1"), p2: integer(p2, "p2") },
    }),
    setWinner: (state, value) => ({
      ...copyState(state),
      winner: value === null ? null : side(value),
    }),
    setReceiver: (state, value) => ({
      ...copyState(state),
      receiver: side(value),
    }),

    setPaddleCy: (state, which, cy) =>
      withPaddle(state, side(which), { cy: finite(cy, "cy") }),
    setPaddleVy: (state, which, vy) =>
      withPaddle(state, side(which), { drivenVy: finite(vy, "vy") }),
    setPaddleDriven: (state, which, driven) =>
      withPaddle(state, side(which), { driven: flag(driven, "driven") }),

    setBallPosition: (state, x, y) =>
      withBall(state, { x: finite(x, "x"), y: finite(y, "y") }),
    setBallVelocity: (state, vx, vy) =>
      withBall(state, { vx: finite(vx, "vx"), vy: finite(vy, "vy") }),
    setBallSpin: (state, spin) =>
      withBall(state, { spin: finite(spin, "spin") }),
    setBallHeld: (state, held) => withBall(state, { held: flag(held, "held") }),
    setBallHoldTimer: (state, seconds) =>
      withBall(state, { holdTimer: finite(seconds, "seconds") }),
    setBallServeSign: (state, value) =>
      withBall(state, { serveSign: sign(value) }),
    drawBallServeSign: (state) => withBall(state, { serveSign: drawSign() }),

    setAiTracking: (state, enabled) => ({
      ...copyState(state),
      ai: { ...state.ai, tracking: flag(enabled, "enabled") },
    }),
    setAiMovement: (state, enabled) => ({
      ...copyState(state),
      ai: { ...state.ai, movement: flag(enabled, "enabled") },
    }),

    setMuted: (state, muted) => ({
      ...copyState(state),
      muted: flag(muted, "muted"),
    }),

    snapshot: (state) => snapshotOf(state),

    menuItemRect: (state, index) => menuItemRect(state.screen, index),
  };
}

/** The declared state, copied, with the ball's speed worked out. */
export function snapshotOf(state: S): Snapshot {
  const { ball } = state;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { ...state.score },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: copyPaddle(state.paddles.left),
      right: copyPaddle(state.paddles.right),
    },
    ai: { ...state.ai },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: speedOf(ball),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((sample) => ({ ...sample })),
          },
    obstacles: copyObstacles(state.obstacles),
    simTime: state.simTime,
  };
}
