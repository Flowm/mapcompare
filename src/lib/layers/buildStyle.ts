import type { LayerSpecification, RasterSourceSpecification, StyleSpecification } from "maplibre-gl";

import { type ApiKeys, hasKey } from "./availability";
import { wmsTemplate } from "./discovery";
import type { ResolvedTime } from "./time";
import type { ApiKeyName, Layer, StyleLayer } from "./types";

/**
 * Turns a Layer plus a resolved Time into something MapLibre can load.
 *
 * Pure. Keys arrive as a parameter, never from `import.meta.env`. The kind decides how pixels
 * arrive and nothing else: no Provider is special-cased here.
 */

export const BASEMAP_SOURCE_ID = "basemap";
export const BASEMAP_LAYER_ID = "basemap";

/** The URL scheme `maplibreProtocols.ts` registers for Cloud-Optimised GeoTIFFs. */
export const COG_PROTOCOL = "cog";

export interface BuildOptions {
  /**
   * `linear` smooths overzoomed imagery into something that looks like detail it does not
   * have. `nearest` shows the real pixel grid, which is what you want when judging whether
   * a difference between two panes is genuine.
   */
  resampling?: "linear" | "nearest";
}

export type StyleResult = { ok: true; style: StyleSpecification } | { ok: true; needsFetch: true; url: string } | { ok: false; reason: "missing-key"; key: ApiKeyName };

/** Substitutes `{KEY}`, `{TIME}` and `{YEAR}`. */
function fill(template: string, key: string | undefined, time: ResolvedTime | undefined): string {
  let out = template;
  if (key !== undefined) out = out.replaceAll("{KEY}", key);
  if (time) out = out.replaceAll("{TIME}", time.value).replaceAll("{YEAR}", time.year);
  return out;
}

/**
 * The attribution is filled too, not just the tile URL: EOX and EUMETSAT require their credit to
 * name the year of the picture.
 */
export function resolveAttribution(layer: Layer, time: ResolvedTime | undefined): string {
  return fill(layer.attribution, undefined, time);
}

/**
 * The credit as a catalogue shows it, where no picture has been chosen: the year a credit must
 * name is said to be the picture's, rather than left as a raw `{YEAR}` token.
 */
export function describeAttribution(layer: Layer): string {
  return layer.attribution.replaceAll("{YEAR}", "[year of the picture]").replaceAll("{TIME}", "[time of the picture]");
}

function rasterSource(layer: Exclude<Layer, StyleLayer>, time: ResolvedTime | undefined, key: string | undefined): RasterSourceSpecification {
  const common = {
    type: "raster" as const,
    minzoom: layer.minzoom,
    maxzoom: layer.maxzoom,
    // Set explicitly rather than letting MapLibre fetch a TileJSON. Two reasons: a
    // `url:` source costs an extra request per pane, and VersaTiles' TileJSON declares
    // a RELATIVE tiles array plus a maxzoom that is wrong by two levels.
    attribution: resolveAttribution(layer, time),
  };

  switch (layer.kind) {
    case "xyz":
    case "wmts":
      return { ...common, tiles: layer.tiles.map((t) => fill(t, key, time)), tileSize: layer.tileSize };
    case "wms":
      return { ...common, tiles: [fill(wmsTemplate(layer), key, time)], tileSize: layer.tileSize };
    case "cog":
      // The protocol decodes into 256 px tiles, whatever the file's own tiling.
      return { ...common, url: `${COG_PROTOCOL}://${layer.url}`, tileSize: 256 };
    case "stac":
      // A STAC Time's value is its COG's URL, so the item is drawn exactly as a `cog` Layer.
      return { ...common, url: `${COG_PROTOCOL}://${time?.value ?? ""}`, tileSize: 256 };
  }
}

export function buildRasterStyle(layer: Exclude<Layer, StyleLayer>, time: ResolvedTime | undefined, key: string | undefined, options: BuildOptions = {}): StyleSpecification {
  const raster: LayerSpecification = {
    id: BASEMAP_LAYER_ID,
    type: "raster",
    source: BASEMAP_SOURCE_ID,
    paint: {
      // MapLibre's default is 300 ms. A cross-fade between tile zooms actively lies in a
      // comparison tool: it shows a blend of two resolutions while the user is judging one.
      "raster-fade-duration": 0,
      "raster-resampling": options.resampling ?? "linear",
    },
  };

  return {
    version: 8,
    // Named sprite/glyph endpoints are omitted: a raster Layer has no symbols. The label
    // overlay supplies both when it is switched on.
    sources: { [BASEMAP_SOURCE_ID]: rasterSource(layer, time, key) },
    layers: [raster],
  };
}

export function resolveStyleUrl(layer: StyleLayer, key: string | undefined): string {
  return fill(layer.styleUrl, key, undefined);
}

/**
 * Resolves a pane's Layer.
 *
 * Raster kinds are fully resolved here. Style Layers cannot be, because their JSON has to be
 * fetched before the label overlay can be merged into it — so they come back as `needsFetch` and
 * `api/styles.ts` completes the job.
 */
export function buildStyle(layer: Layer, time: ResolvedTime | undefined, keys: ApiKeys, options: BuildOptions = {}): StyleResult {
  const required = layer.requiresKey;
  const key = required ? keys[required] : undefined;
  if (required && !hasKey(key)) return { ok: false, reason: "missing-key", key: required };

  if (layer.kind === "style") return { ok: true, needsFetch: true, url: resolveStyleUrl(layer, key) };
  return { ok: true, style: buildRasterStyle(layer, time, key, options) };
}
