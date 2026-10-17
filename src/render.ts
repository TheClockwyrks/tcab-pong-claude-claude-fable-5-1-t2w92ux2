// Carom — drawing (specs/overview.md, "Visual design"; specs/ui.md).
//
// Everything is drawn in logical units on the 1280x720 field the engine has
// already transformed and clipped the context to. Rendering reads the state and
// changes nothing.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";
import type { BallState, CaromState, PaddleState, Side } from "./game";
import { menuItemRect, menuItems, type MenuScreen } from "./menus";
import { COLORS, font } from "./theme";

type Ctx = CanvasRenderingContext2D;
type S = DeepReadonly<CaromState>;

/** Draws the whole frame for `state`. */
export function renderGame(ctx: Ctx, state: S): void {
  ctx.save();
  switch (state.screen) {
    case "title":
      drawField(ctx, state, { dim: true });
      drawTitle(ctx, state);
      break;
    case "howto":
      drawField(ctx, state, { dim: true });
      drawHowTo(ctx, state);
      break;
    case "countdown":
      drawField(ctx, state, { dim: false });
      drawHud(ctx, state);
      drawCountdown(ctx, state);
      break;
    case "playing":
      drawField(ctx, state, { dim: false });
      drawHud(ctx, state);
      break;
    case "paused":
      drawField(ctx, state, { dim: false });
      drawHud(ctx, state);
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawField(ctx, state, { dim: false });
      drawHud(ctx, state);
      drawMatchOver(ctx, state);
      break;
  }
  // Leave no current path behind: the engine's recorder carries the path in
  // force into the next frame's state, and a fresh path keeps a recording small.
  ctx.beginPath();
  ctx.restore();
}

// ---- Primitives ---------------------------------------------------------------

function roundedRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function glowBar(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  roundedRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
  ctx.restore();
}

function text(
  ctx: Ctx,
  copy: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight: "bold" | "normal" = "normal",
  align: CanvasTextAlign = "center",
): void {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(copy, x, y);
}

// ---- The field ----------------------------------------------------------------

function drawField(ctx: Ctx, state: S, options: { dim: boolean }): void {
  drawBackdrop(ctx);
  drawNet(ctx);
  for (const obstacle of state.obstacles) {
    glowBar(
      ctx,
      obstacle.cx - OBSTACLE_W / 2,
      obstacle.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      COLORS.obstacle,
    );
  }
  drawPaddle(ctx, "left", state.paddles.left);
  drawPaddle(ctx, "right", state.paddles.right);
  if (state.ball !== null) drawBall(ctx, state.ball, state.simTime);
  if (options.dim) {
    ctx.fillStyle = COLORS.dim;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  }
}

function drawBackdrop(ctx: Ctx): void {
  const gradient = ctx.createRadialGradient(
    FIELD_CX,
    FIELD_CY,
    80,
    FIELD_CX,
    FIELD_CY,
    820,
  );
  gradient.addColorStop(0, "#111a30");
  gradient.addColorStop(1, COLORS.field);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  ctx.strokeStyle = COLORS.fieldEdge;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(FIELD_W, 2);
  ctx.moveTo(0, FIELD_H - 2);
  ctx.lineTo(FIELD_W, FIELD_H - 2);
  ctx.stroke();
}

function drawNet(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = COLORS.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 12);
  ctx.lineTo(NET_X, FIELD_H - 12);
  ctx.stroke();
  ctx.restore();
}

function drawPaddle(ctx: Ctx, side: Side, paddle: DeepReadonly<PaddleState>) {
  const x = side === "left" ? P1_X0 : P2_X0;
  const color = side === "left" ? COLORS.leftPaddle : COLORS.rightPaddle;
  glowBar(ctx, x, paddle.cy - PADDLE_H / 2, PADDLE_W, PADDLE_H, color);
}

