// Carom — the cues (specs/audio.md): four distinct short blips.

import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import { CUES, type CueName } from "./constants";

/** Each cue's synthesis, distinct enough to tell apart by ear. */
export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 520,
    freqTo: 640,
    gain: 0.16,
    durationMs: 70,
  },
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 330,
    freqTo: 260,
    gain: 0.14,
    durationMs: 60,
  },
  [CUES.obstacleBounce]: {
    wave: "sawtooth",
    freq: 880,
    freqTo: 440,
    gain: 0.1,
    durationMs: 90,
  },
  [CUES.score]: {
    wave: "sine",
    freq: 440,
    freqTo: 880,
    gain: 0.2,
    durationMs: 260,
  },
};

/** Declares every cue under its `CUES` name. */
export function defineCues(audio: InitApi<unknown>["audio"]): void {
  for (const [name, spec] of Object.entries(CUE_SPECS)) {
    audio.define(name, spec);
  }
}
