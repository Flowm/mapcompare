/**
 * Names of the `VITE_*` vars the registry may require.
 *
 * This is the single source of truth: `src/env.ts` exposes exactly these keys via a
 * `satisfies` clause, so a typo in a provider descriptor is a compile error rather than a
 * provider that silently never becomes available.
 */
export type ApiKeyName = "VITE_MAPBOX_TOKEN" | "VITE_MAPTILER_KEY" | "VITE_STADIA_API_KEY" | "VITE_HERE_API_KEY" | "VITE_ARCGIS_API_KEY";

/**
 * Derived from the union rather than written out beside it, because `readonly ApiKeyName[]` is
 * satisfied by a SUBSET. `useApiKeys` iterates this list and nothing else, so a name added to the
 * union and to `env.ts` but missed here produced exactly the failure the comment above says is
 * impossible: a provider that compiles, ships, and is permanently gated behind a key it can never
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
 */
export type LicenceTier = "open" | "licensed" | "terms" | "metered" | "restricted";

export interface Licence {
  tier: LicenceTier;
  /** One sentence, shown in the chip tooltip and the sources dialog. */
  note: string;
  url: string;
}

/**
 * A parameter that turns one provider into a family of comparable layers.
 *
 * Values are always an explicit list, never generated from a range: EOX publishes no
 * 2016 layer and Wayback release ids are opaque integers, so a range would emit 404s.
 */
export interface VariantSpec {
  kind: "year" | "date" | "release";
  /** Placeholder in the tile template, e.g. `{YEAR}`. */
  token: string;
  /** Fixed choices. Absent only for `kind: "date"`, which is resolved from the clock. */
  values?: readonly VariantValue[];
  /** For `kind: "date"`: the earliest date with data. The latest is always yesterday UTC. */
  earliest?: string;
  /** Used when the URL names no variant. `"latest"` resolves to the last value / yesterday. */
  default: string | "latest";
  /** Picker label, e.g. "Vintage". */
  label: string;
}

export interface VariantValue {
  /** Substituted into `token`. For Wayback this is the opaque release id. */
  value: string;
  /** Shown in the picker. For Wayback this is the capture date. */
  label: string;
}

interface ProviderBase {
  /**
   * Stable, URL-safe, dot-namespaced. Appears verbatim in every shared link, so renaming
   * one breaks links already in the wild. Treat it as a public API.
   */
  id: string;
  label: string;
  /** Picker group header. */
  operator: string;
  /** One line for the picker: resolution, vintage, quirks. */
  note: string;
  /** Attribution HTML. Required — this is the legal notice. Sanitized before render. */
  attribution: string;
  /** Asset path for a required wordmark. Mapbox's terms need the logo, not just text. */
  logo?: string;
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
  /** Capture vintage where knowable: "2025", "2026-06-30", "daily". */
  vintage?: string;
  variant?: VariantSpec;
}

export interface RasterProvider extends ProviderBase {
  kind: "raster";
  /**
   * MapLibre tile templates. `{z}`/`{x}`/`{y}` may appear in ANY order and anywhere in the
   * string, including query parameters — so Esri's `/{z}/{y}/{x}` and WMTS KVP endpoints
   * are both plain templates needing no special case.
   *
   * `{z}/{y}/{x}` is NOT TMS. Reaching for `scheme: "tms"` flips y and silently renders
   * the wrong place; no provider here needs it.
   *
   * `{KEY}` is replaced with the resolved API key, and the variant `token` with the
   * resolved variant value.
   */
  tiles: readonly string[];
  /**
   * MUST match what the server actually returns. This is the highest-risk field in the
   * registry: getting it wrong does not error, it renders plausible imagery one zoom level
   * off, which in a comparison tool produces confidently wrong conclusions. Verified by
   * reading the pixel dimensions out of a real tile.
   */
  tileSize: 256 | 512;
}

export interface StyleProvider extends ProviderBase {
  kind: "style";
  /** Full style.json URL. `{KEY}` replaced with the resolved API key. */
  styleUrl: string;
}

export type Provider = RasterProvider | StyleProvider;

/** A provider plus a chosen variant — what one pane shows, and what the URL encodes. */
export interface PaneLayer {
  providerId: string;
  /** Undefined when the provider has no `VariantSpec`. */
  variant?: string;
}
