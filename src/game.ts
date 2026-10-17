// Carom — the game.
//
// This module declares the state the whole game is written against, the debug
// surface that poses and reads it, and the three functions the Simple 2D engine
// drives: `initialize`, `update`, and `render`. The simulation itself lives in
// the modules beside this one; this file is the wiring that binds them to the
// engine's frame.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { defineCues } from "./audio";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import { createDebugApi, type CaromDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { readInput } from "./input";
import { renderGame } from "./render";
import { advanceFrame } from "./simulation";
import { titleState } from "./state";
import { FIELD_COLOR } from "./theme";

export type { CaromDebugApi, Snapshot } from "./debug";

// ---- The state (specs/state.md) -------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /**
   * The menu items pointers are currently pressed on, by pointer id: the press
   * half of a pointer or touch confirm, which needs its release to land in the
   * same region (specs/ui.md). Input bookkeeping rather than game state: it is
   * rebuilt from the pointer alone and holds nothing a reader of the declared
   * fields needs.
   */
  readonly menuPresses: readonly MenuPressState[];
}

/** One pointer pressed on a menu item and not yet released. */
export interface MenuPressState {
  readonly pointerId: number;
  readonly item: number;
}

// ---- The look --------------------------------------------------------------

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = FIELD_COLOR;

// ---- The game --------------------------------------------------------------

/** The game this build's engine drives. */
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    defineCues(api.audio);
    registerDiagnostics(api.diagnostics);
    // The runtime's mute bit starts clear, and the game mirrors it from then on.
    return [titleState({ muted: false }), createDebugApi()];
  },

  update(
    state: DeepReadonly<CaromState>,
    api: UpdateApi,
    dt: number,
  ): CaromState {
    // A pose may have set `muted` since the last frame; the runtime's bit follows
    // the state, and the `mute` action then toggles the runtime's bit.
    if (api.audio.muted() !== state.muted) api.audio.setMuted(state.muted);
    const input = readInput(api.input);
    if (input.pressed.mute) api.audio.setMuted(!api.audio.muted());

    const { state: next, cues } = advanceFrame(state, input, dt);
    for (const cue of cues) api.audio.play(CUES[cue]);

    return { ...next, muted: api.audio.muted() };
  },

  render(state: DeepReadonly<CaromState>, api: RenderApi): void {
    renderGame(api.ctx, state);
  },
};
