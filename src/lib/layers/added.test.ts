import { describe, expect, it } from "vitest";

import { addedLayerId, framing, isAddedLayer, isHttpUrl, isRegional } from "./added";
import { LAYERS } from "./registry";

describe("Added Layer ids", () => {
  it("are stable per source and tell assets apart", () => {
    expect(addedLayerId("stac", "x", "image")).toBe(addedLayerId("stac", "x", "image"));
    expect(addedLayerId("stac", "x", "image")).not.toBe(addedLayerId("stac", "x", "visual"));
  });

  it("are URL-safe, since they appear in every shared link, and never a shipped Layer's", () => {
    const id = addedLayerId("cog", "https://cogs.example/scene.tif");
    expect(id).toMatch(/^[a-z0-9]+(?:[._][a-z0-9]+)*$/);
    expect(isAddedLayer({ ...LAYERS[0]!, id })).toBe(true);
    for (const layer of LAYERS) expect(isAddedLayer(layer), layer.id).toBe(false);
  });
});

describe("isHttpUrl", () => {
  it("accepts only http and https", () => {
    expect(isHttpUrl("https://a.example/x.tif")).toBe(true);
    expect(isHttpUrl("http://a.example/")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:image/png;base64,AA")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });
});

describe("where an Added Layer is", () => {
  it("is regional for a city and not for the whole Earth", () => {
    expect(isRegional([-180, -85, 180, 85])).toBe(false);
    expect(isRegional([4.7, 52.2, 5.1, 52.5])).toBe(true);
    expect(isRegional(undefined)).toBe(false);
  });

  it("is framed at its centre, zoomed in until its wider side fills a pane", () => {
    const amsterdam = framing([4.7, 52.2, 5.1, 52.5], 18);
    expect(amsterdam.center[0]).toBeCloseTo(4.9);
    expect(amsterdam.center[1]).toBeCloseTo(52.35);
    expect(amsterdam.zoom).toBeCloseTo(Math.log2(360 / 0.6) + 1);
  });

  it("is never framed past the Layer's own ceiling, nor further out than z1", () => {
    expect(framing([4.89, 52.37, 4.891, 52.371], 12).zoom).toBe(12);
    expect(framing([-180, -85, 180, 85], 12).zoom).toBe(1);
  });
});
