import { describe, expect, it } from "vitest";
import {
  AI_HOME_Y,
  AI_SPEED,
  BALL_R,
  CUES,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  P1_X1,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TITLE_ITEMS,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";
import { createHarness, pose, type Harness } from "./testing/harness";

const TITLE_SOLO = 0;
const TITLE_VERSUS = 1;
const TITLE_HOWTO = 2;

function itemCenter(h: Harness, index: number) {
  const rect = h.debug.menuItemRect(h.engine.state, index);
  if (rect === null) throw new Error(`no item ${index}`);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Starts a Solo match from the title through the keyboard and runs `frames`. */
async function startSolo(h: Harness, frames = 1): Promise<void> {
  h.tap("Enter");
  await h.step(frames);
}

describe("the title screen", () => {
  it("opens with the state specs/state.md gives", async () => {
    const h = await createHarness();
    const snap = h.snap();
    expect(snap.screen).toBe("title");
    expect(snap.ball?.held).toBe(true);
    expect(snap.ball?.holdTimer).toBe(HOLD_TIME);
    expect([1, -1]).toContain(snap.ball?.serveSign);
    expect(snap.simTime).toBe(0);
    expect(snap.muted).toBe(false);
    h.destroy();
  });

  it("accumulates simTime on every screen and advances nothing else on the title", async () => {
    const h = await createHarness(10);
    await h.step(5);
    const snap = h.snap();
    expect(snap.simTime).toBeCloseTo(0.05);
    expect(snap.ball?.holdTimer).toBe(HOLD_TIME);
    expect(snap.ball?.trail).toEqual([]);
    expect(snap.screen).toBe("title");
    h.destroy();
  });

  it("moves the menu with either player's keys, wrapping both ways", async () => {
    const h = await createHarness();
    h.tap("KeyW");
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_ITEMS.length - 1);
    h.tap("ArrowDown");
    await h.step();
    expect(h.snap().menuIndex).toBe(0);
    h.tap("ArrowUp");
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_ITEMS.length - 1);
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(0);
    h.destroy();
  });

  it("applies up before down and movement before confirm on one frame", async () => {
    const h = await createHarness();
    h.tap("KeyS");
    h.tap("KeyW");
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(TITLE_ITEMS.length - 1);
    h.destroy();
  });

  it("ignores back and reads the pointer", async () => {
    const h = await createHarness();
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("title");
    const versus = itemCenter(h, TITLE_VERSUS);
    h.pointerMove(versus.x, versus.y);
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_VERSUS);
    h.pointerMove(5, 5);
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_VERSUS);
    h.destroy();
  });

  it("confirms a click inside one item and remembers the title selection", async () => {
    const h = await createHarness();
    const howto = itemCenter(h, TITLE_HOWTO);
    h.pointerDown(howto.x, howto.y);
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_HOWTO);
    expect(h.snap().screen).toBe("title");
    h.pointerUp(howto.x + 2, howto.y + 2);
    await h.step();
    expect(h.snap().screen).toBe("howto");
    expect(h.snap().menuIndex).toBe(0);
    expect(h.snap().titleIndex).toBe(TITLE_HOWTO);
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(TITLE_HOWTO);
    h.destroy();
  });

  it("does not confirm a press and release in different items", async () => {
    const h = await createHarness();
    const solo = itemCenter(h, TITLE_SOLO);
    const versus = itemCenter(h, TITLE_VERSUS);
    h.pointerDown(solo.x, solo.y);
    h.pointerMove(versus.x, versus.y);
    h.pointerUp(versus.x, versus.y);
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(TITLE_VERSUS);
    h.destroy();
  });

  it("confirms a touch that lands and lifts inside one item, starting Versus", async () => {
    const h = await createHarness();
    const versus = itemCenter(h, TITLE_VERSUS);
    h.pointerDown(versus.x, versus.y, { device: "touch", id: 11 });
    h.pointerUp(versus.x, versus.y, { device: "touch", id: 11 });
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("versus");
    expect(h.snap().titleIndex).toBe(TITLE_VERSUS);
    h.destroy();
  });

  it("lets a keyboard movement and a pointer selection share a frame, pointer last", async () => {
    const h = await createHarness();
    const howto = itemCenter(h, TITLE_HOWTO);
    h.tap("KeyS");
    h.pointerMove(howto.x, howto.y);
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_HOWTO);
    h.destroy();
  });

  it("confirms the keyboard's item alone when a pointer confirm shares the frame", async () => {
    const h = await createHarness();
    const howto = itemCenter(h, TITLE_HOWTO);
    h.tap("Enter");
    h.pointerDown(howto.x, howto.y);
    h.pointerUp(howto.x, howto.y);
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("solo");
    h.destroy();
  });

  it("the how-to screen returns to the title on confirm and by pointer", async () => {
    const h = await createHarness();
    pose(h, (d, s) => d.setScreen(s, "howto"));
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
    pose(h, (d, s) => d.setTitleIndex(d.setScreen(s, "howto"), 1));
    const back = itemCenter(h, 0);
    h.pointerDown(back.x, back.y);
    h.pointerUp(back.x, back.y);
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(1);
    h.destroy();
  });
});

