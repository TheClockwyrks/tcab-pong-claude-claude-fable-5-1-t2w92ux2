import { describe, expect, it } from "vitest";
import { TITLE_ITEMS } from "../constants";
import { createHarness } from "./harness";

describe("the harness", () => {
  it("stands the engine up on the title screen and drives a key", async () => {
    const h = await createHarness();
    expect(h.snap().screen).toBe("title");
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
    h.keyDown("ArrowDown");
    await h.step();
    h.keyUp("ArrowDown");
    await h.step();
    expect(h.snap().menuIndex).toBe(2 % TITLE_ITEMS.length);
    h.destroy();
  });
});
