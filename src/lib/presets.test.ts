import { describe, expect, it } from "vitest";

import { PRESETS } from "./presets";
import { getProvider } from "./providers/registry";
import { resolveVariant } from "./providers/variants";

const NOW = new Date("2026-07-30T00:00:00Z");

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

  it("only suggests providers that exist", () => {
    for (const preset of PRESETS) {
      for (const layer of preset.suggests ?? []) {
        expect(getProvider(layer.providerId), `${preset.name} -> ${layer.providerId}`).toBeDefined();
      }
    }
  });

  it("only suggests variants the provider actually publishes", () => {
    // A suggestion that silently falls back to the default would quietly stop making its point
    // — the Aral Sea pair is only interesting if 2017 really is 2017.
    for (const preset of PRESETS) {
      for (const layer of preset.suggests ?? []) {
        if (layer.variant === undefined) continue;
        const spec = getProvider(layer.providerId)!.variant;
        expect(spec, `${preset.name} -> ${layer.providerId} has no variants`).toBeDefined();
        expect(resolveVariant(spec!, layer.variant, NOW), `${preset.name} -> ${layer.providerId}:${layer.variant}`).toBe(layer.variant);
      }
    }
  });

  it("suggests exactly two panes where it suggests any, since pairs are the comparison unit", () => {
    for (const preset of PRESETS) {
      if (!preset.suggests) continue;
      expect(preset.suggests, preset.name).toHaveLength(2);
    }
  });

  it("opens on a zoom each suggested provider can actually serve", () => {
    // Suggesting a pair that lands blurry undercuts the point of the preset.
    for (const preset of PRESETS) {
      for (const layer of preset.suggests ?? []) {
        const provider = getProvider(layer.providerId)!;
        expect(provider.maxzoom, `${preset.name} -> ${provider.id} maxzoom ${provider.maxzoom} < z${preset.zoom}`).toBeGreaterThanOrEqual(preset.zoom);
      }
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
