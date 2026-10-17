// Carom — the menus: which items each screen shows, where they sit, and how
// the keyboard and the pointer move over them (specs/ui.md).

import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { MenuPressState, Screen } from "./game";
import type { MenuPointerSample } from "./input";

/** A hit region in logical units, by its top-left corner and size. */
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The copy of the how-to screen's single item. */
export const HOWTO_ITEMS = ["BACK TO TITLE"] as const;

export const MENU_ITEM_W = 380;
export const MENU_ITEM_H = 60;
export const MENU_ITEM_GAP = 18;

/** Where each menu's first item starts, vertically. */
const MENU_TOP: Readonly<Record<MenuScreen, number>> = {
  title: 372,
  howto: 626,
  paused: 330,
  matchover: 440,
};

export type MenuScreen = Exclude<Screen, "countdown" | "playing">;

export function isMenuScreen(screen: Screen): screen is MenuScreen {
  return screen !== "countdown" && screen !== "playing";
}

/** The items the menu on `screen` shows, in order. */
export function menuItems(screen: MenuScreen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
  }
}

/** The region item `index` of the menu on `screen` occupies, or `null`. */
export function menuItemRect(screen: Screen, index: number): MenuRect | null {
  if (!isMenuScreen(screen)) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  if (index >= menuItems(screen).length) return null;
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: MENU_TOP[screen] + index * (MENU_ITEM_H + MENU_ITEM_GAP),
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

function contains(rect: MenuRect, x: number, y: number): boolean {
  return (
    x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
  );
}

/** The item of the menu on `screen` under `(x, y)`, or `-1`. */
export function menuItemAt(screen: MenuScreen, x: number, y: number): number {
  const count = menuItems(screen).length;
  for (let index = 0; index < count; index++) {
    const rect = menuItemRect(screen, index);
    if (rect !== null && contains(rect, x, y)) return index;
  }
  return -1;
}

/** `index` moved by `step` over `count` items, wrapping both ways. */
export function wrapIndex(index: number, step: number, count: number): number {
  return (((index + step) % count) + count) % count;
}

/** What a frame's pointer samples did to a menu. */
export interface PointerMenuResult {
  /** The item the last selecting sample named, or `null` if none did. */
  readonly menuIndex: number | null;
  /** The item a press-and-release confirmed, or `null`. */
  readonly confirmed: number | null;
  /** The presses still waiting for their release. */
  readonly presses: readonly MenuPressState[];
}

/**
 * Applies a frame's pointer samples to the menu on `screen`, in arrival order
 * (specs/ui.md, "Pointer and touch"): a sample inside an item's region selects
 * it, a `down` inside a region arms a press, and an `up` inside the same region
 * as its press confirms that item. An `up` anywhere ends the press.
 */
export function applyPointerToMenu(
  screen: MenuScreen,
  presses: DeepReadonly<readonly MenuPressState[]>,
  samples: readonly MenuPointerSample[],
): PointerMenuResult {
  let menuIndex: number | null = null;
  let confirmed: number | null = null;
  let pending: MenuPressState[] = presses.map((p) => ({ ...p }));

  for (const sample of samples) {
    const item = menuItemAt(screen, sample.x, sample.y);
    if (item >= 0) menuIndex = item;
    if (sample.type === "down") {
      pending = pending.filter((p) => p.pointerId !== sample.id);
      if (item >= 0) pending.push({ pointerId: sample.id, item });
    } else if (sample.type === "up") {
      const press = pending.find((p) => p.pointerId === sample.id);
      pending = pending.filter((p) => p.pointerId !== sample.id);
      if (press !== undefined && item === press.item && confirmed === null) {
        confirmed = item;
        menuIndex = item;
      }
    }
  }
  return { menuIndex, confirmed, presses: pending };
}
