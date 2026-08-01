import { describe, expect, it } from "vitest";

import { PRESETS } from "./presets";

describe("presets", () => {
  it("has unique names", () => {
    const names = PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every preset a reason, since that is why the entry exists", () => {
    for (const p of PRESETS) expect(p.why.trim(), p.name).not.toBe("");
  });

  it("has coordinates inside the Web Mercator domain", () => {
    for (const p of PRESETS) {
      expect(Math.abs(p.lat), p.name).toBeLessThan(85.051129);
      expect(Math.abs(p.lon), p.name).toBeLessThanOrEqual(180);
    }
  });

  it("uses sensible zooms", () => {
    for (const p of PRESETS) {
      expect(p.zoom, p.name).toBeGreaterThanOrEqual(0);
      expect(p.zoom, p.name).toBeLessThanOrEqual(22);
    }
  });

  it("carries no layer information at all", () => {
    // The guard behind "the place picker moves the camera and nothing else". A `suggests`-style
    // field creeping back in would silently swap the panes out from under a comparison the user
    // was in the middle of making, so the shape is asserted rather than the behaviour.
    for (const preset of PRESETS) {
      expect(Object.keys(preset).toSorted(), preset.name).toEqual(["lat", "lon", "name", "why", "zoom"]);
    }
  });

  it("starts with Amsterdam, matching the app's opening view", () => {
    expect(PRESETS[0]!.name).toContain("Amsterdam");
    expect(PRESETS[0]!.zoom).toBe(16);
  });

  it("includes Munich", () => {
    expect(PRESETS.some((p) => p.name.includes("Munich"))).toBe(true);
  });
});
