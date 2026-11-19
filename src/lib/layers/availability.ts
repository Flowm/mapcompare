import { PROVIDERS } from "./providers";
import { type Cadence, cadenceOf } from "./time";
import type { ApiKeyName, Category, Layer, Orbit, ProviderId } from "./types";

/**
 * Whether a Layer can currently be used, and if not, why — in words the UI shows. Plus the
 * facets the catalogue filters and groups by.
 *
 * Pure: keys arrive as a parameter. `src/lib/**` never imports `src/env.ts`; the composable
 * `useApiKeys` is the seam that merges build-time env values with the user's localStorage
 * overrides and passes the result in here.
 */

export type ApiKeys = Partial<Record<ApiKeyName, string | undefined>>;

/** `VITE_X=` with nothing after it yields "", not undefined, so blank must count as unset. */
export function hasKey(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export interface LayerStatus {
  layer: Layer;
  enabled: boolean;
  /** Present iff `!enabled`. `message` is rendered visibly, not only as a tooltip. */
  disabled?: {
    code: "missing-key";
    key: ApiKeyName;
    keyUrl?: string;
    freeTier?: string;
    message: string;
  };
}

export function layerStatus(layer: Layer, keys: ApiKeys): LayerStatus {
  const required = layer.requiresKey;
  if (required && !hasKey(keys[required])) {
    return {
      layer,
      enabled: false,
      disabled: {
        code: "missing-key",
        key: required,
        keyUrl: layer.keyUrl,
        freeTier: layer.freeTier,
        // Said in the reader's terms: the row opens the API keys dialog, which names the env var.
        message: `Needs an API key from ${PROVIDERS[layer.provider].label}. Select to add one.`,
      },
    };
  }
  return { layer, enabled: true };
}

export function layerStatuses(layers: readonly Layer[], keys: ApiKeys): LayerStatus[] {
  return layers.map((l) => layerStatus(l, keys));
}

export function providerLabel(layer: Layer): string {
  return PROVIDERS[layer.provider].label;
}

// ------------------------------------------------------------------------------ facets

export const CATEGORY_LABELS: Record<Category, string> = { basemap: "Basemaps", satellite: "Satellite", map: "Maps" };
export const ORBIT_LABELS: Record<Orbit, string> = { leo: "LEO", geo: "GEO" };
export const CADENCE_LABELS: Record<Cadence, string> = { "sub-daily": "Sub-daily", daily: "Daily", monthly: "Monthly", yearly: "Yearly", static: "Static" };

/**
 * The catalogue filter. Within a facet the chosen values are alternatives; across facets every
 * facet must match. An empty facet does not filter.
 */
export interface LayerFilter {
  categories: readonly Category[];
  orbits: readonly Orbit[];
  cadences: readonly Cadence[];
  providers: readonly ProviderId[];
  /** Free text over label, Provider and note. */
  text: string;
}

export const NO_FILTER: LayerFilter = { categories: [], orbits: [], cadences: [], providers: [], text: "" };

export function matchesFilter(layer: Layer, filter: LayerFilter): boolean {
  if (filter.categories.length > 0 && !filter.categories.includes(layer.category)) return false;
  if (filter.orbits.length > 0 && (layer.orbit === undefined || !filter.orbits.includes(layer.orbit))) return false;
  if (filter.cadences.length > 0 && !filter.cadences.includes(cadenceOf(layer.time))) return false;
  if (filter.providers.length > 0 && !filter.providers.includes(layer.provider)) return false;
  const term = filter.text.trim().toLowerCase();
  return term === "" || `${layer.label} ${providerLabel(layer)} ${layer.note}`.toLowerCase().includes(term);
}

export function isFiltering(filter: LayerFilter): boolean {
  return filter.categories.length + filter.orbits.length + filter.cadences.length + filter.providers.length > 0 || filter.text.trim() !== "";
}

// ---------------------------------------------------------------------------- grouping

export type GroupBy = "provider" | "category";

export interface LayerGroup {
  key: string;
  label: string;
  entries: LayerStatus[];
}

/**
 * Groups Layers for the catalogue, preserving registry order within each group and ordering
 * the groups by first appearance. Enabled and disabled entries stay interleaved in registry
 * order on purpose: hiding or sinking unavailable Layers would destroy the discovery value,
 * which is most of what this app is for.
 */
export function groupLayers(statuses: readonly LayerStatus[], by: GroupBy): LayerGroup[] {
  const groups = new Map<string, LayerGroup>();
  for (const status of statuses) {
    const key = by === "provider" ? status.layer.provider : status.layer.category;
    const label = by === "provider" ? providerLabel(status.layer) : CATEGORY_LABELS[status.layer.category];
    const existing = groups.get(key);
    if (existing) existing.entries.push(status);
    else groups.set(key, { key, label, entries: [status] });
  }
  return [...groups.values()];
}
