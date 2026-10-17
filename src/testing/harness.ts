// Carom — a test harness: the engine stood up over its own canvas, clock, and
// event target, with no browser, so a test poses the game through the debug
// surface, drives the keys and the pointer by dispatching events, and advances
// a counted number of frames.

import {
  ConstantClock,
  createEngine,
  type Engine,
  type SurfaceMetrics,
} from "@clockwyrks/simple-2d";
import { createCanvas } from "@napi-rs/canvas";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import { BACKGROUND, game, type CaromDebugApi, type CaromState } from "../game";
import type { Snapshot } from "../debug";

export interface PointerOptions {
  /** The pointer's id; `1` by default. */
  id?: number;
  /** The device; a mouse by default. */
  device?: "mouse" | "touch" | "pen";
}

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  readonly target: EventTarget;
  /** Every cue played so far, in order. */
  readonly cues: string[];
  /** The step every frame is worth, in seconds. */
  readonly dt: number;
  snap(): Snapshot;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** A press and its release, with no frame between. */
  tap(code: string): void;
  pointerDown(x: number, y: number, options?: PointerOptions): void;
  pointerMove(x: number, y: number, options?: PointerOptions): void;
  pointerUp(x: number, y: number, options?: PointerOptions): void;
  /** Advances `frames` frames. */
  step(frames?: number): Promise<void>;
  /** Advances until `predicate` holds or `maxFrames` have run; returns whether it held. */
  stepUntil(
    predicate: (s: Snapshot) => boolean,
    maxFrames?: number,
  ): Promise<boolean>;
  destroy(): void;
}

/** Stands the engine up over a 1280x720 canvas with a constant `stepMs` clock. */
export async function createHarness(stepMs = 1000 / 60): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => FIELD_W,
    cssHeight: () => FIELD_H,
    dpr: () => 1,
    events: () => target,
  };
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface,
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();

  const key = (type: "keydown" | "keyup", code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };
  const pointer = (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    options: PointerOptions = {},
  ): void => {
    const down = type !== "pointerup";
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: options.id ?? 1,
        pointerType: options.device ?? "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: down ? 1 : 0,
      }),
    );
  };

  const harness: Harness = {
    engine,
    debug: engine.debug,
    target,
    cues,
    dt: stepMs / 1000,
    snap: () => engine.debug.snapshot(engine.state),
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    pointerDown: (x, y, options) => pointer("pointerdown", x, y, options),
    pointerMove: (x, y, options) => pointer("pointermove", x, y, options),
    pointerUp: (x, y, options) => pointer("pointerup", x, y, options),
    step: (frames = 1) => engine.advance(frames),
    stepUntil: async (predicate, maxFrames = 2000) => {
      for (let i = 0; i < maxFrames; i++) {
        if (predicate(harness.snap())) return true;
        await engine.advance(1);
      }
      return predicate(harness.snap());
    },
    destroy: () => engine.destroy(),
  };
  return harness;
}

/** Applies a pose to the engine's state. */
export function pose(
  harness: Harness,
  transition: (
    debug: CaromDebugApi,
    state: Engine<CaromState, CaromDebugApi>["state"],
  ) => CaromState,
): void {
  harness.engine.apply((state) => transition(harness.debug, state));
}
