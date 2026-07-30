import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { LIBERTY_FIXTURE, RASTER_BASE_FIXTURE } from "@/test/fixtures/libertyStyle";

import { applyLabelOverlay, extractLabelOverlay, OVERLAY_SOURCE_ID } from "./labelOverlay";

const overlay = extractLabelOverlay(LIBERTY_FIXTURE);

describe("extractLabelOverlay", () => {
  it("keeps every symbol layer", () => {
    const expected = LIBERTY_FIXTURE.layers.filter((l) => l.type === "symbol").map((l) => l.id);
    const kept = overlay.layers.filter((l) => l.type === "symbol").map((l) => l.id.replace(/^ofm-/, ""));
    expect(kept.toSorted()).toStrictEqual(expected.toSorted());
  });

  it("keeps boundary lines, which orient without competing with the imagery", () => {
    const kept = overlay.layers.filter((l) => l.type === "line").map((l) => l.id);
    expect(kept.toSorted()).toStrictEqual(["ofm-boundary_2", "ofm-boundary_3"]);
  });

  it("drops layers that would paint over the imagery", () => {
    // Background, landcover/water fills, the shaded-relief raster and 3D buildings would all
    // obscure the one thing the app exists to show.
    const types = new Set(overlay.layers.map((l) => l.type));
    expect(types).toStrictEqual(new Set(["symbol", "line"]));
    const ids = overlay.layers.map((l) => l.id);
    for (const dropped of ["ofm-background", "ofm-natural_earth", "ofm-water", "ofm-landcover_wood", "ofm-building_3d"]) {
      expect(ids, dropped).not.toContain(dropped);
    }
  });

  it("drops the road and waterway network, keeping annotation rather than cartography", () => {
    const ids = overlay.layers.map((l) => l.id);
    expect(ids).not.toContain("ofm-highway_major");
    expect(ids).not.toContain("ofm-waterway_river");
  });

  it("re-points every layer at the overlay's own source id", () => {
    // Liberty names its source "openmaptiles"; a base style using that name would otherwise
    // silently bind these layers to the wrong tiles.
    for (const layer of overlay.layers) {
      expect("source" in layer && layer.source, layer.id).toBe(OVERLAY_SOURCE_ID);
    }
  });

  it("prefixes layer ids so they cannot collide with a base style's layers", () => {
    for (const layer of overlay.layers) expect(layer.id).toMatch(/^ofm-/);
  });

  it("carries the glyphs endpoint, without which text renders as nothing", () => {
    expect(overlay.glyphs).toBe("https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf");
  });

  it("carries the sprite, without which shields and POI icons vanish", () => {
    expect(overlay.sprite).toBe("https://tiles.openfreemap.org/sprites/ofm_f384/ofm");
  });

  it("picks up the vector source with its attribution", () => {
    expect(overlay.source).toMatchObject({ type: "vector", url: "https://tiles.openfreemap.org/planet" });
    expect(overlay.attribution).toContain("OpenFreeMap");
  });

  it("preserves each layer's filters, zoom range and layout", () => {
    const shield = overlay.layers.find((l) => l.id === "ofm-highway-shield-non-us");
    expect(shield).toMatchObject({ minzoom: 8, "source-layer": "transportation_name" });
    expect(shield && "layout" in shield && shield.layout).toMatchObject({ "icon-image": "shield" });
  });

  it("throws when the style has no vector source to build from", () => {
    const noVector: StyleSpecification = { version: 8, sources: {}, layers: [] };
    expect(() => extractLabelOverlay(noVector)).toThrow(/vector source/i);
  });
});

describe("applyLabelOverlay", () => {
  const merged = applyLabelOverlay(RASTER_BASE_FIXTURE, overlay);

  it("keeps the base style's own sources and layers", () => {
    expect(merged.sources.basemap).toStrictEqual(RASTER_BASE_FIXTURE.sources.basemap);
    expect(merged.layers[0]).toStrictEqual(RASTER_BASE_FIXTURE.layers[0]);
  });

  it("appends the overlay layers last, so labels sit above the imagery", () => {
    const overlayIds = overlay.layers.map((l) => l.id);
    expect(merged.layers.slice(-overlayIds.length).map((l) => l.id)).toStrictEqual(overlayIds);
  });

  it("adds the overlay source", () => {
    expect(merged.sources[OVERLAY_SOURCE_ID]).toStrictEqual(overlay.source);
  });

  it("takes over glyphs and sprite", () => {
    // Safe only because every imagery provider in the catalogue is label-free.
    expect(merged.glyphs).toBe(overlay.glyphs);
    expect(merged.sprite).toBe(overlay.sprite);
  });

  it("does not mutate the input style", () => {
    expect(RASTER_BASE_FIXTURE.layers).toHaveLength(1);
    expect(RASTER_BASE_FIXTURE.glyphs).toBeUndefined();
    expect(Object.keys(RASTER_BASE_FIXTURE.sources)).toStrictEqual(["basemap"]);
  });

  it("is idempotent, so a re-resolve cannot stack duplicate layers", () => {
    const twice = applyLabelOverlay(merged, overlay);
    expect(twice.layers).toStrictEqual(merged.layers);
    expect(Object.keys(twice.sources).toSorted()).toStrictEqual(Object.keys(merged.sources).toSorted());
  });

  it("produces unique layer ids", () => {
    const ids = merged.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves every overlay layer pointing at a source that exists in the merged style", () => {
    for (const layer of merged.layers) {
      if (!("source" in layer) || typeof layer.source !== "string") continue;
      expect(Object.keys(merged.sources), layer.id).toContain(layer.source);
    }
  });

  it("also merges over a fetched vendor style that already has glyphs of its own", () => {
    const vendor: StyleSpecification = {
      version: 8,
      glyphs: "https://api.example.test/fonts/{fontstack}/{range}.pbf",
      sources: { sat: { type: "raster", tiles: ["https://api.example.test/{z}/{x}/{y}.jpg"], tileSize: 512 } },
      layers: [{ id: "sat", type: "raster", source: "sat" }],
    };
    const result = applyLabelOverlay(vendor, overlay);
    expect(result.glyphs).toBe(overlay.glyphs);
    expect(result.layers[0]!.id).toBe("sat");
    expect(result.layers).toHaveLength(1 + overlay.layers.length);
  });
});
