# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off a pair of obstacles standing in the middle of the
field. A player scores when the ball passes the far edge behind the opponent's
paddle. First to 11 points wins, leading by two.

Carom's defining mechanic is **spin**: the motion of a paddle at the moment it
strikes the ball curves the ball's flight afterward. Strike while moving down and
the ball bends downward; strike while moving up and it bends upward. The spin
fades over the following second, and the two obstacles turn every rally into a
bank-shot puzzle.

Play **Solo** against the AI, or **Versus** with a friend on the same keyboard.

## Install

Node.js 20 or later is required.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the local URL.

## Production build

```sh
npm run build
```

The static site is emitted into `dist/`, with `index.html` at its root. Serve
that directory from any static file server. `npm run preview` serves it locally
for a final check.

## Controls

| Key                  | Action                                        |
| -------------------- | --------------------------------------------- |
| `W` / `S`            | Player one: move the left paddle up / down    |
| `↑` / `↓`            | Player two: move the right paddle up / down   |
| `Enter` or `Space`   | Confirm the highlighted menu item             |
| `P` or `Esc`         | Pause and resume; `Esc` also backs out        |
| `M`                  | Mute and unmute                               |
| `` ` `` (backtick)   | Toggle the debug overlay                      |

In Solo, both sets of movement keys drive the left paddle, and the AI holds the
right one. Menus also take a mouse or touch: hover to highlight, click or tap to
confirm. On a touchscreen, on-screen sliders appear on first touch.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --check
npm test            # vitest, with coverage
```

## Showcase

The store-page presentation lives in `showcase/`: a description, a carousel
manifest, screenshots, and a replay recorded with the engine's own recorder.
`npm run build` followed by `node scripts/capture-screenshots.mjs` refreshes the
screenshots, and `node scripts/capture-replay.mjs` refreshes the replay.

## Project layout

- `src/game.ts` — the state types, the debug surface type, and the engine wiring.
- `src/simulation.ts` — one frame of the game as a pure function.
- `src/physics.ts` — the ball's sub-stepped physics and the collision rules.
- `src/menus.ts` — menu layout and keyboard, pointer, and touch navigation.
- `src/debug.ts` — the debug and automation surface.
- `src/render.ts` — drawing, in logical 1280x720 units.
- `src/constants.ts` — every figure the specification fixes.
- `engine/` — the Simple 2D engine's documentation.
- `specs/` — the game's specification.
