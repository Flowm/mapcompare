import { describe, expect, it } from "vitest";

import { groupLayers, hasKey, layerStatus, layerStatuses, matchesFilter, NO_FILTER } from "./availability";
import { getLayer, LAYERS } from "./registry";

const mapbox = getLayer("mapbox.satellite")!;
const esri = getLayer("esri.imagery")!;

describe("hasKey", () => {
  it("treats a real value as set", () => {
    expect(hasKey("pk.abc123")).toBe(true);
  });

  it("treats an unset or blank value as unset", () => {
    // `VITE_MAPBOX_TOKEN=` with nothing after it yields "", not undefined.
    expect(hasKey(undefined)).toBe(false);
    expect(hasKey("")).toBe(false);
    expect(hasKey("   ")).toBe(false);
    expect(hasKey("\n\t")).toBe(false);
  });
});

describe("layerStatus", () => {
  it("enables a keyless Layer regardless of keys", () => {
    expect(layerStatus(esri, {}).enabled).toBe(true);
    expect(layerStatus(esri, { VITE_MAPBOX_TOKEN: "x" }).enabled).toBe(true);
  });

  it("enables a keyed Layer once its key is present", () => {
    const status = layerStatus(mapbox, { VITE_MAPBOX_TOKEN: "pk.abc" });
    expect(status.enabled).toBe(true);
    expect(status.disabled).toBeUndefined();
  });

  it("disables a keyed Layer when its key is missing", () => {
    const status = layerStatus(mapbox, {});
    expect(status.enabled).toBe(false);
    expect(status.disabled?.code).toBe("missing-key");
  });

  it("disables a keyed Layer when its key is blank", () => {
    expect(layerStatus(mapbox, { VITE_MAPBOX_TOKEN: "  " }).enabled).toBe(false);
  });

  it("ignores an unrelated key", () => {
    expect(layerStatus(mapbox, { VITE_MAPTILER_KEY: "abc" }).enabled).toBe(false);
  });

  it("names the provider in the visible reason, and the env var for the dialog it opens", () => {
    const { disabled } = layerStatus(mapbox, {});
    expect(disabled?.message).toContain("API key from Mapbox");
    expect(disabled?.key).toBe("VITE_MAPBOX_TOKEN");
  });

  it("carries the signup URL and free tier through for the disabled option", () => {
    const { disabled } = layerStatus(mapbox, {});
    expect(disabled?.keyUrl).toContain("mapbox.com");
    expect(disabled?.freeTier).toBeTruthy();
  });
});

describe("layerStatuses", () => {
  it("preserves registry order", () => {
    const ids = layerStatuses(LAYERS, {}).map((s) => s.layer.id);
    expect(ids).toStrictEqual(LAYERS.map((p) => p.id));
  });
});

describe("groupLayers", () => {
  const byProvider = groupLayers(layerStatuses(LAYERS, {}), "provider");
  const byCategory = groupLayers(layerStatuses(LAYERS, {}), "category");

  it("covers every Layer exactly once, whichever way it groups", () => {
    expect(byProvider.flatMap((g) => g.entries)).toHaveLength(LAYERS.length);
    expect(byCategory.flatMap((g) => g.entries)).toHaveLength(LAYERS.length);
  });

  it("gives each Provider a single group, headed by its label", () => {
    const keys = byProvider.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(byProvider.find((g) => g.key === "nasa-gibs")?.label).toBe("NASA GIBS");
  });

  it("groups by Category into basemaps, satellite and maps", () => {
    expect(byCategory.map((g) => g.label).toSorted()).toStrictEqual(["Basemaps", "Maps", "Satellite"]);
  });

  it("keeps disabled entries in place rather than hiding or sinking them", () => {
    // Discovery is most of the point of the app: an unavailable Layer still teaches
    // the user that it exists and what it would cost.
    const mapboxGroup = byProvider.find((g) => g.key === "mapbox");
    expect(mapboxGroup?.entries.some((e) => e.layer.id === "mapbox.satellite" && !e.enabled)).toBe(true);
  });

  it("orders groups by first appearance in the registry", () => {
    expect(byProvider[0]?.key).toBe(LAYERS[0]!.provider);
    expect(byCategory[0]?.key).toBe(LAYERS[0]!.category);
  });
});

describe("matchesFilter", () => {
  const goes = getLayer("gibs.goes.east")!;
  const viirs = getLayer("gibs.viirs.noaa20")!;

  it("lets everything through when nothing is chosen", () => {
    for (const layer of LAYERS) expect(matchesFilter(layer, NO_FILTER), layer.id).toBe(true);
  });

  it("treats values within a facet as alternatives", () => {
    const filter = { ...NO_FILTER, categories: ["basemap", "satellite"] as const };
    expect(matchesFilter(esri, filter)).toBe(true);
    expect(matchesFilter(goes, filter)).toBe(true);
    expect(matchesFilter(getLayer("openfreemap.liberty")!, filter)).toBe(false);
  });

  it("requires every chosen facet to match", () => {
    const filter = { ...NO_FILTER, categories: ["satellite"] as const, orbits: ["geo"] as const };
    expect(matchesFilter(goes, filter)).toBe(true);
    expect(matchesFilter(viirs, filter)).toBe(false);
  });

  it("never lets a Layer without an Orbit through an Orbit filter", () => {
    expect(matchesFilter(esri, { ...NO_FILTER, orbits: ["leo"] })).toBe(false);
  });

  it("filters by Cadence derived from Time, not from anything written by hand", () => {
    expect(matchesFilter(goes, { ...NO_FILTER, cadences: ["sub-daily"] })).toBe(true);
    expect(matchesFilter(viirs, { ...NO_FILTER, cadences: ["daily"] })).toBe(true);
    expect(matchesFilter(getLayer("eox.s2cloudless")!, { ...NO_FILTER, cadences: ["yearly"] })).toBe(true);
    expect(matchesFilter(getLayer("esri.wayback")!, { ...NO_FILTER, cadences: ["yearly"] })).toBe(true);
    expect(matchesFilter(esri, { ...NO_FILTER, cadences: ["static"] })).toBe(true);
  });

  it("matches free text against the Provider's label too", () => {
    expect(matchesFilter(goes, { ...NO_FILTER, text: "nasa" })).toBe(true);
    expect(matchesFilter(goes, { ...NO_FILTER, text: "eumetsat" })).toBe(false);
  });
});
