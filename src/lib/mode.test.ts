import { describe, expect, it } from "vitest";

import { isMode, isStacked, MODE_LABELS, MODES, paneCountFor } from "./mode";

describe("isMode", () => {
  it("accepts every declared mode", () => {
    for (const m of MODES) expect(isMode(m)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const s of ["", "g0", "g5", "swipe", "G2", "op"]) expect(isMode(s)).toBe(false);
  });
});

describe("paneCountFor", () => {
  it("maps grid modes onto their digit", () => {
    expect(paneCountFor("g1")).toBe(1);
    expect(paneCountFor("g2")).toBe(2);
    expect(paneCountFor("g3")).toBe(3);
    expect(paneCountFor("g4")).toBe(4);
  });

  it("gives the stacked modes exactly two panes", () => {
    expect(paneCountFor("sw")).toBe(2);
    expect(paneCountFor("bl")).toBe(2);
  });

  it("never returns a count outside 1..4", () => {
    for (const m of MODES) {
      const n = paneCountFor(m);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});

describe("isStacked", () => {
  it("is true only for swipe and blink", () => {
    expect(isStacked("sw")).toBe(true);
    expect(isStacked("bl")).toBe(true);
    for (const m of ["g1", "g2", "g3", "g4"] as const) expect(isStacked(m)).toBe(false);
  });
});

describe("MODE_LABELS", () => {
  it("labels every mode", () => {
    for (const m of MODES) expect(MODE_LABELS[m]).toBeTruthy();
  });
});