describe("starting and serving", () => {
  it("starts a match from SOLO with the state specs/ui.md fixes", async () => {
    const h = await createHarness();
    pose(h, (d, s) => d.setPaddleCy(d.setScore(s, 3, 4), "left", 100));
    await startSolo(h, 0);
    await h.step();
    const snap = h.snap();
    expect(snap.screen).toBe("countdown");
    expect(snap.mode).toBe("solo");
    expect(snap.resumeScreen).toBe("playing");
    expect(snap.score).toEqual({ p1: 0, p2: 0 });
    expect(snap.receiver).toBe("left");
    expect(snap.titleIndex).toBe(TITLE_SOLO);
    expect(snap.paddles.left.cy).toBe(FIELD_CY);
    expect(snap.ball?.held).toBe(true);
    expect(snap.ball?.holdTimer).toBeCloseTo(HOLD_TIME - h.dt);
    h.destroy();
  });

  it("serves toward the receiver at SERVE_SPEED and SERVE_ANGLE when the hold elapses", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallServeSign(d.setScreen(s, "countdown"), -1));
    pose(h, (d, s) => d.setBallHoldTimer(s, 0.025));
    await h.step(2);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().ball?.held).toBe(true);
    await h.step();
    const snap = h.snap();
    expect(snap.screen).toBe("playing");
    const ball = snap.ball!;
    expect(ball.held).toBe(false);
    expect(ball.holdTimer).toBe(0);
    expect(ball.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(ball.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE));
    expect(ball.serveSign).toBe(-1);
    // Not advanced on the serve frame: still at home, with the one fresh sample.
    expect(ball.x).toBe(640);
    expect(ball.trail).toHaveLength(1);
    h.destroy();
  });

  it("serves toward the right when the right side was scored on", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setReceiver(d.setScreen(s, "countdown"), "right"));
    pose(h, (d, s) => d.setBallServeSign(d.setBallHoldTimer(s, 0), 1));
    await h.step();
    const ball = h.snap().ball!;
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.vy).toBeCloseTo(SERVE_SPEED * Math.sin(SERVE_ANGLE));
    h.destroy();
  });

  it("keeps the ball parked and the hold frozen while paused", async () => {
    const h = await createHarness(10);
    await startSolo(h, 3);
    const before = h.snap().ball!.holdTimer;
    h.tap("KeyP");
    await h.step(10);
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().resumeScreen).toBe("countdown");
    expect(h.snap().ball?.holdTimer).toBe(before);
    expect(h.snap().simTime).toBeCloseTo(0.13);
    h.destroy();
  });

  it("counts nothing down without a ball", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.clearWorld(d.setScreen(s, "countdown")));
    await h.step(200);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().ball).toBeNull();
    pose(h, (d, s) => d.spawnBall(s));
    await h.step(101);
    expect(h.snap().screen).toBe("playing");
    h.destroy();
  });

  it("draws the serve sign both ways over many parkings", async () => {
    const h = await createHarness();
    const seen = new Set<number>();
    for (let i = 0; i < 64 && seen.size < 2; i++) {
      pose(h, (d, s) => d.spawnBall(s));
      seen.add(h.snap().ball!.serveSign);
    }
    expect(seen).toEqual(new Set([1, -1]));
    h.destroy();
  });
});

