import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  OBSTACLES,
  P1_X1,
  P2_X0,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { PaddleState } from "./game";
import {
  integratePaddle,
  paddleBounce,
  paddleRect,
  resolveRect,
  speedOf,
  stepBall,
  subStep,
  subStepCount,
  type BallEvent,
  type Flight,
  type World,
} from "./physics";
import { allObstacles, restingPaddle } from "./state";

const still: PaddleState = restingPaddle();

function world(partial: Partial<World> = {}): World {
  return {
    paddles: { left: still, right: still },
    obstacles: allObstacles(),
    ...partial,
  };
}

function flight(partial: Partial<Flight>): Flight {
  return { x: 640, y: 360, vx: 0, vy: 0, spin: 0, ...partial };
}

describe("integratePaddle", () => {
  it("moves at vy and keeps vy when the clamp is not reached", () => {
    const next = integratePaddle(still, 720, 0.1);
    expect(next.cy).toBeCloseTo(432);
    expect(next.vy).toBe(720);
  });

  it("clamps to the field and reports the velocity actually travelled", () => {
    const next = integratePaddle({ ...still, cy: 650 }, 720, 0.1);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBeCloseTo((PADDLE_MAX_CY - 650) / 0.1);
    const top = integratePaddle({ ...still, cy: PADDLE_MIN_CY }, -720, 0.05);
    expect(top.cy).toBe(PADDLE_MIN_CY);
    expect(top.vy).toBe(0);
  });

  it("leaves vy as given when dt is zero", () => {
    const next = integratePaddle({ ...still, cy: PADDLE_MAX_CY }, 720, 0);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBe(720);
  });

  it("leaves the driven flags alone", () => {
    const driven: PaddleState = { ...still, driven: true, drivenVy: 50 };
    expect(integratePaddle(driven, 50, 0.1)).toMatchObject({
      driven: true,
      drivenVy: 50,
    });
  });
});

describe("resolveRect", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("ignores a ball outside the expanded rectangle", () => {
    expect(resolveRect(flight({ x: 100 - BALL_R, y: 170 }), rect)).toBeNull();
    expect(resolveRect(flight({ x: 60, y: 170 }), rect)).toBeNull();
  });

  it("places the ball off the struck face and reverses an inbound velocity", () => {
    const left = resolveRect(flight({ x: 92, y: 170, vx: 300 }), rect);
    expect(left?.face).toBe("left");
    expect(left?.ball.x).toBe(100 - BALL_R);
    expect(left?.ball.vx).toBe(-300);

    const right = resolveRect(flight({ x: 128, y: 170, vx: -300 }), rect);
    expect(right?.face).toBe("right");
    expect(right?.ball.x).toBe(120 + BALL_R);
    expect(right?.ball.vx).toBe(300);

    const top = resolveRect(flight({ x: 110, y: 92, vy: 200 }), rect);
    expect(top?.face).toBe("top");
    expect(top?.ball.y).toBe(100 - BALL_R);
    expect(top?.ball.vy).toBe(-200);

    const bottom = resolveRect(flight({ x: 110, y: 248, vy: -200 }), rect);
    expect(bottom?.face).toBe("bottom");
    expect(bottom?.ball.y).toBe(240 + BALL_R);
    expect(bottom?.ball.vy).toBe(200);
  });

  it("leaves a velocity that points away from the face alone", () => {
    const left = resolveRect(flight({ x: 92, y: 170, vx: -300 }), rect);
    expect(left?.ball.vx).toBe(-300);
    const bottom = resolveRect(flight({ x: 110, y: 248, vy: 200 }), rect);
    expect(bottom?.ball.vy).toBe(200);
  });

  it("breaks a tie toward the first of left, right, top, bottom", () => {
    // Equidistant from the left and top faces: left wins.
    const corner = resolveRect(
      flight({ x: 100 - BALL_R + 5, y: 100 - BALL_R + 5 }),
      rect,
    );
    expect(corner?.face).toBe("left");
    // Equidistant from the right and bottom faces: right wins.
    const other = resolveRect(
      flight({ x: 120 + BALL_R - 5, y: 240 + BALL_R - 5 }),
      rect,
    );
    expect(other?.face).toBe("right");
  });
});

