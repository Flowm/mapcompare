import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PROVIDERS } from "./providers";
import { DEFAULT_PANE_LAYERS, getLayer, LABEL_OVERLAY_LAYER_ID, labelOverlayStyleUrl, LAYER_IDS, LAYERS } from "./registry";
import { parseTime } from "./time";
import { API_KEY_NAMES } from "./types";

/**
 * Guard tests. These do not exercise behaviour so much as pin down invariants that are easy
 * to break by hand-editing the catalogue, and that fail silently at runtime if broken.
 */

describe("registry invariants", () => {
  it("has unique ids", () => {
    const ids = LAYERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has URL-safe ids, since they appear verbatim in shared links", () => {
    for (const p of LAYERS) {
      expect(p.id, p.id).toMatch(/^[a-z0-9]+(?:[._][a-z0-9]+)*$/);
      // ":" separates id from Time and "," separates panes in the `p` URL parameter.
      expect(p.id).not.toContain(":");
      expect(p.id).not.toContain(",");
    }
  });

  it("gives every Layer an attribution, since it is the legal notice", () => {
    for (const p of LAYERS) expect(p.attribution.trim(), p.id).not.toBe("");
  });

  it("gives every Layer a licence with a note", () => {
    for (const p of LAYERS) {
      expect(p.licence.note.trim(), p.id).not.toBe("");
      expect(p.licence.tier, p.id).toBeDefined();
    }
  });

  it("gives every Layer a note for the picker", () => {
    for (const p of LAYERS) expect(p.note.trim(), p.id).not.toBe("");
  });

  it("only references declared API key names", () => {
    for (const p of LAYERS) {
      if (p.requiresKey) expect(API_KEY_NAMES, p.id).toContain(p.requiresKey);
    }
  });

  it("pairs every key requirement with a signup URL", () => {
    for (const p of LAYERS) {
      if (p.requiresKey) expect(p.keyUrl, p.id).toBeTruthy();
    }
  });

  it("keeps minzoom below maxzoom", () => {
    for (const p of LAYERS) expect(p.maxzoom, p.id).toBeGreaterThan(p.minzoom);
  });

  it("names a declared Provider for every Layer", () => {
    for (const p of LAYERS) expect(PROVIDERS[p.provider], p.id).toBeDefined();
  });

  it("gives an Orbit to exactly the satellite Layers", () => {
    for (const p of LAYERS) expect(p.orbit !== undefined, p.id).toBe(p.category === "satellite");
  });
});

