// Carom — the input a frame reads (specs/ui.md).
//
// `readInput` takes everything an update reads from the engine in one go and
// hands the simulation a plain value, so the simulation itself is a function of
// the state, the input, and the delta time alone.

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import { ACTIONS, type ActionName } from "./constants";

/** A pointer sample the menus care about: where it was and what it did. */
export interface MenuPointerSample {
  readonly type: "down" | "move" | "up";
  readonly x: number;
  readonly y: number;
  readonly id: number;
}

export interface FrameInput {
  /** Each action's held magnitude, `0` or `1`. */
  readonly held: Readonly<Record<ActionName, number>>;
  /** Each action's press edge, raised once per press. */
  readonly pressed: Readonly<Record<ActionName, boolean>>;
  /** Every pointer sample the frame delivered, in arrival order. */
  readonly pointer: readonly MenuPointerSample[];
}

function record<T>(value: (name: ActionName) => T): Record<ActionName, T> {
  const out = {} as Record<ActionName, T>;
  for (const name of ACTIONS) out[name] = value(name);
  return out;
}

function menuSample(sample: PointerSample): MenuPointerSample {
  return { type: sample.type, x: sample.x, y: sample.y, id: sample.id };
}

/** Reads every action and every pointer sample the frame carries. */
export function readInput(input: UpdateApi["input"]): FrameInput {
  return {
    held: record((name) => input.value(name)),
    pressed: record((name) => input.pressed(name)),
    pointer: input.pointerSamples().map(menuSample),
  };
}
