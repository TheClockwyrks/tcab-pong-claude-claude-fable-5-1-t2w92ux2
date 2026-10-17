// Serves the production build from `dist/` and screenshots the running game in
// headless Chromium, driving it from the keyboard as a player would. Writes the
// PNGs the showcase carousel names into showcase/.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import console from "node:console";
import process from "node:process";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const out = join(root, "showcase");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serve() {
  const server = createServer(async (request, response) => {
    const path = request.url === "/" ? "/index.html" : (request.url ?? "/");
    try {
      const body = await readFile(join(dist, path.split("?")[0]));
      response.writeHead(200, {
        "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

async function main() {
  const server = await serve();
  const { port } = server.address();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, "title.png") });

  // How to play: the third title item.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, "howto.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // The title remembers its last selection, so wrap back to SOLO first.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);

  // A Solo match: start it, play the left paddle for a while, and shoot a burst
  // of frames mid-rally. The burst is picked over by hand afterwards.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1300);
  const burst = [];
  for (let i = 0; i < 10; i++) {
    const key = i % 4 < 2 ? "KeyS" : "KeyW";
    await page.keyboard.down(key);
    await page.waitForTimeout(260);
    await page.keyboard.up(key);
    const path = join(out, `play-${i}.png`);
    await page.screenshot({ path });
    burst.push(path);
  }

  await browser.close();
  server.close();
  if (errors.length > 0) {
    console.error("page errors:", errors);
    process.exitCode = 1;
  }
  console.log("wrote title.png, howto.png, and", burst.length, "play frames");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