describe("paddleBounce", () => {
  it("sends a center hit straight across at the stepped-up speed", () => {
    const out = paddleBounce(
      flight({ x: 70, y: 360, vx: -SERVE_SPEED }),
      "left",
      still,
    );
    expect(out.x).toBe(P1_X1 + BALL_R);
    expect(out.vy).toBeCloseTo(0);
    expect(out.vx).toBeCloseTo(SERVE_SPEED * SPEED_MULT);
  });

  it("uses the contact offset for the angle, clamped at the edges", () => {
    const top = paddleBounce(
      flight({ x: 70, y: 360 - PADDLE_HALF - 30, vx: -500 }),
      "left",
      still,
    );
    const angle = Math.atan2(top.vy, top.vx);
    expect(angle).toBeCloseTo(-MAX_BOUNCE_ANGLE);
    const bottom = paddleBounce(
      flight({ x: 1210, y: 360 + PADDLE_HALF / 2, vx: 500 }),
      "right",
      still,
    );
    expect(bottom.x).toBe(P2_X0 - BALL_R);
    expect(bottom.vx).toBeLessThan(0);
    expect(Math.atan2(bottom.vy, -bottom.vx)).toBeCloseTo(MAX_BOUNCE_ANGLE / 2);
  });

  it("caps the speed", () => {
    const out = paddleBounce(
      flight({ x: 70, y: 360, vx: -SPEED_CAP }),
      "left",
      still,
    );
    expect(speedOf(out)).toBeCloseTo(SPEED_CAP);
  });

  it("adds spin from the paddle's motion and clamps it", () => {
    const moving: PaddleState = { ...still, vy: 400 };
    const out = paddleBounce(
      flight({ x: 70, y: 360, vx: -500, spin: 10 }),
      "left",
      moving,
    );
    expect(out.spin).toBeCloseTo(10 + 400 * SPIN_FROM_PADDLE);
    const fast: PaddleState = { ...still, vy: -5000 };
    expect(
      paddleBounce(flight({ x: 70, y: 360, vx: -500 }), "left", fast).spin,
    ).toBe(-SPIN_CLAMP);
    expect(
      paddleBounce(flight({ x: 70, y: 360, vx: -500, spin: 7 }), "left", still)
        .spin,
    ).toBe(7);
  });
});