describe("required wordmarks", () => {
  const withWordmark = LAYERS.filter((p) => p.wordmark);

  it("belongs to exactly the two vendors whose terms demand a logo", () => {
    // Pinned rather than counted: adding one where it is not required puts another vendor's
    // trademark on the map for no reason, and dropping one is a licence breach.
    expect(withWordmark.map((p) => p.id).toSorted()).toStrictEqual(["mapbox.satellite", "maptiler.satellite"]);
  });

  it("points at an asset that is actually in public/, since a broken image credits nobody", () => {
    // Resolved with fileURLToPath rather than `new URL(..., import.meta.url)`: Vite rewrites that
    // pattern into an inlined data URI at transform time, so the check would silently pass on a
    // string instead of touching the disk.
    const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../../public");
    for (const p of withWordmark) {
      expect(p.wordmark!.src, p.id).toMatch(/^\/logos\/[a-z0-9-]+\.svg$/);
      expect(existsSync(join(publicDir, p.wordmark!.src)), p.wordmark!.src).toBe(true);
    }
  });

  it("links each mark to the destination its vendor names, over https", () => {
    for (const p of withWordmark) expect(p.wordmark!.href, p.id).toMatch(/^https:\/\//);
    expect(getLayer("mapbox.satellite")?.wordmark?.href).toBe("https://www.mapbox.com/");
    expect(getLayer("maptiler.satellite")?.wordmark?.href).toBe("https://www.maptiler.com/");
  });

  it("declares the artwork's own size, and never below Mapbox's documented floor", () => {
    // The dimensions are what stop the browser from guessing, and stop us from rescaling artwork
    // both licences say may not be altered.
    for (const p of withWordmark) {
      expect(p.wordmark!.width, p.id).toBeGreaterThanOrEqual(65);
      expect(p.wordmark!.height, p.id).toBeGreaterThanOrEqual(20);
      expect(p.wordmark!.alt.trim(), p.id).not.toBe("");
    }
  });
});

describe("credits with wording the vendor dictates", () => {
  it("carries all three links Mapbox's attribution snippet requires", () => {
    const attribution = getLayer("mapbox.satellite")!.attribution;
    // The feedback link is as mandatory as the copyright lines, and is the one easily forgotten.
    expect(attribution).toContain("https://apps.mapbox.com/feedback/");
    expect(attribution).toContain("Improve this map");
    expect(attribution).toContain("mapbox.com/about/maps");
    expect(attribution).toContain("openstreetmap.org/copyright");
  });

  it("credits MapTiler in its own descriptor, which is the only place that credit can come from", () => {
    // MapTiler's style.json declares TileJSON `url` sources, so nothing in the fetched document
    // reaches the attribution control. Without this string the pane shows no credit whatsoever.
    const attribution = getLayer("maptiler.satellite")!.attribution;
    expect(attribution).toContain("maptiler.com/copyright");
    expect(attribution).toContain("openstreetmap.org/copyright");
  });
});

describe("tiled Layers", () => {
  const tiled = LAYERS.flatMap((p) => (p.kind === "xyz" || p.kind === "wmts" ? [p] : []));

  it("has every tile placeholder in every template", () => {
    for (const p of tiled) {
      for (const t of p.tiles) {
        expect(t, p.id).toContain("{z}");
        expect(t, p.id).toContain("{x}");
        expect(t, p.id).toContain("{y}");
      }
    }
  });

  it("uses absolute https templates", () => {
    for (const p of tiled) {
      for (const t of p.tiles) expect(t, p.id).toMatch(/^https:\/\//);
    }
  });

  it("declares 512 px tiles for exactly the retina and webp sources", () => {
    // Verified by reading pixel dimensions out of real tiles. A wrong value here renders
    // plausible imagery a whole zoom level off, so it is pinned rather than trusted.
    const large = tiled.filter((p) => p.tileSize === 512).map((p) => p.id);
    expect(large.toSorted()).toEqual(["here.satellite", "mapbox.satellite", "stadia.alidade_satellite", "versatiles.satellite"]);
  });

  it("puts {KEY} in the template of every keyed tiled Layer, and nowhere else", () => {
    for (const p of tiled) {
      const hasPlaceholder = p.tiles.some((t) => t.includes("{KEY}"));
      expect(hasPlaceholder, p.id).toBe(Boolean(p.requiresKey));
    }
  });

  it("puts {TIME} in the template of exactly the time-aware Layers", () => {
    for (const p of tiled)
      expect(
        p.tiles.every((t) => t.includes("{TIME}")),
        p.id,
      ).toBe(Boolean(p.time));
  });
});

describe("style Layers", () => {
  const styles = LAYERS.flatMap((p) => (p.kind === "style" ? [p] : []));

  it("uses absolute https style URLs", () => {
    for (const p of styles) expect(p.styleUrl, p.id).toMatch(/^https:\/\//);
  });

  it("puts {KEY} in the style URL of every keyed style Layer, and nowhere else", () => {
    for (const p of styles) {
      expect(p.styleUrl.includes("{KEY}"), p.id).toBe(Boolean(p.requiresKey));
    }
  });
});

describe("time specs", () => {
  const timed = LAYERS.flatMap((p) => (p.time ? [{ id: p.id, kind: p.kind, spec: p.time }] : []));

  it("declares exactly one of a list and a series", () => {
    for (const { id, spec } of timed) expect(Boolean(spec.values) !== Boolean(spec.series), id).toBe(true);
  });

  it("gives a list at least two Times, since one is not a choice", () => {
    for (const { id, spec } of timed) if (spec.values) expect(spec.values.length, id).toBeGreaterThan(1);
  });

  it("writes every listed Time at its precision and keeps them in order, because 'latest' is the last", () => {
    const shapes = { year: /^\d{4}$/, day: /^\d{4}-\d{2}-\d{2}$/, minute: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/ };
    for (const { id, spec } of timed) {
      if (!spec.values) continue;
      const times = spec.values.map((v) => v.time);
      for (const t of times) {
        expect(t, id).toMatch(shapes[spec.precision]);
        expect(parseTime(t), `${id} ${t}`).toBeDefined();
      }
      expect(times, id).toStrictEqual(times.toSorted());
    }
  });

  it("bounds every series by a readable start or a retention window", () => {
    for (const { id, spec } of timed) {
      if (!spec.series) continue;
      expect(spec.series.stepMinutes, id).toBeGreaterThan(0);
      if (spec.series.earliest !== undefined) expect(parseTime(spec.series.earliest), id).toBeDefined();
      else expect(spec.series.retentionDays, id).toBeGreaterThan(0);
    }
  });

  it("gives every discovering Layer a series, which is where its Cadence comes from", () => {
    for (const { id, kind, spec } of timed) if (kind === "wmts" || kind === "wms" || kind === "stac") expect(spec.series, id).toBeDefined();
  });

  it("keeps Wayback's release ids unique, since an old link names one", () => {
    const params = getLayer("esri.wayback")!.time!.values!.map((v) => v.param);
    expect(new Set(params).size).toBe(params.length);
    expect(params.every((p) => p !== undefined && /^\d+$/.test(p))).toBe(true);
  });
});

describe("lookups", () => {
  it("LAYER_IDS matches LAYERS", () => {
    expect(LAYER_IDS.size).toBe(LAYERS.length);
    for (const p of LAYERS) expect(LAYER_IDS.has(p.id)).toBe(true);
  });

  it("getLayer finds by id and returns undefined otherwise", () => {
    expect(getLayer("esri.imagery")?.label).toBe("Esri World Imagery");
    expect(getLayer("nope.nope")).toBeUndefined();
  });
});

describe("default pane layers", () => {
  it("names four real Layers, so growing to 4 panes never needs a fallback", () => {
    expect(DEFAULT_PANE_LAYERS).toHaveLength(4);
    for (const layer of DEFAULT_PANE_LAYERS) {
      expect(getLayer(layer.layerId), layer.layerId).toBeDefined();
    }
  });

  it("uses keyless Layers for the first two panes", () => {
    // A fresh clone with no .env must render a real comparison on first paint.
    for (const layer of DEFAULT_PANE_LAYERS.slice(0, 2)) {
      expect(getLayer(layer.layerId)?.requiresKey, layer.layerId).toBeUndefined();
    }
  });

  it("covers the default zoom of 16 with both opening panes", () => {
    // Amsterdam z16 must sit inside both measured ceilings or the app opens on a blurry pane.
    for (const layer of DEFAULT_PANE_LAYERS.slice(0, 2)) {
      expect(getLayer(layer.layerId)!.maxzoom, layer.layerId).toBeGreaterThanOrEqual(16);
    }
  });
});

describe("the label overlay source", () => {
  it("exists as a style Layer, which is what api/styles.ts derives its URL from", () => {
    const layer = getLayer(LABEL_OVERLAY_LAYER_ID);
    expect(layer, LABEL_OVERLAY_LAYER_ID).toBeDefined();
    expect(layer?.kind).toBe("style");
    expect(labelOverlayStyleUrl()).toBe(layer?.kind === "style" ? layer.styleUrl : undefined);
  });

  it("is reachable as a Layer in its own right, so the two share one cached fetch", () => {
    // If this entry were ever removed but the overlay kept, turning labels on would fetch a
    // document no pane can show, and the suppression that stops double labels would never match.
    expect(LAYER_IDS.has(LABEL_OVERLAY_LAYER_ID)).toBe(true);
  });
});

describe("API_KEY_NAMES", () => {
  it("lists every key the Layers actually require", () => {
    const required = new Set(LAYERS.flatMap((p) => (p.requiresKey ? [p.requiresKey] : [])));
    for (const name of required) expect(API_KEY_NAMES, name).toContain(name);
  });

  it("is exhaustive over ApiKeyName, not merely a subset of it", () => {
    // `readonly ApiKeyName[]` is satisfied by a short list, so the guard is the derivation itself:
    // API_KEY_NAMES comes from a Record<ApiKeyName, true>, which cannot omit a member. This pins
    // the count so a name added to the union without the record is caught here too.
    expect(API_KEY_NAMES).toHaveLength(5);
    expect(new Set(API_KEY_NAMES).size).toBe(API_KEY_NAMES.length);
  });
});
