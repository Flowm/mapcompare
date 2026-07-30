import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

import { type ApiKeys, hasKey } from "./availability";
import type { ApiKeyName, Provider, RasterProvider, StyleProvider } from "./types";

/**
 * Turns a provider descriptor plus a resolved variant into something MapLibre can load.
 *
 * Pure. Keys arrive as a parameter, never from `import.meta.env`.
 */

export const BASEMAP_SOURCE_ID = "basemap";
export const BASEMAP_LAYER_ID = "basemap";

export interface BuildOptions {
  /**
   * `linear` smooths overzoomed imagery into something that looks like detail it does not
   * have. `nearest` shows the real pixel grid, which is what you want when judging whether
   * a difference between two panes is genuine.
   */
  resampling?: "linear" | "nearest";
}

export type StyleResult = { ok: true; style: StyleSpecification } | { ok: true; needsFetch: true; url: string } | { ok: false; reason: "missing-key"; key: ApiKeyName };

/** Substitutes `{KEY}` and the variant token. */
function fill(template: string, key: string | undefined, token: string | undefined, variant: string | undefined): string {
  let out = template;
  if (key !== undefined) out = out.replaceAll("{KEY}", key);
  if (token && variant !== undefined) out = out.replaceAll(token, variant);
  return out;
}

/**
 * The attribution is filled too, not just the tile URL: EOX require their credit to name the
 * composite year, so `{YEAR}` appears in both.
 */
export function resolveAttribution(provider: Provider, variant: string | undefined): string {
  return fill(provider.attribution, undefined, provider.variant?.token, variant);
}

export function buildRasterStyle(provider: RasterProvider, variant: string | undefined, key: string | undefined, options: BuildOptions = {}): StyleSpecification {
  const token = provider.variant?.token;
  const layer: LayerSpecification = {
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
    // Named sprite/glyph endpoints are omitted: a raster basemap has no symbols. The label
    // overlay supplies both when it is switched on.
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: "raster",
        tiles: provider.tiles.map((t) => fill(t, key, token, variant)),
        tileSize: provider.tileSize,
        minzoom: provider.minzoom,
        maxzoom: provider.maxzoom,
        // Set explicitly rather than letting MapLibre fetch a TileJSON. Two reasons: a
        // `url:` source costs an extra request per pane, and VersaTiles' TileJSON declares
        // a RELATIVE tiles array plus a maxzoom that is wrong by two levels.
        attribution: resolveAttribution(provider, variant),
      },
    },
    layers: [layer],
  };
}

export function resolveStyleUrl(provider: StyleProvider, key: string | undefined): string {
  return fill(provider.styleUrl, key, undefined, undefined);
}

/**
 * Resolves a pane's layer choice.
 *
 * Raster providers are fully resolved here. Style providers cannot be, because their JSON has
 * to be fetched before the label overlay can be merged into it — so they come back as
 * `needsFetch` and `api/styles.ts` completes the job.
 */
export function buildStyle(provider: Provider, variant: string | undefined, keys: ApiKeys, options: BuildOptions = {}): StyleResult {
  const required = provider.requiresKey;
  const key = required ? keys[required] : undefined;
  if (required && !hasKey(key)) return { ok: false, reason: "missing-key", key: required };

  if (provider.kind === "style") return { ok: true, needsFetch: true, url: resolveStyleUrl(provider, key) };
  return { ok: true, style: buildRasterStyle(provider, variant, key, options) };
}