describe("subStep", () => {
  it("turns a positive spin from +x toward +y and keeps the speed", () => {
    const events = new Set<BallEvent>();
    const out = subStep(
      flight({ x: 300, y: 360, vx: 500, spin: 500 }),
      0.01,
      world({ obstacles: [] }),
      events,
    );
    expect(out.vy).toBeGreaterThan(0);
    expect(speedOf(out)).toBeCloseTo(500);
    expect(events.size).toBe(0);
  });

  it("decays spin by half every SPIN_HALFLIFE", () => {
    let ball = flight({ x: 300, y: 360, vx: 1, spin: 800 });
    const steps = 80;
    for (let i = 0; i < steps; i++) {
      ball = subStep(
        ball,
        SPIN_HALFLIFE / steps,
        world({ obstacles: [] }),
        new Set(),
      );
    }
    expect(ball.spin).toBeCloseTo(400, 6);
  });

  it("skips the spin turn at zero speed", () => {
    const out = subStep(flight({ spin: 900 }), 0.01, world(), new Set());
    expect(out.vx).toBe(0);
    expect(out.vy).toBe(0);
  });

  it("reflects off the top and bottom walls without changing speed or spin", () => {
    const events = new Set<BallEvent>();
    const top = subStep(
      flight({ x: 300, y: BALL_R + 1, vx: 0, vy: -400, spin: 50 }),
      0.01,
      world(),
      events,
    );
    expect(top.y).toBe(BALL_R);
    expect(top.vy).toBeCloseTo(400, 2);
    expect(events.has("wallBounce")).toBe(true);
    const bottom = subStep(
      flight({ x: 300, y: FIELD_H - BALL_R - 1, vy: 400 }),
      0.01,
      world(),
      new Set(),
    );
    expect(bottom.y).toBe(FIELD_H - BALL_R);
    expect(bottom.vy).toBe(-400);
  });

  it("bounces off an obstacle at unchanged speed and spin", () => {
    const rect = OBSTACLES[0]!;
    const events = new Set<BallEvent>();
    const out = subStep(
      flight({ x: rect.x0 - BALL_R - 2, y: 220, vx: 600, spin: 123 }),
      0.01,
      world(),
      events,
    );
    expect(events.has("obstacleBounce")).toBe(true);
    expect(out.vx).toBeLessThan(0);
    expect(speedOf(out)).toBeCloseTo(600);
    expect(out.x).toBe(rect.x0 - BALL_R);
  });

  it("treats a paddle end cap like a wall", () => {
    const paddle: PaddleState = { ...still, cy: 360 };
    const events = new Set<BallEvent>();
    const out = subStep(
      flight({
        x: 56,
        y: 360 - PADDLE_HALF - BALL_R - 1,
        vx: 0,
        vy: 300,
        spin: 40,
      }),
      0.01,
      world({ paddles: { left: paddle, right: still }, obstacles: [] }),
      events,
    );
    expect(events.has("wallBounce")).toBe(true);
    expect(events.has("paddleHit")).toBe(false);
    expect(out.vy).toBeCloseTo(-300, 2);
    expect(out.spin).toBeCloseTo(40 * Math.pow(0.5, 0.01 / SPIN_HALFLIFE));
  });

  it("ignores an absent obstacle", () => {
    const rect = OBSTACLES[1]!;
    const out = subStep(
      flight({ x: rect.x0 - BALL_R - 2, y: 500, vx: 600 }),
      0.01,
      world({ obstacles: [allObstacles()[0]!] }),
      new Set(),
    );
    expect(out.vx).toBe(600);
  });
});

describe("stepBall", () => {
  it("cuts a frame into sub-steps of at most MAX_SUBSTEP units", () => {
    expect(subStepCount(0, 0.016)).toBe(1);
    expect(subStepCount(520, 1 / 60)).toBe(3);
    expect(subStepCount(980, 0.016)).toBe(4);
  });

  it("keeps the ball out of the paddle at the speed cap", () => {
    const left: PaddleState = { ...still, cy: 360 };
    const result = stepBall(
      {
        x: 200,
        y: 360,
        vx: -SPEED_CAP,
        vy: 0,
        spin: 0,
        held: false,
        holdTimer: 0,
        serveSign: 1,
        trail: [],
      },
      0.25,
      world({ paddles: { left, right: still }, obstacles: [] }),
    );
    expect(result.events.has("paddleHit")).toBe(true);
    expect(result.ball.x).toBeGreaterThanOrEqual(P1_X1 + BALL_R);
    expect(result.ball.vx).toBeGreaterThan(0);
  });

  it("reports each event once however many sub-steps raised it", () => {
    const result = stepBall(
      {
        x: 640,
        y: BALL_R + 2,
        vx: 0,
        vy: -900,
        spin: 0,
        held: false,
        holdTimer: 0,
        serveSign: 1,
        trail: [],
      },
      0.05,
      world({ obstacles: [] }),
    );
    expect([...result.events]).toEqual(["wallBounce"]);
  });

  it("paddleRect spans the paddle's fixed x and its half-height", () => {
    expect(paddleRect("left", 100)).toEqual({
      x0: 48,
      y0: 45,
      x1: 64,
      y1: 155,
    });
    expect(paddleRect("right", 100)).toEqual({
      x0: 1216,
      y0: 45,
      x1: 1232,
      y1: 155,
    });
  });
});
