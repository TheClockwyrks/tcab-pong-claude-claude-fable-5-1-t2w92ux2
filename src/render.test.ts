import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { FIELD_CX, FIELD_CY, FIELD_H, FIELD_W } from "./constants";
import { createDebugApi } from "./debug";
import type { CaromState, Screen } from "./game";
import { renderGame } from "./render";
import { titleState } from "./state";
import { FIELD_COLOR } from "./theme";

const debug = createDebugApi(() => 1);

function draw(state: CaromState) {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = FIELD_COLOR;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  renderGame(ctx, state);
  return ctx;
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return { r: r!, g: g!, b: b! };
}

function brightness(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const { r, g, b } = pixel(ctx, x, y);
  return (r + g + b) / 3;
}

describe("renderGame", () => {
  const title = titleState({ muted: false, sign: () => 1 });

  it("draws every screen without throwing", () => {
    const screens: Screen[] = [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ];
    for (const screen of screens) {
      expect(() => draw(debug.setScreen(title, screen))).not.toThrow();
    }
    expect(() =>
      draw(
        debug.setMode(
          debug.setWinner(debug.setScreen(title, "matchover"), "right"),
          "versus",
        ),
      ),
    ).not.toThrow();
    expect(() =>
      draw(debug.setWinner(debug.setScreen(title, "matchover"), "left")),
    ).not.toThrow();
    expect(() =>
      draw(
        debug.setMode(
          debug.setWinner(debug.setScreen(title, "matchover"), "left"),
          "versus",
        ),
      ),
    ).not.toThrow();
  });

  it("draws the ball bright against the dark field while playing", () => {
    const ctx = draw(debug.setScreen(title, "playing"));
    expect(brightness(ctx, FIELD_CX, FIELD_CY)).toBeGreaterThan(200);
    expect(brightness(ctx, 200, 100)).toBeLessThan(60);
  });

  it("draws the paddles and the obstacles in distinct colors", () => {
    const ctx = draw(debug.setScreen(title, "playing"));
    const left = pixel(ctx, 56, FIELD_CY);
    const right = pixel(ctx, 1224, FIELD_CY);
    const obstacle = pixel(ctx, 490, 220);
    expect(left).not.toEqual(right);
    expect(obstacle).not.toEqual(left);
    expect(obstacle).not.toEqual(right);
    expect(Math.max(left.r, left.g, left.b)).toBeGreaterThan(150);
    expect(Math.max(right.r, right.g, right.b)).toBeGreaterThan(150);
    expect(Math.max(obstacle.r, obstacle.g, obstacle.b)).toBeGreaterThan(150);
  });

  it("leaves a cleared field empty of a ball and obstacles", () => {
    const ctx = draw(debug.setScreen(debug.clearWorld(title), "playing"));
    expect(brightness(ctx, FIELD_CX, FIELD_CY)).toBeLessThan(80);
    expect(brightness(ctx, 490, 220)).toBeLessThan(80);
  });

  it("draws a trail behind a moving ball", () => {
    const flying = debug.setBallHeld(
      debug.setBallPosition(debug.setScreen(title, "playing"), 400, 300),
      false,
    );
    const trailed: CaromState = {
      ...flying,
      simTime: 0.1,
      ball: {
        ...flying.ball!,
        trail: [
          { x: 300, y: 300, t: 0.0 },
          { x: 350, y: 300, t: 0.05 },
          { x: 400, y: 300, t: 0.1 },
        ],
      },
    };
    const ctx = draw(trailed);
    expect(brightness(ctx, 370, 300)).toBeGreaterThan(
      brightness(ctx, 370, 250),
    );
  });

  it("dims the field behind the title and shows the countdown ring", () => {
    const titleCtx = draw(title);
    const playCtx = draw(debug.setScreen(title, "playing"));
    expect(brightness(titleCtx, 56, FIELD_CY)).toBeLessThan(
      brightness(playCtx, 56, FIELD_CY),
    );
    expect(() =>
      draw(debug.setBallHoldTimer(debug.setScreen(title, "countdown"), 0.5)),
    ).not.toThrow();
    expect(() =>
      draw(debug.setReceiver(debug.setScreen(title, "countdown"), "right")),
    ).not.toThrow();
    expect(() =>
      draw(debug.setBallHeld(debug.setScreen(title, "countdown"), false)),
    ).not.toThrow();
  });
});