describe("paddles", () => {
  it("moves the human paddle at PADDLE_SPEED while a key is held and stops when released", async () => {
    const h = await createHarness(10);
    await startSolo(h, 1);
    h.keyDown("KeyS");
    await h.step(10);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY + PADDLE_SPEED * 0.1);
    expect(h.snap().paddles.left.vy).toBe(PADDLE_SPEED);
    h.keyUp("KeyS");
    await h.step();
    expect(h.snap().paddles.left.vy).toBe(0);
    h.destroy();
  });

  it("in Solo both players' keys move the left paddle, and the AI holds the right", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setAiMovement(s, false));
    await startSolo(h, 1);
    h.keyDown("ArrowUp");
    await h.step(10);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY - PADDLE_SPEED * 0.1);
    expect(h.snap().paddles.right.cy).toBe(FIELD_CY);
    h.keyUp("ArrowUp");
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.step(5);
    expect(h.snap().paddles.left.vy).toBe(0);
    h.destroy();
  });

  it("in Versus each player moves their own paddle", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setMenuIndex(s, TITLE_VERSUS));
    h.tap("Space");
    await h.step();
    expect(h.snap().mode).toBe("versus");
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.step(10);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY - 72);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY + 72);
    h.destroy();
  });

  it("pins a paddle at the bound with vy = 0", async () => {
    const h = await createHarness(10);
    await startSolo(h, 1);
    h.keyDown("KeyW");
    await h.stepUntil((s) => s.paddles.left.cy === PADDLE_MIN_CY, 200);
    await h.step();
    expect(h.snap().paddles.left.cy).toBe(PADDLE_MIN_CY);
    expect(h.snap().paddles.left.vy).toBe(0);
    h.destroy();
  });

  it("a driven paddle moves at drivenVy and ignores the keys and the AI", async () => {
    const h = await createHarness(10);
    await startSolo(h, 1);
    pose(h, (d, s) =>
      d.setPaddleVy(d.setPaddleDriven(s, "right", true), "right", 200),
    );
    pose(h, (d, s) => d.setPaddleVy(s, "left", -100));
    expect(h.snap().paddles.right).toMatchObject({
      driven: true,
      drivenVy: 200,
      vy: 0,
    });
    h.keyDown("ArrowDown");
    await h.step(10);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY + 20);
    expect(h.snap().paddles.right.vy).toBe(200);
    // The left paddle is not driven: its drivenVy is held but the key moves it.
    expect(h.snap().paddles.left.drivenVy).toBe(-100);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY + 72);
    pose(h, (d, s) => d.setPaddleDriven(s, "right", false));
    pose(h, (d, s) => d.setAiMovement(s, false));
    await h.step(5);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY + 20);
    expect(h.snap().paddles.right.drivenVy).toBe(200);
    h.destroy();
  });

  it("a driven paddle clamps at the bound like any other", async () => {
    const h = await createHarness(10);
    await startSolo(h, 1);
    pose(h, (d, s) =>
      d.setPaddleVy(d.setPaddleDriven(s, "left", true), "left", 50000),
    );
    await h.step();
    expect(h.snap().paddles.left.cy).toBe(PADDLE_MAX_CY);
    expect(h.snap().paddles.left.vy).toBeCloseTo(
      (PADDLE_MAX_CY - FIELD_CY) / 0.01,
    );
    await h.step();
    expect(h.snap().paddles.left.vy).toBe(0);
    h.destroy();
  });
});

