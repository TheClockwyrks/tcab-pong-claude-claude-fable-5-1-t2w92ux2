// Records a few seconds of live play with the engine's recorder and writes the
// gzipped recording into showcase/. Run through `scripts/capture-replay.mjs`,
// which bundles this file for Node.

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PADDLE_SPEED } from "../src/constants";
import { createHarness, pose } from "../src/testing/harness";

const FPS = 60;
const SECONDS = 8;
const OUT = resolve(process.cwd(), "showcase", "rally.json.gz");

async function main(): Promise<void> {
  const h = await createHarness(1000 / FPS);

  // Start a Solo match from the title, as a player would, then take the left
  // paddle from the keyboard and drive it from a small controller that arrives
  // late and still moving, so most of its hits carry spin.
  h.tap("Enter");
  await h.step();
  pose(h, (d, s) => d.setPaddleDriven(s, "left", true));
  pose(h, (d, s) => d.setBallServeSign(s, -1));

  // Run the serve out so the recording opens on live play.
  await h.stepUntil((s) => s.screen === "playing", FPS * 2);

  h.engine.startRecording();
  for (let frame = 0; frame < SECONDS * FPS; frame++) {
    const snap = h.snap();
    const ball = snap.ball;
    const paddle = snap.paddles.left;
    let target = 360;
    if (ball !== null && ball.vx < 0)
      target = ball.y + 30 * Math.sign(ball.vy || 1);
    const vy = Math.max(
      -PADDLE_SPEED,
      Math.min(PADDLE_SPEED, (target - paddle.cy) * 9),
    );
    pose(h, (d, s) => d.setPaddleVy(s, "left", vy));
    await h.step();
  }
  const recording = h.engine.stopRecording();
  h.destroy();

  mkdirSync(resolve(process.cwd(), "showcase"), { recursive: true });
  const json = JSON.stringify(recording);
  writeFileSync(OUT, gzipSync(Buffer.from(json), { level: 9 }));
  console.log(
    `wrote ${OUT}: ${recording.frames.length} frames, ${json.length} bytes raw`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
