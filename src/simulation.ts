// Carom — one frame of the game (specs/ui.md, specs/balls.md, specs/modes/).
//
// `advanceFrame` is the whole of a frame as a pure function: the current state,
// the input the frame read, and the delta time in, the next state and the cues
// the frame raised out. The engine's `update` is a thin shell around it.

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  FIELD_W,
  HOLD_TIME,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
  type CUES,
} from "./constants";
import type { BallState, CaromState, PaddleState, Side } from "./game";
import type { FrameInput } from "./input";
import {
  applyPointerToMenu,
  menuItems,
  wrapIndex,
  type MenuScreen,
} from "./menus";
import { integratePaddle, stepBall, type BallEvent } from "./physics";
import {
  copyState,
  parkedBall,
  randomSign,
  returnToTitle,
  startMatch,
  type SignSource,
} from "./state";

/** A cue by its key in `CUES`. */
export type CueKey = keyof typeof CUES;

export interface FrameResult {
  readonly state: CaromState;
  readonly cues: readonly CueKey[];
}

const EVENT_CUES: Readonly<Record<BallEvent, CueKey>> = {
  paddleHit: "paddleHit",
  wallBounce: "wallBounce",
  obstacleBounce: "obstacleBounce",
};

/**
 * Advances the game by one frame of `dt` seconds: reads the input on the screen
 * the frame began on, then advances the screen the input left it on.
 */
export function advanceFrame(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
  dt: number,
  sign: SignSource = randomSign,
): FrameResult {
  const timed: CaromState = {
    ...copyState(state),
    simTime: state.simTime + dt,
  };
  const after = applyInput(timed, input, sign);
  if (after.screen === "countdown" || after.screen === "playing") {
    return advancePlay(after, input, dt, sign);
  }
  return { state: after, cues: [] };
}

// ---- Input -------------------------------------------------------------------

function applyInput(
  state: CaromState,
  input: FrameInput,
  sign: SignSource,
): CaromState {
  const { pressed } = input;
  switch (state.screen) {
    case "title":
      return driveMenu(state, "title", input, (s, item) =>
        confirmTitle({ ...s, titleIndex: item }, item, sign),
      );
    case "howto":
      if (pressed.confirm || pressed.back) return returnToTitle(state, sign);
      return driveMenu(state, "howto", input, (s) => returnToTitle(s, sign));
    case "countdown":
    case "playing":
      if (pressed.pause) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
          menuPresses: [],
        };
      }
      return state;
    case "paused":
      if (pressed.pause || pressed.back) return resume(state);
      return driveMenu(state, "paused", input, (s, item) => {
        switch (item) {
          case 0:
            return resume(s);
          case 1:
            return startMatch(s, s.mode, sign);
          default:
            return returnToTitle(s, sign);
        }
      });
    case "matchover":
      if (pressed.back) return returnToTitle(state, sign);
      return driveMenu(state, "matchover", input, (s, item) =>
        item === 0 ? startMatch(s, s.mode, sign) : returnToTitle(s, sign),
      );
  }
}

function confirmTitle(
  state: CaromState,
  item: number,
  sign: SignSource,
): CaromState {
  switch (item) {
    case 0:
      return startMatch(state, "solo", sign);
    case 1:
      return startMatch(state, "versus", sign);
    default:
      return { ...state, screen: "howto", menuIndex: 0, menuPresses: [] };
  }
}

function resume(state: CaromState): CaromState {
  return { ...state, screen: state.resumeScreen, menuPresses: [] };
}

/**
 * Drives a menu for one frame: the keyboard first (up before down, movement
 * before confirm), then the pointer samples, which select and may confirm. A
 * keyboard confirm leaves the screen, so a pointer confirm never joins it.
 */
function driveMenu(
  state: CaromState,
  screen: MenuScreen,
  input: FrameInput,
  confirm: (state: CaromState, item: number) => CaromState,
): CaromState {
  const { pressed } = input;
  const count = menuItems(screen).length;
  let next = state;
  if (pressed["p1-up"] || pressed["p2-up"]) {
    next = { ...next, menuIndex: wrapIndex(next.menuIndex, -1, count) };
  } else if (pressed["p1-down"] || pressed["p2-down"]) {
    next = { ...next, menuIndex: wrapIndex(next.menuIndex, 1, count) };
  } else if (pressed.confirm) {
    return confirm(next, next.menuIndex);
  }

  const pointer = applyPointerToMenu(screen, next.menuPresses, input.pointer);
  next = { ...next, menuPresses: pointer.presses };
  if (pointer.menuIndex !== null)
    next = { ...next, menuIndex: pointer.menuIndex };
  if (pointer.confirmed !== null) return confirm(next, pointer.confirmed);
  return next;
}

// ---- Play --------------------------------------------------------------------

