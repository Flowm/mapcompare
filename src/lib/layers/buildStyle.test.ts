import type { RasterSourceSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { BASEMAP_LAYER_ID, BASEMAP_SOURCE_ID, buildRasterStyle, buildStyle, describeAttribution, resolveAttribution, resolveStyleUrl } from "./buildStyle";
import { wmsTemplate } from "./discovery";
import { getLayer } from "./registry";
import type { ResolvedTime } from "./time";
import type { CogLayer, StacLayer, StyleLayer, WmsLayer, WmtsLayer, XyzLayer } from "./types";

const versatiles = getLayer("versatiles.satellite") as XyzLayer;
const esri = getLayer("esri.imagery") as XyzLayer;
const eox = getLayer("eox.s2cloudless") as XyzLayer;
const wayback = getLayer("esri.wayback") as XyzLayer;
const mapbox = getLayer("mapbox.satellite") as XyzLayer;
const maptiler = getLayer("maptiler.satellite") as StyleLayer;
const liberty = getLayer("openfreemap.liberty") as StyleLayer;
const goes = getLayer("gibs.goes.east") as WmtsLayer;
const meteosat = getLayer("eumetsat.mtg.geocolour") as WmsLayer;
const mosaic = getLayer("satvis.georing") as StacLayer;

/** A resolved Time whose template value is the Time itself unless the service names it otherwise. */
const at = (time: string, value = time): ResolvedTime => ({ time, value, year: time.slice(0, 4) });

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
    const s = source(buildRasterStyle(eox, at("2025"), undefined));
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
    expect(source(buildRasterStyle(eox, at("2019"), undefined)).tiles![0]).toContain("s2cloudless-2019_3857");
  });

  it("substitutes a year into the attribution, which EOX require to name the vintage", () => {
    const attribution = resolveAttribution(eox, at("2019"));
    expect(attribution).toContain("EOxCloudless 2019");
    expect(attribution).toContain("Copernicus Sentinel data 2019");
    expect(attribution).not.toContain("{YEAR}");
  });

  it("substitutes an opaque Wayback release id, not the snapshot's date", () => {
    const url = source(buildRasterStyle(wayback, at("2019-12-12", "4756"), undefined)).tiles![0]!;
    expect(url).toContain("/MapServer/tile/4756/{z}/{y}/{x}");
    expect(url).not.toContain("{TIME}");
  });

  it("writes a sub-daily Time with seconds, as WMTS expects", () => {
    const url = source(buildRasterStyle(goes, at("2026-11-13T18:20Z", "2026-11-13T18:20:00Z"), undefined)).tiles![0]!;
    expect(url).toContain("/default/2026-11-13T18:20:00Z/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png");
  });

  it("says which year a catalogue credit means instead of showing a raw token", () => {
    expect(describeAttribution(meteosat)).toContain("EUMETSAT</a> [year of the picture]");
    expect(describeAttribution(meteosat)).not.toContain("{YEAR}");
  });

  it("names the picture's year in a credit that must, whatever the precision", () => {
    expect(resolveAttribution(meteosat, at("2026-11-13T18:20Z"))).toContain("EUMETSAT</a> 2026");
  });

  it("substitutes an API key", () => {
    const url = source(buildRasterStyle(mapbox, undefined, "pk.secret")).tiles![0]!;
    expect(url).toContain("access_token=pk.secret");
    expect(url).not.toContain("{KEY}");
  });

  it("leaves the tile placeholders alone for MapLibre to fill", () => {
    const url = source(buildRasterStyle(eox, at("2020"), undefined)).tiles![0]!;
    expect(url).toContain("{z}");
    expect(url).toContain("{x}");
    expect(url).toContain("{y}");
  });
});

describe("wms", () => {
  it("asks GetMap for each tile's own Web Mercator bbox at the declared size", () => {
    const template = wmsTemplate(meteosat);
    expect(template).toContain("request=GetMap");
    expect(template).toContain("layers=mtg_fd:rgb_geocolour");
    expect(template).toContain("crs=EPSG:3857");
    expect(template).toContain("bbox={bbox-epsg-3857}");
    expect(template).toContain(`width=${meteosat.tileSize}&height=${meteosat.tileSize}`);
    expect(template).toContain("time={TIME}");
  });

  it("asks for no time when the Layer has none", () => {
    expect(wmsTemplate({ ...meteosat, time: undefined })).not.toContain("time=");
  });
});

describe("cog and stac", () => {
  it("reads a COG through the cog protocol in 256 px tiles", () => {
    const cog: CogLayer = { ...mosaic, kind: "cog", url: "https://example.org/a.tif", time: undefined };
    const s = source(buildRasterStyle(cog, undefined, undefined));
    expect(s.url).toBe("cog://https://example.org/a.tif");
    expect(s.tileSize).toBe(256);
  });

  it("draws a STAC Time from the COG its item names", () => {
    const s = source(buildRasterStyle(mosaic, at("2026-11-13T19:00Z", "https://example.org/19.tif"), undefined));
    expect(s.url).toBe("cog://https://example.org/19.tif");
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
