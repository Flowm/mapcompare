/**
 * Names of the `VITE_*` vars the registry may require.
 *
 * This is the single source of truth: `src/env.ts` exposes exactly these keys via a
 * `satisfies` clause, so a typo in a Layer descriptor is a compile error rather than a
 * Layer that silently never becomes available.
 */
export type ApiKeyName = "VITE_MAPBOX_TOKEN" | "VITE_MAPTILER_KEY" | "VITE_STADIA_API_KEY" | "VITE_HERE_API_KEY" | "VITE_ARCGIS_API_KEY";

/**
 * Derived from the union rather than written out beside it, because `readonly ApiKeyName[]` is
 * satisfied by a SUBSET. `useApiKeys` iterates this list and nothing else, so a name added to the
 * union and to `env.ts` but missed here produced exactly the failure the comment above says is
 * impossible: a Layer that compiles, ships, and is permanently gated behind a key it can never
 * see. `Record<ApiKeyName, true>` cannot be short.
 */
const API_KEY_NAME_SET: Record<ApiKeyName, true> = {
  VITE_MAPBOX_TOKEN: true,
  VITE_MAPTILER_KEY: true,
  VITE_STADIA_API_KEY: true,
  VITE_HERE_API_KEY: true,
  VITE_ARCGIS_API_KEY: true,
};

export const API_KEY_NAMES: readonly ApiKeyName[] = Object.keys(API_KEY_NAME_SET) as ApiKeyName[];

/**
 * What you are allowed to do with the pixels. Drives the per-pane licence chip.
 *
 * - `open`         CC BY / CC0 / public domain. Reuse freely with the on-map credit.
 * - `licensed`     You are using it under your own provider licence, so follow their terms.
 * - `terms`        Provider terms restrict reuse; intended for use inside their own products.
 * - `metered`      Every tile is billed to your key.
 * - `restricted`   Non-commercial and/or share-alike.
 * - `unknown`      A Layer the user added, whose source states no licence the app can judge.
 */
export type LicenceTier = "open" | "licensed" | "terms" | "metered" | "restricted" | "unknown";

export interface Licence {
  tier: LicenceTier;
  /** One sentence, shown in the chip tooltip and the sources dialog. */
  note: string;
  url: string;
}

/**
 * A logo the provider's terms require ON the map, in addition to the text credit.
 *
 * Two vendors here demand one, and neither is satisfied by the text alone: Mapbox requires their
 * wordmark on every map drawn from their data, and MapTiler requires theirs for free-tier keys.
 * Because MapLibre is not either vendor's own renderer, neither adds it for us — Mapbox says so
 * explicitly about third-party libraries — so it is the app's job.
 *
 * Both forbid altering the artwork, which is what the rest of these fields are for: the asset is
 * served verbatim at its own dimensions, never recoloured, rescaled or given a plate. `width` and
 * `height` are declared rather than measured because an unsized SVG in an `<img>` reflows the pane
 * chrome the moment it loads.
 */
export interface Wordmark {
  /**
   * Path under `public/logos/`. Vendored rather than hotlinked: MapTiler's own snippet points at
   * `api.maptiler.com/resources/logo.svg`, which would put a third-party request on every pane and
   * make the credit fail with the network. The files are those vendors' own artwork, byte for byte.
   */
  src: string;
  /** Where the mark must link. Both vendors name a specific destination for it. */
  href: string;
  /** Alt text, so the credit survives for a screen reader too. */
  alt: string;
  /** The artwork's own pixel dimensions. Mapbox additionally floors theirs at 65x20. */
  width: number;
  height: number;
}

/**
 * The organisation that serves a Layer: who to credit and whose terms apply. The catalogue's
 * group headers and its Provider filter read from here, so one Provider is spelled one way.
 */
export interface Provider {
  label: string;
  /** Absent only for the shared header of Added Layers, which is not an organisation. */
  url?: string;
}

/** Every Provider the catalogue credits, so a misspelt key fails the build rather than the filter. */
export type ProviderId = "versatiles" | "esri" | "eox" | "nasa-gibs" | "eumetsat" | "satvis" | "mapbox" | "maptiler" | "stadia" | "here" | "openfreemap" | "added";

/** What kind of picture a Layer is. See CONTEXT.md: basemap hides when, satellite shows when. */
export type Category = "basemap" | "satellite" | "map";

/** Where the sensor behind a satellite Layer sits. */
export type Orbit = "leo" | "geo";

/**
 * How finely a Layer's Times are told apart, which is also how a Time is written: `2024`,
 * `2025-12-18`, `2026-11-13T19:00Z`.
 */
export type TimePrecision = "year" | "day" | "minute";

export interface TimeValue {
  /** The Time itself, written at the spec's precision. */
  time: string;
  /**
   * What the tile template receives instead of the Time, where the service names its pictures
   * by something else. Wayback's opaque release id is the case: `4756` IS 2019-12-12.
   */
  param?: string;
}

/**
 * A regular series of pictures, described by rule rather than listed.
 *
 * For Layers whose kind can discover its Times this is only the fallback for when the service
 * cannot be asked — and the source of the Layer's Cadence, which must be known before anything
 * has been fetched.
 */
export interface TimeSeries {
  stepMinutes: number;
  /** The first Time with data, at the spec's precision. Absent for a purely rolling archive. */
  earliest?: string;
  /** How far behind the clock the newest picture typically is. */
  latencyMinutes?: number;
  /** A rolling archive keeps only this many days. */
  retentionDays?: number;
}

