import type { RasterSourceSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { BASEMAP_LAYER_ID, BASEMAP_SOURCE_ID, buildRasterStyle, buildStyle, resolveAttribution, resolveStyleUrl } from "./buildStyle";
import { getProvider } from "./registry";
import type { RasterProvider, StyleProvider } from "./types";

const versatiles = getProvider("versatiles.satellite") as RasterProvider;
const esri = getProvider("esri.imagery") as RasterProvider;
const eox = getProvider("eox.s2cloudless") as RasterProvider;
const wayback = getProvider("esri.wayback") as RasterProvider;
const mapbox = getProvider("mapbox.satellite") as RasterProvider;
const maptiler = getProvider("maptiler.satellite") as StyleProvider;
const liberty = getProvider("openfreemap.liberty") as StyleProvider;

const source = (style: ReturnType<typeof buildRasterStyle>) => style.sources[BASEMAP_SOURCE_ID] as RasterSourceSpecification;

describe("buildRasterStyle", () => {
  it("produces a single-source, single-layer style", () => {
    const style = buildRasterStyle(esri, undefined, undefined);
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toStrictEqual([BASEMAP_SOURCE_ID]);
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]!.id).toBe(BASEMAP_LAYER_ID);
  });

  it("carries the declared tileSize through, since a wrong one shifts the whole layer", () => {
    expect(source(buildRasterStyle(versatiles, undefined, undefined)).tileSize).toBe(512);
    expect(source(buildRasterStyle(esri, undefined, undefined)).tileSize).toBe(256);
  });

  it("carries the measured zoom range through", () => {
    const s = source(buildRasterStyle(eox, "2025", undefined));
    expect(s.minzoom).toBe(0);
    expect(s.maxzoom).toBe(14);
  });

  it("disables the tile cross-fade, which would blend two resolutions mid-comparison", () => {
    expect(buildRasterStyle(esri, undefined, undefined).layers[0]!.paint).toMatchObject({ "raster-fade-duration": 0 });
  });

  it("defaults resampling to linear and honours nearest", () => {
    expect(buildRasterStyle(esri, undefined, undefined).layers[0]!.paint).toMatchObject({ "raster-resampling": "linear" });
    expect(buildRasterStyle(esri, undefined, undefined, { resampling: "nearest" }).layers[0]!.paint).toMatchObject({ "raster-resampling": "nearest" });
  });

  it("sets attribution on the source rather than relying on a TileJSON fetch", () => {
    // VersaTiles' TileJSON declares a relative tiles array and a wrong maxzoom, so `url:`
    // sources are avoided entirely — which means attribution has to be supplied here.
    const s = source(buildRasterStyle(versatiles, undefined, undefined));
    expect(s.attribution).toContain("VersaTiles");
    expect(s).not.toHaveProperty("url");
    expect(s.tiles).toBeDefined();
  });

  it("emits Esri's {z}/{y}/{x} order untouched and does not set a tms scheme", () => {
    // {z}/{y}/{x} is a placeholder ordering, not TMS. Setting scheme: "tms" would flip y
    // and silently render the wrong place.
    const s = source(buildRasterStyle(esri, undefined, undefined));
    expect(s.tiles![0]).toContain("/tile/{z}/{y}/{x}");
    expect(s.scheme).toBeUndefined();
  });
});

describe("token substitution", () => {
  it("substitutes a year into the tile template", () => {
    expect(source(buildRasterStyle(eox, "2019", undefined)).tiles![0]).toContain("s2cloudless-2019_3857");
  });

  it("substitutes a year into the attribution, which EOX require to name the vintage", () => {
    const attribution = resolveAttribution(eox, "2019");
    expect(attribution).toContain("EOxCloudless 2019");
    expect(attribution).toContain("Copernicus Sentinel data 2019");
    expect(attribution).not.toContain("{YEAR}");
  });

  it("substitutes an opaque Wayback release id", () => {
    const url = source(buildRasterStyle(wayback, "645", undefined)).tiles![0]!;
    expect(url).toContain("/MapServer/tile/645/{z}/{y}/{x}");
    expect(url).not.toContain("{RELEASE}");
  });

  it("substitutes an API key", () => {
    const url = source(buildRasterStyle(mapbox, undefined, "pk.secret")).tiles![0]!;
    expect(url).toContain("access_token=pk.secret");
    expect(url).not.toContain("{KEY}");
  });

  it("leaves the tile placeholders alone for MapLibre to fill", () => {
    const url = source(buildRasterStyle(eox, "2020", undefined)).tiles![0]!;
    expect(url).toContain("{z}");
    expect(url).toContain("{x}");
    expect(url).toContain("{y}");
  });
});

describe("resolveStyleUrl", () => {
  it("substitutes the key", () => {
    expect(resolveStyleUrl(maptiler, "abc123")).toBe("https://api.maptiler.com/maps/satellite/style.json?key=abc123");
  });

  it("leaves a keyless style URL alone", () => {
    expect(resolveStyleUrl(liberty, undefined)).toBe("https://tiles.openfreemap.org/styles/liberty");
  });
});

describe("buildStyle", () => {
  it("resolves a keyless raster provider to a full style", () => {
    const result = buildStyle(esri, undefined, {});
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("style");
  });

  it("defers style providers for fetching, since the overlay needs their JSON", () => {
    const result = buildStyle(liberty, undefined, {});
    expect(result).toStrictEqual({ ok: true, needsFetch: true, url: "https://tiles.openfreemap.org/styles/liberty" });
  });

  it("refuses a keyed provider when the key is missing", () => {
    expect(buildStyle(mapbox, undefined, {})).toStrictEqual({ ok: false, reason: "missing-key", key: "VITE_MAPBOX_TOKEN" });
  });

  it("refuses a keyed provider when the key is blank", () => {
    expect(buildStyle(mapbox, undefined, { VITE_MAPBOX_TOKEN: "   " }).ok).toBe(false);
  });

  it("accepts a keyed provider once the key arrives", () => {
    const result = buildStyle(mapbox, undefined, { VITE_MAPBOX_TOKEN: "pk.abc" });
    expect(result.ok).toBe(true);
  });

  it("refuses a keyed style provider too", () => {
    expect(buildStyle(maptiler, undefined, {})).toStrictEqual({ ok: false, reason: "missing-key", key: "VITE_MAPTILER_KEY" });
  });

  it("never leaks a {KEY} placeholder into a resolved URL", () => {
    const result = buildStyle(maptiler, undefined, { VITE_MAPTILER_KEY: "k" });
    expect(result).toHaveProperty("url");
    if ("url" in result) expect(result.url).not.toContain("{KEY}");
  });
});
