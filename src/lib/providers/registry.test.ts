import { describe, expect, it } from "vitest";

import { DEFAULT_PANE_LAYERS, getProvider, PROVIDER_IDS, PROVIDERS } from "./registry";
import { API_KEY_NAMES } from "./types";

/**
 * Guard tests. These do not exercise behaviour so much as pin down invariants that are easy
 * to break by hand-editing the catalogue, and that fail silently at runtime if broken.
 */

describe("registry invariants", () => {
  it("has unique ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has URL-safe ids, since they appear verbatim in shared links", () => {
    for (const p of PROVIDERS) {
      expect(p.id, p.id).toMatch(/^[a-z0-9]+(?:[._][a-z0-9]+)*$/);
      // ":" separates id from variant and "," separates panes in the `p` URL parameter.
      expect(p.id).not.toContain(":");
      expect(p.id).not.toContain(",");
    }
  });

  it("gives every provider an attribution, since it is the legal notice", () => {
    for (const p of PROVIDERS) expect(p.attribution.trim(), p.id).not.toBe("");
  });

  it("gives every provider a licence with a note", () => {
    for (const p of PROVIDERS) {
      expect(p.licence.note.trim(), p.id).not.toBe("");
      expect(p.licence.tier, p.id).toBeDefined();
    }
  });

  it("gives every provider a note for the picker", () => {
    for (const p of PROVIDERS) expect(p.note.trim(), p.id).not.toBe("");
  });

  it("only references declared API key names", () => {
    for (const p of PROVIDERS) {
      if (p.requiresKey) expect(API_KEY_NAMES, p.id).toContain(p.requiresKey);
    }
  });

  it("pairs every key requirement with a signup URL", () => {
    for (const p of PROVIDERS) {
      if (p.requiresKey) expect(p.keyUrl, p.id).toBeTruthy();
    }
  });

  it("keeps minzoom below maxzoom", () => {
    for (const p of PROVIDERS) expect(p.maxzoom, p.id).toBeGreaterThan(p.minzoom);
  });
});

describe("raster providers", () => {
  const rasters = PROVIDERS.filter((p) => p.kind === "raster");

  it("has every tile placeholder in every template", () => {
    for (const p of rasters) {
      for (const t of p.tiles) {
        expect(t, p.id).toContain("{z}");
        expect(t, p.id).toContain("{x}");
        expect(t, p.id).toContain("{y}");
      }
    }
  });

  it("uses absolute https templates", () => {
    for (const p of rasters) {
      for (const t of p.tiles) expect(t, p.id).toMatch(/^https:\/\//);
    }
  });

  it("declares 512 px tiles for exactly the retina and webp sources", () => {
    // Verified by reading pixel dimensions out of real tiles. A wrong value here renders
    // plausible imagery a whole zoom level off, so it is pinned rather than trusted.
    const large = rasters.filter((p) => p.tileSize === 512).map((p) => p.id);
    expect(large.toSorted()).toEqual(["here.satellite", "mapbox.satellite", "stadia.alidade_satellite", "versatiles.satellite"]);
  });

  it("puts {KEY} in the template of every keyed raster provider, and nowhere else", () => {
    for (const p of rasters) {
      const hasPlaceholder = p.tiles.some((t) => t.includes("{KEY}"));
      expect(hasPlaceholder, p.id).toBe(Boolean(p.requiresKey));
    }
  });

  it("puts the variant token in the template of every parameterised provider", () => {
    for (const p of rasters) {
      if (!p.variant) continue;
      expect(
        p.tiles.some((t) => t.includes(p.variant!.token)),
        p.id,
      ).toBe(true);
    }
  });
});

describe("style providers", () => {
  const styles = PROVIDERS.filter((p) => p.kind === "style");

  it("uses absolute https style URLs", () => {
    for (const p of styles) expect(p.styleUrl, p.id).toMatch(/^https:\/\//);
  });

  it("puts {KEY} in the style URL of every keyed style provider, and nowhere else", () => {
    for (const p of styles) {
      expect(p.styleUrl.includes("{KEY}"), p.id).toBe(Boolean(p.requiresKey));
    }
  });
});

describe("variant specs", () => {
  it("gives fixed-list variants at least two values, since one value is not a choice", () => {
    for (const p of PROVIDERS) {
      if (!p.variant || p.variant.kind === "date") continue;
      expect(p.variant.values?.length ?? 0, p.id).toBeGreaterThan(1);
    }
  });

  it("keeps fixed-list values in chronological order, because 'latest' takes the last", () => {
    for (const p of PROVIDERS) {
      const values = p.variant?.values;
      if (!values) continue;
      const labels = values.map((v) => v.label);
      expect(labels, p.id).toStrictEqual(labels.toSorted());
    }
  });

  it("gives date variants an earliest bound", () => {
    for (const p of PROVIDERS) {
      if (p.variant?.kind !== "date") continue;
      expect(p.variant.earliest, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("resolves a non-'latest' default to one of the declared values", () => {
    for (const p of PROVIDERS) {
      const spec = p.variant;
      if (!spec || spec.default === "latest" || spec.kind === "date") continue;
      expect(
        spec.values?.map((v) => v.value),
        p.id,
      ).toContain(spec.default);
    }
  });
});

describe("lookups", () => {
  it("PROVIDER_IDS matches PROVIDERS", () => {
    expect(PROVIDER_IDS.size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) expect(PROVIDER_IDS.has(p.id)).toBe(true);
  });

  it("getProvider finds by id and returns undefined otherwise", () => {
    expect(getProvider("esri.imagery")?.label).toBe("Esri World Imagery");
    expect(getProvider("nope.nope")).toBeUndefined();
  });
});

describe("default pane layers", () => {
  it("names four real providers, so growing to 4 panes never needs a fallback", () => {
    expect(DEFAULT_PANE_LAYERS).toHaveLength(4);
    for (const layer of DEFAULT_PANE_LAYERS) {
      expect(getProvider(layer.providerId), layer.providerId).toBeDefined();
    }
  });

  it("uses keyless providers for the first two panes", () => {
    // A fresh clone with no .env must render a real comparison on first paint.
    for (const layer of DEFAULT_PANE_LAYERS.slice(0, 2)) {
      expect(getProvider(layer.providerId)?.requiresKey, layer.providerId).toBeUndefined();
    }
  });

  it("covers the default zoom of 16 with both opening panes", () => {
    // Amsterdam z16 must sit inside both measured ceilings or the app opens on a blurry pane.
    for (const layer of DEFAULT_PANE_LAYERS.slice(0, 2)) {
      expect(getProvider(layer.providerId)!.maxzoom, layer.providerId).toBeGreaterThanOrEqual(16);
    }
  });
});