/** Which of a Layer's pictures exist. Exactly one of `values` and `series`. */
export interface TimeSpec {
  precision: TimePrecision;
  /** Control label: "Vintage", "Snapshot", "Date", "Time". */
  label: string;
  /** Fixed choices, oldest first. Never generated from a range: EOX publishes no 2016. */
  values?: readonly TimeValue[];
  series?: TimeSeries;
}

interface LayerBase {
  /**
   * Stable, URL-safe, dot-namespaced. Appears verbatim in every shared link, so renaming
   * one breaks links already in the wild. Treat it as a public API.
   */
  id: string;
  label: string;
  /** Key into `PROVIDERS`. */
  provider: ProviderId;
  category: Category;
  /** Present exactly when `category` is `satellite`. */
  orbit?: Orbit;
  /** One line for the catalogue: resolution, vintage, quirks. */
  note: string;
  /**
   * Attribution HTML. Required — this is the legal notice. Sanitized before render. `{TIME}`
   * and `{YEAR}` are replaced with the Time shown, for credits that must name it.
   *
   * This is the FLOOR for what the pane credits, not a fallback: a vendor style.json often hides
   * its own credit behind a TileJSON `url`, where nothing in the app can see it. See
   * `creditParts`.
   */
  attribution: string;
  /** Present only where the vendor's terms require their logo on the map as well as the text. */
  wordmark?: Wordmark;
  licence: Licence;
  minzoom: number;
  /**
   * The MEASURED ceiling, established by probing a tile at a known-covered point — not
   * the documented one. VersaTiles' TileJSON claims 19 and 404s above 17, for instance.
   * `pnpm run probe-tiles` re-checks every entry against this value.
   */
  maxzoom: number;
  requiresKey?: ApiKeyName;
  /** Where to get that key. Linked from the disabled picker option. */
  keyUrl?: string;
  /** Free-tier summary, shown on the disabled option. */
  freeTier?: string;
  /** Human coverage note, e.g. "high-res Europe only, ~10 m elsewhere". */
  coverageNote?: string;
  /**
   * Where `probe-tiles` checks a Layer that does not cover the whole Earth — a geostationary disk
   * sees nothing of Tokyo or Amsterdam, which are where global Layers are checked.
   */
  probePoint?: { lat: number; lon: number; name: string };
  /**
   * Built from visible channels, so the night side of every picture is empty. `probe-tiles` then
   * checks it under the sun at the Time it probes, wherever that is, instead of at fixed points.
   */
  daylightOnly?: true;
  /** Capture vintage of a static Layer, where knowable: "2025", "2026-06-30". */
  vintage?: string;
  time?: TimeSpec;
}

/**
 * MapLibre tile templates. `{z}`/`{x}`/`{y}` may appear in ANY order and anywhere in the
 * string, including query parameters — so Esri's `/{z}/{y}/{x}` and WMTS KVP endpoints
 * are both plain templates needing no special case.
 *
 * `{z}/{y}/{x}` is NOT TMS. Reaching for `scheme: "tms"` flips y and silently renders
 * the wrong place; no Layer here needs it.
 *
 * `{KEY}` is replaced with the resolved API key, `{TIME}` with the Time shown (or its `param`).
 */
interface TiledLayer extends LayerBase {
  tiles: readonly string[];
  /**
   * MUST match what the server actually returns. This is the highest-risk field in the
   * registry: getting it wrong does not error, it renders plausible imagery one zoom level
   * off, which in a comparison tool produces confidently wrong conclusions. Verified by
   * reading the pixel dimensions out of a real tile.
   */
  tileSize: 256 | 512;
}

/** A plain tile template. Its Times, if any, are declared. */
export interface XyzLayer extends TiledLayer {
  kind: "xyz";
}

/**
 * A WMTS layer. Tiles come from the declared RESTful template, so the Layer renders even when
 * its capabilities cannot be read; its Times come from the capabilities document, gaps and all.
 */
export interface WmtsLayer extends TiledLayer {
  kind: "wmts";
  capabilities: string;
  /** The layer's identifier inside the capabilities document. */
  layer: string;
  time: TimeSpec;
}

/** A WMS layer, drawn through GetMap with the tile's Web Mercator bbox. */
export interface WmsLayer extends LayerBase {
  kind: "wms";
  /** The service endpoint, without a query string. */
  url: string;
  /** The `layers` parameter, e.g. `mtg_fd:rgb_geocolour`. */
  layers: string;
  /** Where the Times are read from. Defaults to the endpoint's own GetCapabilities. */
  capabilities?: string;
  tileSize: 256 | 512;
}

/** A vendor style.json. */
export interface StyleLayer extends LayerBase {
  kind: "style";
  /** Full style.json URL. `{KEY}` replaced with the resolved API key. */
  styleUrl: string;
}

/** A single Cloud-Optimised GeoTIFF in Web Mercator. */
export interface CogLayer extends LayerBase {
  kind: "cog";
  url: string;
}

/** A STAC collection whose items are Times, each drawn from one COG asset. */
export interface StacLayer extends LayerBase {
  kind: "stac";
  /** The collection document. */
  collection: string;
  /** Which item asset to draw. */
  asset: string;
  time: TimeSpec;
}

export type Layer = XyzLayer | WmtsLayer | WmsLayer | StyleLayer | CogLayer | StacLayer;

/** A Layer plus a chosen Time — what one pane shows, and what the URL encodes. */
export interface PaneLayer {
  layerId: string;
  /** The requested Time. Undefined means the Layer's latest, and is never written as a date. */
  time?: string;
}

/** A PaneLayer with no `time` key at all for "latest", so equality and the URL never see `time: undefined`. */
export function paneLayer(layerId: string, time?: string): PaneLayer {
  return time === undefined ? { layerId } : { layerId, time };
}
