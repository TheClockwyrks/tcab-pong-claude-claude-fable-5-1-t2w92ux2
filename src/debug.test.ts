import { describe, expect, it } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
} from "./constants";
import { createDebugApi, type CaromDebugApi } from "./debug";
import type { CaromState } from "./game";
import { titleState } from "./state";

const debug: CaromDebugApi = createDebugApi(() => 1);
const title: CaromState = titleState({ muted: false, sign: () => 1 });

describe("the debug surface", () => {
  it("reports the version", () => {
    expect(debug.version).toBe(CAROM_DEBUG_VERSION);
    expect(debug.snapshot(title).version).toBe(1);
  });

  it("snapshots the title state", () => {
    const snap = debug.snapshot(title);
    expect(snap).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      muted: false,
      receiver: "left",
      ai: { tracking: true, movement: true },
      simTime: 0,
    });
    expect(snap.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(snap.ball).toEqual({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      serveSign: 1,
      trail: [],
    });
    expect(snap.obstacles).toEqual([
      { index: 0, cx: 490, cy: 220 },
      { index: 1, cx: 790, cy: 500 },
    ]);
    expect(Object.keys(snap)).not.toContain("menuPresses");
  });

  it("clears and rebuilds the world", () => {
    const cleared = debug.clearWorld(title);
    expect(cleared.ball).toBeNull();
    expect(cleared.obstacles).toEqual([]);
    expect(cleared.paddles).toEqual(title.paddles);
    const withB = debug.spawnObstacle(cleared, 1);
    expect(withB.obstacles).toEqual([{ index: 1, cx: 790, cy: 500 }]);
    const withBoth = debug.spawnObstacle(withB, 0);
    expect(withBoth.obstacles.map((o) => o.index)).toEqual([0, 1]);
    const again = debug.spawnObstacle(withBoth, 0);
    expect(again.obstacles).toHaveLength(2);
    const spawned = debug.spawnBall(cleared);
    expect(spawned.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
      serveSign: 1,
    });
    expect(() => debug.spawnObstacle(cleared, 2)).toThrow();
    expect(() => debug.spawnObstacle(cleared, -1)).toThrow();
    expect(() => debug.spawnObstacle(cleared, 0.5)).toThrow();
  });

  it("spawning a present ball returns it to its parked arrangement", () => {
    const moved = debug.setBallVelocity(
      debug.setBallPosition(title, 100, 100),
      5,
      5,
    );
    const respawned = debug.spawnBall(moved);
    expect(respawned.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      held: true,
    });
  });

  it("poses screens and menus", () => {
    expect(debug.setScreen(title, "paused").screen).toBe("paused");
    expect(debug.setScreen(title, "countdown").ball).toEqual(title.ball);
    expect(debug.setMode(title, "versus").mode).toBe("versus");
    expect(debug.setMenuIndex(title, 2).menuIndex).toBe(2);
    expect(debug.setTitleIndex(title, 1).titleIndex).toBe(1);
    expect(debug.setResumeScreen(title, "countdown").resumeScreen).toBe(
      "countdown",
    );
    expect(() => debug.setScreen(title, "nowhere" as never)).toThrow();
    expect(() => debug.setMode(title, "coop" as never)).toThrow();
    expect(() => debug.setMenuIndex(title, -1)).toThrow();
    expect(() => debug.setTitleIndex(title, Number.NaN)).toThrow();
    expect(() => debug.setResumeScreen(title, "title" as never)).toThrow();
  });

  it("poses the match", () => {
    expect(debug.setScore(title, 10, 7).score).toEqual({ p1: 10, p2: 7 });
    expect(debug.setWinner(title, "right").winner).toBe("right");
    expect(
      debug.setWinner(debug.setWinner(title, "left"), null).winner,
    ).toBeNull();
    expect(debug.setReceiver(title, "right").receiver).toBe("right");
    expect(() => debug.setScore(title, 1.5, 0)).toThrow();
    expect(() => debug.setWinner(title, "up" as never)).toThrow();
    expect(() => debug.setReceiver(title, "middle" as never)).toThrow();
  });

  it("poses the paddles, each field on its own", () => {
    const moved = debug.setPaddleCy(title, "right", 100);
    expect(moved.paddles.right.cy).toBe(100);
    expect(moved.paddles.left).toEqual(title.paddles.left);
    const driven = debug.setPaddleVy(moved, "right", 300);
    expect(driven.paddles.right).toMatchObject({
      drivenVy: 300,
      vy: 0,
      driven: false,
    });
    const taken = debug.setPaddleDriven(driven, "right", true);
    expect(taken.paddles.right.driven).toBe(true);
    expect(taken.paddles.left.driven).toBe(false);
    expect(() =>
      debug.setPaddleCy(title, "left", Number.POSITIVE_INFINITY),
    ).toThrow();
    expect(() =>
      debug.setPaddleDriven(title, "left", "yes" as never),
    ).toThrow();
  });

  it("poses the ball and fails loudly without one", () => {
    const posed = debug.setBallSpin(
      debug.setBallVelocity(debug.setBallPosition(title, 300, 200), 30, 40),
      -200,
    );
    expect(debug.snapshot(posed).ball).toMatchObject({
      x: 300,
      y: 200,
      vx: 30,
      vy: 40,
      speed: 50,
      spin: -200,
    });
    expect(debug.setBallHeld(title, false).ball?.held).toBe(false);
    expect(debug.setBallHoldTimer(title, 0.25).ball?.holdTimer).toBe(0.25);
    expect(debug.setBallServeSign(title, -1).ball?.serveSign).toBe(-1);
    expect(
      debug.drawBallServeSign(debug.setBallServeSign(title, -1)).ball
        ?.serveSign,
    ).toBe(1);
    const empty = debug.clearWorld(title);
    expect(() => debug.setBallPosition(empty, 1, 1)).toThrow(/no ball/);
    expect(() => debug.setBallVelocity(empty, 1, 1)).toThrow();
    expect(() => debug.setBallSpin(empty, 1)).toThrow();
    expect(() => debug.setBallHeld(empty, true)).toThrow();
    expect(() => debug.setBallHoldTimer(empty, 1)).toThrow();
    expect(() => debug.setBallServeSign(empty, 1)).toThrow();
    expect(() => debug.drawBallServeSign(empty)).toThrow();
    expect(() => debug.setBallServeSign(title, 0 as never)).toThrow();
    expect(() => debug.setBallPosition(title, Number.NaN, 0)).toThrow();
    expect(debug.snapshot(empty).ball).toBeNull();
  });

  it("gates the AI's faculties and the mute bit", () => {
    expect(debug.setAiTracking(title, false).ai).toEqual({
      tracking: false,
      movement: true,
    });
    expect(debug.setAiMovement(title, false).ai).toEqual({
      tracking: true,
      movement: false,
    });
    expect(debug.setMuted(title, true).muted).toBe(true);
    expect(() => debug.setAiTracking(title, 1 as never)).toThrow();
  });

  it("resets to the title state, keeping the mute bit", () => {
    let s = debug.setMuted(
      debug.setScore(debug.setScreen(title, "playing"), 5, 3),
      true,
    );
    s = debug.setPaddleDriven(debug.setPaddleVy(s, "left", 99), "left", true);
    s = debug.clearWorld(s);
    s = { ...s, simTime: 42, titleIndex: 2 };
    const reset = debug.reset(s);
    expect(reset).toEqual({ ...title, muted: true });
  });

  it("reconcile changes nothing and is idempotent", () => {
    const posed = debug.setBallVelocity(title, 3, 4);
    const once = debug.reconcile(posed);
    expect(once).toEqual(posed);
    expect(debug.reconcile(once)).toEqual(once);
    expect(debug.snapshot(once).ball?.speed).toBe(5);
  });

  it("leaves the state it was handed as it was", () => {
    const frozen = Object.freeze(titleState({ muted: false, sign: () => 1 }));
    const next = debug.setScore(frozen, 4, 4);
    expect(frozen.score).toEqual({ p1: 0, p2: 0 });
    expect(next.score).toEqual({ p1: 4, p2: 4 });
  });

  it("reports menu item regions on menu screens only", () => {
    expect(debug.menuItemRect(title, 0)).toMatchObject({
      w: expect.any(Number),
      h: expect.any(Number),
    });
    expect(debug.menuItemRect(title, 3)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(title, "playing"), 0)).toBeNull();
    expect(
      debug.menuItemRect(debug.setScreen(title, "countdown"), 0),
    ).toBeNull();
    expect(
      debug.menuItemRect(debug.setScreen(title, "howto"), 0),
    ).not.toBeNull();
    expect(debug.menuItemRect(debug.setScreen(title, "howto"), 1)).toBeNull();
    expect(
      debug.menuItemRect(debug.setScreen(title, "paused"), 2),
    ).not.toBeNull();
    expect(
      debug.menuItemRect(debug.setScreen(title, "matchover"), 1),
    ).not.toBeNull();
    expect(
      debug.menuItemRect(debug.setScreen(title, "matchover"), 2),
    ).toBeNull();
    expect(debug.menuItemRect(title, -1)).toBeNull();
  });

  it("the obstacle centers come from OBSTACLE_CENTERS", () => {
    const snap = debug.snapshot(title);
    snap.obstacles.forEach((o) => {
      expect(o.cx).toBe(OBSTACLE_CENTERS[o.index]!.x);
      expect(o.cy).toBe(OBSTACLE_CENTERS[o.index]!.y);
    });
  });
});