describe("the AI", () => {
  it("returns home with the home deadzone while the ball is not coming", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setPaddleCy(d.setScreen(s, "countdown"), "right", 600));
    await h.step(10);
    const cy = h.snap().paddles.right.cy;
    expect(cy).toBeCloseTo(600 - AI_SPEED * 0.1);
    await h.stepUntil((s) => s.paddles.right.vy === 0, 100);
    expect(Math.abs(h.snap().paddles.right.cy - AI_HOME_Y)).toBeLessThanOrEqual(
      18,
    );
    h.destroy();
  });

  it("tracks a ball heading its way while playing, and not when tracking is off", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 640, 150), 300, 0),
    );
    await h.step(5);
    expect(h.snap().paddles.right.vy).toBe(-AI_SPEED);
    pose(h, (d, s) => d.setAiTracking(s, false));
    await h.step(1);
    expect(h.snap().paddles.right.vy).toBeGreaterThan(0);
    h.destroy();
  });

  it("stands still with vy = 0 when movement is off", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 640, 150), 300, 0),
    );
    pose(h, (d, s) => d.setAiMovement(s, false));
    await h.step(5);
    expect(h.snap().paddles.right).toMatchObject({ cy: FIELD_CY, vy: 0 });
    h.destroy();
  });

  it("does not overshoot a target closer than one frame of travel", async () => {
    const h = await createHarness(100);
    pose(h, (d, s) =>
      d.setPaddleCy(d.setScreen(s, "countdown"), "right", AI_HOME_Y + 20),
    );
    await h.step();
    expect(h.snap().paddles.right.cy).toBeCloseTo(AI_HOME_Y);
    expect(h.snap().paddles.right.vy).toBeCloseTo(-200);
    h.destroy();
  });
});

