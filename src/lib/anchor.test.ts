import { describe, expect, it } from "vitest";

import { type Anchor, placePanel } from "./anchor";

const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 260, maxHeight: 340 };

/** A trigger 100 px wide sitting at the given top-left. */
function anchorAt(left: number, top: number, width = 100, height = 26): Anchor {
  return { left, top, right: left + width, bottom: top + height };
}

describe("placePanel", () => {
  it("hangs below the trigger at full height when there is room", () => {
    const placement = placePanel(anchorAt(120, 40), PANEL, VIEWPORT);
    expect(placement.top).toBe(72);
    expect(placement.bottom).toBeUndefined();
    expect(placement.maxHeight).toBe(340);
    expect(placement.left).toBe(120);
  });

  it("shrinks to the room below rather than overflowing the viewport", () => {
    // 800 - (500 + 26) - 6 - 8 = 260 of usable room, which still beats flipping.
    const placement = placePanel(anchorAt(120, 500), PANEL, VIEWPORT);
    expect(placement.top).toBe(532);
    expect(placement.maxHeight).toBe(260);
  });

  it("flips above the trigger when below is cramped and above is roomier", () => {
    const placement = placePanel(anchorAt(120, 700), PANEL, VIEWPORT);
    expect(placement.top).toBeUndefined();
    // Anchored by its bottom edge: the rendered height is unknown until it lays out.
    expect(placement.bottom).toBe(106);
    // Room above is 686, but the panel never grows past the height it asked for.
    expect(placement.maxHeight).toBe(340);
  });

  it("stays below when both directions are cramped but below is the larger", () => {
    const placement = placePanel(anchorAt(120, 60), { width: 260, maxHeight: 340 }, { width: 1000, height: 220 });
    expect(placement.top).toBe(92);
    expect(placement.bottom).toBeUndefined();
    expect(placement.maxHeight).toBe(120);
  });

  it("right-aligns on the trigger's right edge, which is where pane chrome sits", () => {
    const placement = placePanel(anchorAt(600, 40), PANEL, VIEWPORT, "right");
    expect(placement.left).toBe(440);
  });

  it("clamps against the right edge instead of running off it", () => {
    const placement = placePanel(anchorAt(900, 40), PANEL, VIEWPORT);
    expect(placement.left).toBe(732);
  });

  it("clamps against the left edge", () => {
    const placement = placePanel(anchorAt(20, 40), PANEL, VIEWPORT, "right");
    expect(placement.left).toBe(8);
  });

  it("never reports a negative height, however little room there is", () => {
    const placement = placePanel(anchorAt(10, 190), PANEL, { width: 1000, height: 200 });
    expect(placement.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it("keeps the panel on screen when it is wider than the viewport", () => {
    const placement = placePanel(anchorAt(10, 40), { width: 1200, maxHeight: 340 }, VIEWPORT);
    expect(placement.left).toBe(8);
  });
});