function advancePlay(
  state: CaromState,
  input: FrameInput,
  dt: number,
  sign: SignSource,
): FrameResult {
  const paddles = movePaddles(state, input, dt);
  const moved: CaromState = { ...state, paddles };
  if (moved.ball === null) return { state: moved, cues: [] };

  if (moved.screen === "countdown") {
    return { state: countDown(moved, moved.ball, dt), cues: [] };
  }

  const cues: CueKey[] = [];
  let ball = moved.ball;
  if (!ball.held) {
    const step = stepBall(ball, dt, moved);
    ball = { ...ball, ...step.ball };
    for (const event of step.events) cues.push(EVENT_CUES[event]);
  }
  ball = withTrailSample(ball, moved.simTime);

  const scorer = scorerOf(ball);
  if (scorer === null || moved.ball.held) {
    return { state: { ...moved, ball }, cues };
  }
  cues.push("score");
  return { state: scorePoint({ ...moved, ball }, scorer, sign), cues };
}

/** The side that scored off the ball's position, or `null`. */
function scorerOf(ball: BallState): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}

/** A point for `scorer`: the match ends or the ball is parked for the next serve. */
function scorePoint(
  state: CaromState,
  scorer: Side,
  sign: SignSource,
): CaromState {
  const score =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = winnerOf(score);
  if (winner !== null) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    receiver: scorer === "left" ? "right" : "left",
    ball: { ...parkedBall(sign), holdTimer: HOLD_TIME },
    screen: "countdown",
  };
}

/** The win rule (specs/balls.md): first to `WIN_SCORE`, leading by `WIN_LEAD`. */
export function winnerOf(score: { p1: number; p2: number }): Side | null {
  if (score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD) return "left";
  if (score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD) return "right";
  return null;
}

/**
 * A countdown frame (specs/balls.md, "Serving"): the hold timer counts down,
 * and on the first frame it reaches zero the ball is served toward `receiver`
 * and the screen becomes `playing`. The ball is not advanced on that frame.
 */
function countDown(state: CaromState, ball: BallState, dt: number): CaromState {
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer > 0) {
    return {
      ...state,
      ball: withTrailSample({ ...ball, holdTimer }, state.simTime),
    };
  }
  const dir = state.receiver === "left" ? -1 : 1;
  const served: BallState = {
    ...ball,
    holdTimer: 0,
    held: false,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
  return {
    ...state,
    screen: "playing",
    ball: withTrailSample(served, state.simTime),
  };
}

/** The ball with a trail sample at `t`, and every stale sample dropped. */
function withTrailSample(ball: BallState, t: number): BallState {
  const trail = [...ball.trail, { x: ball.x, y: ball.y, t }].filter(
    (sample) => t - sample.t <= TRAIL_TIME,
  );
  return { ...ball, trail };
}

// ---- Paddles -----------------------------------------------------------------

function movePaddles(
  state: CaromState,
  input: FrameInput,
  dt: number,
): CaromState["paddles"] {
  const { held } = input;
  const p1Up = held["p1-up"];
  const p1Down = held["p1-down"];
  const p2Up = held["p2-up"];
  const p2Down = held["p2-down"];

  const left = state.paddles.left.driven
    ? integratePaddle(state.paddles.left, state.paddles.left.drivenVy, dt)
    : state.mode === "solo"
      ? humanPaddle(
          state.paddles.left,
          Math.min(1, p1Up + p2Up),
          Math.min(1, p1Down + p2Down),
          dt,
        )
      : humanPaddle(state.paddles.left, p1Up, p1Down, dt);

  const right = state.paddles.right.driven
    ? integratePaddle(state.paddles.right, state.paddles.right.drivenVy, dt)
    : state.mode === "solo"
      ? aiPaddle(state, dt)
      : humanPaddle(state.paddles.right, p2Up, p2Down, dt);

  return { left, right };
}

/** A paddle under a player: `axis = down - up`, at `PADDLE_SPEED`. */
function humanPaddle(
  paddle: PaddleState,
  up: number,
  down: number,
  dt: number,
): PaddleState {
  return integratePaddle(paddle, (down - up) * PADDLE_SPEED, dt);
}

/** The AI's paddle for the frame (specs/modes/single-player.md). */
export function aiPaddle(
  state: DeepReadonly<CaromState>,
  dt: number,
): PaddleState {
  const paddle = state.paddles.right;
  const { ball, ai } = state;
  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (
    ai.tracking &&
    state.screen === "playing" &&
    ball !== null &&
    ball.vx > 0
  ) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  if (!ai.movement) return integratePaddle(paddle, 0, dt);
  const diff = target - paddle.cy;
  const vy =
    Math.abs(diff) <= deadzone
      ? 0
      : Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
  return integratePaddle(paddle, vy, dt);
}