describe("play, scoring, and cues", () => {
  it("records the trail over TRAIL_TIME and drops older samples", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 400, 360), 300, 0),
    );
    await h.step(40);
    const trail = h.snap().ball!.trail;
    expect(trail.length).toBeGreaterThan(5);
    const now = h.snap().simTime;
    for (const sample of trail)
      expect(now - sample.t).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
    expect(trail[trail.length - 1]!.x).toBeCloseTo(h.snap().ball!.x);
    expect(trail[0]!.t).toBeLessThan(trail[trail.length - 1]!.t);
    h.destroy();
  });

  it("scores for player one past the right goal and re-serves toward the right", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, FIELD_W - 30, 100), 900, 0),
    );
    expect(await h.stepUntil((s) => s.score.p1 === 1, 10)).toBe(true);
    const snap = h.snap();
    expect(snap.score).toEqual({ p1: 1, p2: 0 });
    expect(snap.screen).toBe("countdown");
    expect(snap.receiver).toBe("right");
    expect(snap.ball).toMatchObject({
      x: 640,
      y: 360,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect(h.cues).toContain(CUES.score);
    expect(h.cues.filter((c) => c === CUES.score)).toHaveLength(1);
    h.destroy();
  });

  it("scores for player two past the left goal", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 30, 600), -900, 0),
    );
    await h.step(8);
    expect(h.snap().score).toEqual({ p1: 0, p2: 1 });
    expect(h.snap().receiver).toBe("left");
    h.destroy();
  });

  it("ends the match on the win rule and leaves the ball where it is", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) =>
      d.setScore(
        d.setBallHeld(d.setScreen(s, "playing"), false),
        WIN_SCORE - 1,
        5,
      ),
    );
    pose(h, (d, s) =>
      d.setMenuIndex(
        d.setBallVelocity(d.setBallPosition(s, FIELD_W - 30, 100), 900, 0),
        1,
      ),
    );
    await h.step(8);
    const snap = h.snap();
    expect(snap.screen).toBe("matchover");
    expect(snap.winner).toBe("left");
    expect(snap.menuIndex).toBe(0);
    expect(snap.score).toEqual({ p1: WIN_SCORE, p2: 5 });
    expect(snap.ball!.x - BALL_R).toBeGreaterThan(FIELD_W);
    expect(snap.ball!.held).toBe(false);
    h.destroy();
  });

  it("plays on at 10-10 until someone leads by two", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) =>
      d.setScore(d.setBallHeld(d.setScreen(s, "playing"), false), 10, 10),
    );
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 30, 100), -900, 0),
    );
    await h.step(8);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().score).toEqual({ p1: 10, p2: 11 });
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 30, 100), -900, 0),
    );
    await h.step(8);
    expect(h.snap().screen).toBe("matchover");
    expect(h.snap().winner).toBe("right");
    h.destroy();
  });

  it("plays the paddle, wall, and obstacle cues once per frame", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(
        d.setBallPosition(s, P1_X1 + BALL_R + 5, FIELD_CY),
        -600,
        0,
      ),
    );
    await h.step(2);
    expect(h.cues.filter((c) => c === CUES.paddleHit)).toHaveLength(1);
    expect(h.snap().ball!.vx).toBeGreaterThan(0);

    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 300, BALL_R + 3), 0, -600),
    );
    await h.step(2);
    expect(h.cues.filter((c) => c === CUES.wallBounce)).toHaveLength(1);

    pose(h, (d, s) =>
      d.setBallVelocity(
        d.setBallPosition(s, 490 - 10 - BALL_R - 4, 220),
        600,
        0,
      ),
    );
    await h.step(2);
    expect(h.cues.filter((c) => c === CUES.obstacleBounce)).toHaveLength(1);
    h.destroy();
  });

  it("a held ball on the playing screen waits rather than flies", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallVelocity(d.setScreen(s, "playing"), 500, 0));
    await h.step(10);
    expect(h.snap().ball?.x).toBe(640);
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });
    h.destroy();
  });

  it("a moving paddle adds spin that curves the flight", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setPaddleVy(d.setPaddleDriven(s, "left", true), "left", 600),
    );
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 120, FIELD_CY), -700, 0),
    );
    await h.stepUntil((s) => s.ball!.vx > 0, 20);
    const ball = h.snap().ball!;
    expect(ball.spin).toBeGreaterThan(400);
    const vyAfterHit = ball.vy;
    await h.step(10);
    expect(h.snap().ball!.vy).toBeGreaterThan(vyAfterHit);
    h.destroy();
  });
});

describe("pause, resume, and the match-over menu", () => {
  it("Escape pauses once from playing and resumes once from paused", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) => d.setBallVelocity(s, 300, 0));
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().resumeScreen).toBe("playing");
    const x = h.snap().ball!.x;
    await h.step(5);
    expect(h.snap().ball!.x).toBe(x);
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().ball!.x).toBeGreaterThan(x);
    h.destroy();
  });

  it("the pause menu resumes, restarts, and quits", async () => {
    const h = await createHarness(10);
    await startSolo(h, 1);
    h.tap("KeyP");
    await h.step();
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().menuIndex).toBe(0);
    h.tap("KeyW");
    await h.step();
    expect(h.snap().menuIndex).toBe(2);
    h.tap("KeyS");
    h.tap("KeyP");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().menuIndex).toBe(2);

    h.tap("KeyP");
    await h.step();
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("countdown");

    pose(h, (d, s) => d.setScore(s, 4, 2));
    h.tap("KeyP");
    await h.step();
    h.tap("ArrowDown");
    await h.step();
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });
    expect(h.snap().mode).toBe("solo");

    h.tap("KeyP");
    await h.step();
    const quit = itemCenter(h, 2);
    h.pointerDown(quit.x, quit.y);
    h.pointerUp(quit.x, quit.y);
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(TITLE_SOLO);
    expect(h.snap().simTime).toBeGreaterThan(0);
    h.destroy();
  });

  it("the match-over menu plays again in the same mode or returns to the title", async () => {
    const h = await createHarness(10);
    pose(h, (d, s) =>
      d.setMode(
        d.setWinner(d.setScore(d.setScreen(s, "matchover"), 11, 3), "left"),
        "versus",
      ),
    );
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(0);
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("versus");
    expect(h.snap().winner).toBeNull();
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });

    pose(h, (d, s) => d.setScreen(s, "matchover"));
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("title");

    pose(h, (d, s) => d.setMenuIndex(d.setScreen(s, "matchover"), 1));
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().mode).toBe("solo");
    h.destroy();
  });
});

