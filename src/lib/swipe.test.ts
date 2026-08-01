import { describe, expect, it } from "vitest";

import { clampSwipe, clipInsetFor, dividerPercent, fractionFromPointer, MIN_INSET, nudge, paneSide } from "./swipe";

const RECT = { left: 100, width: 800 };

describe("fractionFromPointer", () => {
  it("maps a pointer in the middle to 0.5", () => {
    expect(fractionFromPointer(500, RECT)).toBeCloseTo(0.5, 10);
  });

  it("accounts for the deck's left offset", () => {
    expect(fractionFromPointer(300, RECT)).toBeCloseTo(0.25, 10);
    expect(fractionFromPointer(700, RECT)).toBeCloseTo(0.75, 10);
  });

  it("clamps away from both edges so the divider stays grabbable", () => {
    expect(fractionFromPointer(0, RECT)).toBe(MIN_INSET);
    expect(fractionFromPointer(-500, RECT)).toBe(MIN_INSET);
    expect(fractionFromPointer(5000, RECT)).toBe(1 - MIN_INSET);
  });

  it("honours a custom inset", () => {
    expect(fractionFromPointer(0, RECT, 0.1)).toBe(0.1);
    expect(fractionFromPointer(5000, RECT, 0.1)).toBeCloseTo(0.9, 10);
  });

  it("falls back to the middle for a zero-width deck", () => {
    // Happens on the first frame before layout, and would otherwise divide by zero.
    expect(fractionFromPointer(500, { left: 0, width: 0 })).toBe(0.5);
  });
});

describe("nudge", () => {
  it("shifts by the delta", () => {
    expect(nudge(0.5, 0.01)).toBeCloseTo(0.51, 10);
    expect(nudge(0.5, -0.1)).toBeCloseTo(0.4, 10);
  });

  it("clamps at both ends", () => {
    expect(nudge(0.98, 0.5)).toBe(1 - MIN_INSET);
    expect(nudge(0.02, -0.5)).toBe(MIN_INSET);
  });
});

describe("clipInsetFor", () => {
  it("reveals the top pane left of the divider in swipe mode", () => {
    // At 0.25 the top pane shows in its left quarter, so 75% is inset from the right.
    expect(clipInsetFor("sw", 0.25, true)).toBe("inset(0 75.000% 0 0)");
    expect(clipInsetFor("sw", 0.5, true)).toBe("inset(0 50.000% 0 0)");
  });

  it("ignores topVisible in swipe mode", () => {
    expect(clipInsetFor("sw", 0.4, false)).toBe(clipInsetFor("sw", 0.4, true));
  });

  it("shows all or nothing in blink mode", () => {
    expect(clipInsetFor("bl", 0.5, true)).toBe("none");
    expect(clipInsetFor("bl", 0.5, false)).toBe("inset(0 100% 0 0)");
  });

  it("ignores the divider position in blink mode", () => {
    expect(clipInsetFor("bl", 0.1, false)).toBe("inset(0 100% 0 0)");
  });

  it("never clips in a grid mode", () => {
    for (const mode of ["g1", "g2", "g3", "g4"] as const) {
      expect(clipInsetFor(mode, 0.3, false)).toBe("none");
    }
  });
});

describe("dividerPercent", () => {
  it("formats as a percentage", () => {
    expect(dividerPercent(0.5)).toBe("50.000%");
    expect(dividerPercent(0.375)).toBe("37.500%");
  });
});

describe("paneSide", () => {
  it("puts every pane's chrome on the right in grid modes", () => {
    for (const mode of ["g1", "g2", "g3", "g4"] as const) {
      for (const index of [0, 1, 2, 3]) expect(paneSide(mode, index), `${mode}/${index}`).toBe("right");
    }
  });

  it("puts the clipped pane's chrome on the side the clip-path keeps", () => {
    // The pairing that matters, and the reason these two functions live in one module: swipe mode
    // clips the top pane from the RIGHT, so what survives is its left edge — which is where its
    // chrome, including a legally required credit, has to be. Getting this pair out of step erases
    // an attribution rather than merely looking untidy.
    expect(clipInsetFor("sw", 0.5, true)).toBe("inset(0 50.000% 0 0)");
    expect(paneSide("sw", 0)).toBe("left");
    expect(paneSide("sw", 1)).toBe("right");

    // Blink shows the top pane whole or not at all, so either side survives; it follows swipe so
    // that switching between the two stacked modes does not move the chrome.
    expect(clipInsetFor("bl", 0.5, true)).toBe("none");
    expect(paneSide("bl", 0)).toBe("left");
    expect(paneSide("bl", 1)).toBe("right");
  });

  it("clamps through the same function the pointer and URL paths use", () => {
    expect(clampSwipe(0)).toBe(MIN_INSET);
    expect(clampSwipe(1)).toBe(1 - MIN_INSET);
    expect(clampSwipe(Number.NaN)).toBe(0.5);
    expect(clampSwipe(0.5)).toBe(0.5);
  });
});
