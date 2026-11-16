import type { CogLayer, Layer, ProviderId, StacLayer, TimePrecision, XyzLayer } from "./types";

/**
 * Added Layers: what the app knows about a Layer the user brought in by URL, wherever it came from.
 *
 * An Added Layer is an ordinary Layer of one of the kinds the registry already draws — `stac`,
 * `cog` or `xyz` — so nothing downstream of the catalogue knows it was not shipped. What it cannot
 * have is what the registry's entries were measured for: its `maxzoom` is the COG's own deepest
 * level or a guess the user can correct, and its licence is whatever its source states.
 *
 * This module is the core both sides share. `addedInspect.ts` turns a URL into Added Layers, and
 * `addedCodec.ts` reads them back from storage and links. See CONTEXT.md and docs/adr/0005.
 */

export type AddedLayer = StacLayer | CogLayer | XyzLayer;

export const ADDED_PROVIDER: ProviderId = "added";
const ADDED_ID_PREFIX = "added.";

/**
 * What an Added Layer may hold. The dialog's inputs and the codec's checks read the same numbers, so
 * nothing the form accepts can be rejected on the next reload.
 */
export const ADDED_LIMITS = {
  /** A Layer's name, as the catalogue and a pane's picker show it. */
  label: 120,
  /** Any other text: a note, a credit, a URL. Generous for any real source, and a bound on what a crafted link can put on screen. */
  text: 2000,
  minZoom: 1,
  maxZoom: 24,
} as const;

export function isAddedLayer(layer: Layer): layer is AddedLayer {
  return layer.id.startsWith(ADDED_ID_PREFIX);
}

/**
 * Stable for the same source, so adding a Layer twice replaces it rather than listing it twice.
 * FNV-1a: no crypto needed, the id only has to be short, URL-safe and stable.
 */
export function addedLayerId(...parts: string[]): string {
  let hash = 0x811c9dc5;
  for (const char of parts.join("\n")) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${ADDED_ID_PREFIX}${hash.toString(36)}`;
}

/** A tile template has all three placeholders, in any order. */
export function isTileTemplate(url: string): boolean {
  return url.includes("{z}") && url.includes("{x}") && url.includes("{y}");
}

/**
 * Only http and https are ever fetched or linked. A Layer from a shared link is written by whoever
 * wrote the link, and its URLs end up as `href`s: a `javascript:` one would run on click.
 */
export function isHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** How a Time control names a Layer's Times, by how finely they are told apart. */
export const TIME_LABELS: Record<TimePrecision, string> = { minute: "Time", day: "Date", year: "Year" };

// ----------------------------------------------------------------------------- where it is

export type Bbox = [west: number, south: number, east: number, north: number];

/** Whether a bbox covers so little of the Earth that a camera elsewhere would see nothing. */
export function isRegional(bbox: Bbox | undefined): bbox is Bbox {
  return bbox !== undefined && bbox[2] - bbox[0] < 180 && bbox[3] - bbox[1] < 90;
}

/**
 * Where to send the camera so a regional Layer roughly fills a pane: its centre, at the zoom where
 * its wider side spans the screen, never past the Layer's own ceiling. Latitude counts double, as a
 * rough allowance for a pane being wider than it is tall.
 */
export function framing(bbox: Bbox, ceiling: number): { center: [number, number]; zoom: number } {
  const [west, south, east, north] = bbox;
  const span = Math.max(east - west, (north - south) * 2, 1e-6);
  return { center: [(west + east) / 2, (south + north) / 2], zoom: Math.max(1, Math.min(ceiling, Math.log2(360 / span) + 1)) };
}