function drawBall(ctx: Ctx, ball: DeepReadonly<BallState>, now: number): void {
  drawTrail(ctx, ball, now);
  ctx.save();
  ctx.shadowColor = COLORS.ballGlow;
  ctx.shadowBlur = 22;
  ctx.fillStyle = COLORS.ball;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The motion trail: the ball's path over the last `TRAIL_TIME` seconds, drawn
 * as segments that fade and thin toward the oldest sample.
 */
function drawTrail(ctx: Ctx, ball: DeepReadonly<BallState>, now: number): void {
  const samples = ball.trail;
  if (samples.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = COLORS.trail;
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1];
    const to = samples[i];
    if (from === undefined || to === undefined) continue;
    const age = Math.min(1, Math.max(0, (now - to.t) / TRAIL_TIME));
    const life = 1 - age;
    ctx.globalAlpha = 0.45 * life;
    ctx.lineWidth = 2 + (BALL_R * 2 - 4) * life;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- The HUD ------------------------------------------------------------------

function drawHud(ctx: Ctx, state: S): void {
  text(
    ctx,
    String(state.score.p1),
    FIELD_CX - 90,
    64,
    64,
    COLORS.leftPaddle,
    "bold",
  );
  text(
    ctx,
    String(state.score.p2),
    FIELD_CX + 90,
    64,
    64,
    COLORS.rightPaddle,
    "bold",
  );
  text(ctx, modeLabel(state), FIELD_CX, FIELD_H - 26, 18, COLORS.textDim);
}

function modeLabel(state: S): string {
  const mode =
    state.mode === "solo" ? "SOLO  ·  YOU vs AI" : "VERSUS  ·  P1 vs P2";
  return `${mode}  ·  FIRST TO ${WIN_SCORE}`;
}

function drawCountdown(ctx: Ctx, state: S): void {
  const { ball } = state;
  if (ball === null || !ball.held) return;
  const progress = Math.min(1, Math.max(0, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R + 10 + progress * 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const arrow = state.receiver === "left" ? "◄" : "►";
  text(
    ctx,
    `SERVE ${arrow}`,
    FIELD_CX,
    FIELD_CY - 80,
    24,
    COLORS.accent,
    "bold",
  );
}

// ---- Menus --------------------------------------------------------------------

function drawMenu(ctx: Ctx, state: S, screen: MenuScreen): void {
  const items = menuItems(screen);
  items.forEach((label, index) => {
    const rect = menuItemRect(screen, index);
    if (rect === null) return;
    const selected = index === state.menuIndex;
    if (selected) {
      ctx.fillStyle = COLORS.menuHighlight;
      roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10);
      ctx.fill();
      ctx.strokeStyle = COLORS.menuHighlightEdge;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    text(
      ctx,
      selected ? `▸ ${label} ◂` : label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      28,
      selected ? COLORS.accent : COLORS.text,
      selected ? "bold" : "normal",
    );
  });
}

function drawOverlay(ctx: Ctx): void {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawTitle(ctx: Ctx, state: S): void {
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 30;
  text(ctx, TITLE_TEXT, FIELD_CX, 200, 128, COLORS.text, "bold");
  ctx.restore();
  text(ctx, "A TOP-DOWN PADDLE DUEL", FIELD_CX, 282, 22, COLORS.textDim);
  drawMenu(ctx, state, "title");
  text(
    ctx,
    "W / S  or  ↑ / ↓  to choose   ·   ENTER to confirm   ·   M to mute",
    FIELD_CX,
    FIELD_H - 40,
    18,
    COLORS.textDim,
  );
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  ["PLAYER ONE", "W moves the left paddle up, S moves it down."],
  ["PLAYER TWO", "↑ and ↓ move the right paddle. In Solo the AI holds it."],
  ["MENUS", "ENTER or SPACE confirms. P or ESC pauses. M mutes."],
  ["SPIN", "A moving paddle curves the ball. Strike while moving to bend"],
  ["", "its flight; the curve fades over the next second or so."],
  ["BANK SHOTS", "Two bars stand in the field. A ball ricochets off them at"],
  ["", "full speed, so aim through the gaps or play the angles."],
  ["WINNING", `First to ${WIN_SCORE} points, leading by two.`],
];

function drawHowTo(ctx: Ctx, state: S): void {
  drawOverlay(ctx);
  text(ctx, "HOW TO PLAY", FIELD_CX, 90, 56, COLORS.text, "bold");
  const left = 230;
  let y = 180;
  for (const [heading, line] of HOWTO_LINES) {
    if (heading !== "") {
      text(ctx, heading, left, y, 20, COLORS.accent, "bold", "left");
    }
    text(ctx, line, left + 190, y, 20, COLORS.text, "normal", "left");
    y += 48;
  }
  drawMenu(ctx, state, "howto");
}

function drawPaused(ctx: Ctx, state: S): void {
  drawOverlay(ctx);
  text(ctx, "PAUSED", FIELD_CX, 230, 72, COLORS.text, "bold");
  drawMenu(ctx, state, "paused");
}

function winnerLabel(state: S): string {
  if (state.winner === "left") {
    return state.mode === "solo" ? "YOU WIN" : "PLAYER ONE WINS";
  }
  return state.mode === "solo" ? "THE AI WINS" : "PLAYER TWO WINS";
}

function drawMatchOver(ctx: Ctx, state: S): void {
  drawOverlay(ctx);
  const color =
    state.winner === "left" ? COLORS.leftPaddle : COLORS.rightPaddle;
  text(ctx, winnerLabel(state), FIELD_CX, 210, 72, color, "bold");
  text(
    ctx,
    `${state.score.p1}  —  ${state.score.p2}`,
    FIELD_CX,
    310,
    56,
    COLORS.text,
    "bold",
  );
  text(ctx, "FINAL SCORE", FIELD_CX, 360, 18, COLORS.textDim);
  drawMenu(ctx, state, "matchover");
}
