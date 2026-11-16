import { describe, expect, it } from "vitest";

import { ADDED_LIMITS, type AddedLayer, addedLayerId } from "./added";
import { decodeAddedLayer, encodeAddedLayer, normaliseAddedLayer, parseStoredLayers } from "./addedCodec";
import { cogCandidate, xyzCandidate } from "./addedInspect";

const COLLECTION = "https://data.example/mosaic/collection.json";

const stac: AddedLayer = {
  id: addedLayerId("stac", COLLECTION, "image"),
  kind: "stac",
  label: "mosaic",
  provider: "added",
  category: "satellite",
  note: "One hourly picture of the whole planet.",
  attribution: 'Contains modified EUMETSAT Meteosat data {YEAR} · <a href="https://satvis.space/">satvis</a>',
  licence: { tier: "open", note: "The source states CC-BY-4.0.", url: "https://spdx.org/licenses/CC-BY-4.0.html" },
  collection: COLLECTION,
  asset: "image",
  minzoom: 0,
  maxzoom: 8,
  time: { precision: "minute", label: "Time", series: { stepMinutes: 60 } },
};

const xyz = xyzCandidate("https://tiles.example/{z}/{y}/{x}.png").layer;

async function cog(): Promise<AddedLayer> {
  return (await cogCandidate("https://cogs.example/scene.tif", { fetchText: async () => "", cogInfo: async () => ({ maxzoom: 14 }) })).layer;
}

describe("parseStoredLayers", () => {
  it("keeps well-formed Added Layers, one per source, and drops everything else", () => {
    const renamed = { ...stac, label: "renamed" };
    const broken = { ...stac, collection: undefined };
    expect(parseStoredLayers([stac, broken, null, "x", renamed])).toStrictEqual([renamed]);
    expect(parseStoredLayers({ not: "a list" })).toStrictEqual([]);
  });

  it("files a Layer under its source's id, whatever id it claims", () => {
    expect(parseStoredLayers([{ ...stac, id: "esri.imagery" }])[0]!.id).toBe(stac.id);
  });
});

describe("normaliseAddedLayer", () => {
  it("holds a name to the same limit the add form does", () => {
    expect(normaliseAddedLayer({ ...xyz, label: "x".repeat(ADDED_LIMITS.label) })).toBeDefined();
    expect(normaliseAddedLayer({ ...xyz, label: "x".repeat(ADDED_LIMITS.label + 1) })).toBeUndefined();
  });

  it("holds a zoom ceiling to the form's range", () => {
    expect(normaliseAddedLayer({ ...xyz, maxzoom: ADDED_LIMITS.maxZoom })).toBeDefined();
    expect(normaliseAddedLayer({ ...xyz, maxzoom: ADDED_LIMITS.maxZoom + 1 })).toBeUndefined();
    expect(normaliseAddedLayer({ ...xyz, maxzoom: 7.5 })).toBeUndefined();
  });
});

describe("Added Layer link tokens", () => {
  it("round-trip every kind exactly", async () => {
    for (const layer of [stac, xyz, await cog()]) {
      const token = encodeAddedLayer(layer);
      expect(token, layer.kind).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeAddedLayer(token), layer.kind).toStrictEqual(layer);
    }
  });

  it("survives text outside ASCII", () => {
    const layer = { ...xyz, label: "Wien – Ortho 2026 ✓" };
    expect(decodeAddedLayer(encodeAddedLayer(layer))).toStrictEqual(layer);
  });

  it("rejects what a crafted link could use against its recipient", async () => {
    const layer = await cog();
    const forge = (patch: object) => decodeAddedLayer(encodeAddedLayer({ ...layer, ...patch } as typeof layer));
    expect(forge({ licence: { ...layer.licence, url: "javascript:alert(1)" } })).toBeUndefined();
    expect(forge({ url: "data:image/tiff;base64,AAAA" })).toBeUndefined();
    expect(forge({ maxzoom: 99 })).toBeUndefined();
    // Fields only the registry may set are dropped, not trusted.
    expect(forge({ requiresKey: "VITE_MAPBOX_TOKEN", wordmark: { src: "/x.svg" } })).toStrictEqual(layer);
    expect(decodeAddedLayer("not base64 at all!")).toBeUndefined();
  });
});
