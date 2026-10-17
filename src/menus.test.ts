import { describe, expect, it } from "vitest";
import { MATCHOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import {
  HOWTO_ITEMS,
  applyPointerToMenu,
  isMenuScreen,
  menuItemAt,
  menuItemRect,
  menuItems,
  wrapIndex,
} from "./menus";

function center(
  screen: "title" | "howto" | "paused" | "matchover",
  index: number,
) {
  const rect = menuItemRect(screen, index)!;
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

describe("menu layout", () => {
  it("lists each screen's items in order", () => {
    expect(menuItems("title")).toEqual(TITLE_ITEMS);
    expect(menuItems("howto")).toEqual(HOWTO_ITEMS);
    expect(menuItems("paused")).toEqual(PAUSE_ITEMS);
    expect(menuItems("matchover")).toEqual(MATCHOVER_ITEMS);
    expect(isMenuScreen("playing")).toBe(false);
    expect(isMenuScreen("countdown")).toBe(false);
    expect(isMenuScreen("paused")).toBe(true);
  });

  it("lays items out inside the field without overlap", () => {
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      const rects = menuItems(screen).map((_, i) => menuItemRect(screen, i)!);
      rects.forEach((rect, i) => {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(1280);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.h).toBeLessThanOrEqual(720);
        if (i > 0)
          expect(rect.y).toBeGreaterThanOrEqual(
            rects[i - 1]!.y + rects[i - 1]!.h,
          );
      });
    }
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemRect("title", 1.5)).toBeNull();
  });

  it("finds the item under a point", () => {
    const c = center("title", 1);
    expect(menuItemAt("title", c.x, c.y)).toBe(1);
    expect(menuItemAt("title", 10, 10)).toBe(-1);
  });

  it("wraps an index both ways", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(1, 1, 3)).toBe(2);
  });
});

describe("applyPointerToMenu", () => {
  it("selects the item a sample lands on", () => {
    const c = center("title", 2);
    const result = applyPointerToMenu(
      "title",
      [],
      [{ type: "move", x: c.x, y: c.y, id: 1 }],
    );
    expect(result).toEqual({ menuIndex: 2, confirmed: null, presses: [] });
  });

  it("confirms a press and release inside one region, even on one frame", () => {
    const c = center("paused", 1);
    const result = applyPointerToMenu(
      "paused",
      [],
      [
        { type: "down", x: c.x, y: c.y, id: 1 },
        { type: "up", x: c.x + 3, y: c.y + 3, id: 1 },
      ],
    );
    expect(result).toEqual({ menuIndex: 1, confirmed: 1, presses: [] });
  });

  it("carries a press across frames and confirms on the release", () => {
    const c = center("title", 0);
    const first = applyPointerToMenu(
      "title",
      [],
      [{ type: "down", x: c.x, y: c.y, id: 7 }],
    );
    expect(first).toEqual({
      menuIndex: 0,
      confirmed: null,
      presses: [{ pointerId: 7, item: 0 }],
    });
    const second = applyPointerToMenu("title", first.presses, [
      { type: "up", x: c.x, y: c.y, id: 7 },
    ]);
    expect(second.confirmed).toBe(0);
    expect(second.presses).toEqual([]);
  });

  it("confirms nothing when the edges fall in different regions or outside", () => {
    const a = center("title", 0);
    const b = center("title", 1);
    const across = applyPointerToMenu(
      "title",
      [],
      [
        { type: "down", x: a.x, y: a.y, id: 1 },
        { type: "move", x: b.x, y: b.y, id: 1 },
        { type: "up", x: b.x, y: b.y, id: 1 },
      ],
    );
    expect(across.confirmed).toBeNull();
    expect(across.menuIndex).toBe(1);
    expect(across.presses).toEqual([]);
    const outside = applyPointerToMenu(
      "title",
      [],
      [
        { type: "down", x: 5, y: 5, id: 1 },
        { type: "up", x: a.x, y: a.y, id: 1 },
      ],
    );
    expect(outside.confirmed).toBeNull();
    expect(outside.menuIndex).toBe(0);
  });

  it("tracks touch contacts by id", () => {
    const a = center("matchover", 0);
    const b = center("matchover", 1);
    const result = applyPointerToMenu(
      "matchover",
      [],
      [
        { type: "down", x: a.x, y: a.y, id: 1 },
        { type: "down", x: b.x, y: b.y, id: 2 },
        { type: "up", x: a.x, y: a.y, id: 1 },
      ],
    );
    expect(result.confirmed).toBe(0);
    expect(result.presses).toEqual([{ pointerId: 2, item: 1 }]);
  });
});