describe("audio and diagnostics", () => {
  it("toggles the mute bit from any screen and mirrors it", async () => {
    const h = await createHarness(10);
    h.tap("KeyM");
    await h.step();
    expect(h.snap().muted).toBe(true);
    await startSolo(h, 1);
    h.tap("KeyM");
    await h.step();
    expect(h.snap().muted).toBe(false);
    pose(h, (d, s) => d.setMuted(s, true));
    expect(h.snap().muted).toBe(true);
    await h.step();
    expect(h.snap().muted).toBe(true);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 300, BALL_R + 3), 0, -600),
    );
    const gains: number[] = [];
    h.engine.events.on("cue:played", (e) => gains.push(e.gain));
    await h.step(2);
    expect(gains).toEqual([0]);
    pose(h, (d, s) => d.reset(s));
    expect(h.snap().muted).toBe(true);
    h.destroy();
  });

  it("registers readable diagnostic sources", async () => {
    const h = await createHarness();
    const names = h.engine.diagnostics().map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "screen",
        "mode",
        "score",
        "ball pos",
        "ball vel",
        "ball speed",
        "ball spin",
        "left paddle",
        "right paddle",
      ]),
    );
    for (const reading of h.engine.diagnostics())
      expect(reading.error).toBeUndefined();
    pose(h, (d, s) => d.clearWorld(s));
    const cleared = Object.fromEntries(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(cleared["ball pos"]).toBe("-");
    expect(cleared["ball speed"]).toBe("-");
    expect(cleared["screen"]).toBe("title");
    pose(h, (d, s) => d.setPaddleDriven(s, "left", true));
    const driven = Object.fromEntries(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(String(driven["left paddle"])).toContain("driven");
    h.destroy();
  });
});

describe("delta-time independence", () => {
  async function rally(stepMs: number) {
    const h = await createHarness(stepMs);
    pose(h, (d, s) => d.setBallHeld(d.setScreen(s, "playing"), false));
    pose(h, (d, s) => d.setAiMovement(s, false));
    pose(h, (d, s) =>
      d.setPaddleVy(d.setPaddleDriven(s, "left", true), "left", 300),
    );
    pose(h, (d, s) =>
      d.setBallVelocity(d.setBallPosition(s, 500, 300), -600, 120),
    );
    const seconds = 2.5;
    const frames = Math.round((seconds * 1000) / stepMs);
    await h.step(frames);
    const snap = h.snap();
    h.destroy();
    return { snap, cues: [...h.cues] };
  }

  it("plays the same scenario out under 2 ms and 16 ms frames", async () => {
    const fine = await rally(2);
    const coarse = await rally(16);
    expect(fine.snap.screen).toBe(coarse.snap.screen);
    expect(fine.snap.score).toEqual(coarse.snap.score);
    expect(fine.cues.filter((c) => c === CUES.paddleHit).length).toBe(
      coarse.cues.filter((c) => c === CUES.paddleHit).length,
    );
    expect(fine.cues.filter((c) => c === CUES.wallBounce).length).toBe(
      coarse.cues.filter((c) => c === CUES.wallBounce).length,
    );
    const a = fine.snap.ball!;
    const b = coarse.snap.ball!;
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(10);
    expect(Math.sign(a.vx)).toBe(Math.sign(b.vx));
    expect(
      Math.abs(fine.snap.paddles.left.cy - coarse.snap.paddles.left.cy),
    ).toBeLessThan(10);
  });
});
