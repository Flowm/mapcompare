import type { StyleSpecification } from "maplibre-gl";
import { type Ref, shallowRef, watch } from "vue";

import { fetchLabelOverlayStyle, fetchStyle, LABEL_OVERLAY_STYLE_URL } from "@/api/styles";
import { buildStyle } from "@/lib/providers/buildStyle";
import { applyLabelOverlay, extractLabelOverlay, type LabelOverlay } from "@/lib/providers/labelOverlay";
import { getProvider } from "@/lib/providers/registry";
import type { ApiKeyName, PaneLayer } from "@/lib/providers/types";
import { resolveVariant } from "@/lib/providers/variants";

import { useApiKeys } from "./useApiKeys";
import { useAppState } from "./useAppState";
import { useDisplaySettings } from "./useDisplaySettings";

export type ResolvedStyle =
  | { state: "ready"; style: StyleSpecification }
  | { state: "loading" }
  | { state: "missing-key"; key: ApiKeyName; providerLabel: string }
  | { state: "error"; message: string }
  | { state: "unknown-provider"; providerId: string };

/**
 * Liberty is parsed into an overlay once per session and shared by every pane. Extracting it is
 * pure but not free, and all panes get the same labels by design.
 */
let overlayPromise: Promise<LabelOverlay> | undefined;

function loadOverlay(): Promise<LabelOverlay> {
  overlayPromise ??= fetchLabelOverlayStyle()
    .then(extractLabelOverlay)
    .catch((error: unknown) => {
      // Do not poison the cache: labels should be retryable after a flaky request.
      overlayPromise = undefined;
      throw error;
    });
  return overlayPromise;
}

/**
 * Resolves one pane's layer choice into a MapLibre style.
 *
 * Raster providers resolve synchronously; style providers need their JSON fetched first. Either
 * way the overlay is merged into the spec BEFORE it is applied, never added afterwards with
 * addLayer, so a basemap switch cannot race against it.
 */
export function useResolvedStyle(layer: Ref<PaneLayer>) {
  const { keys } = useApiKeys();
  const { resampling } = useDisplaySettings();
  const { labels } = useAppState();

  // shallowRef, not ref: a StyleSpecification is a large immutable document, and letting Vue
  // deep-unwrap it costs real reactivity overhead — and blows TypeScript's instantiation depth
  // limit outright (TS2589) at the setStyle call site.
  const resolved = shallowRef<ResolvedStyle>({ state: "loading" });

  /** Increments on every request so a slow response from a superseded choice is discarded. */
  let generation = 0;

  watch(
    [layer, keys, resampling, labels],
    () => {
      const request = ++generation;
      const stale = () => request !== generation;

      const { providerId, variant } = layer.value;
      const provider = getProvider(providerId);
      if (!provider) {
        resolved.value = { state: "unknown-provider", providerId };
        return;
      }

      const chosenVariant = provider.variant ? resolveVariant(provider.variant, variant, new Date()) : undefined;
      const result = buildStyle(provider, chosenVariant, keys.value, { resampling: resampling.value });

      if (!result.ok) {
        resolved.value = { state: "missing-key", key: result.key, providerLabel: provider.label };
        return;
      }

      const base = "needsFetch" in result ? fetchStyle(result.url) : Promise.resolve(result.style);

      // The overlay IS Liberty's symbol layers, so adding it to a Liberty pane would draw every
      // label twice and make the two copies compete for placement.
      const isOverlaySource = "needsFetch" in result && result.url === LABEL_OVERLAY_STYLE_URL;
      const withLabels = labels.value && !isOverlaySource;

      // Synchronous fast path: a raster provider with labels off needs no await, so the pane
      // never flashes through a loading state on a basemap switch.
      if (!withLabels && !("needsFetch" in result)) {
        resolved.value = { state: "ready", style: result.style };
        return;
      }

      resolved.value = { state: "loading" };
      Promise.all([base, withLabels ? loadOverlay() : Promise.resolve(undefined)])
        .then(([style, overlay]) => {
          if (stale()) return;
          resolved.value = { state: "ready", style: overlay ? applyLabelOverlay(style, overlay) : style };
        })
        .catch((error: unknown) => {
          if (stale()) return;
          resolved.value = { state: "error", message: error instanceof Error ? error.message : String(error) };
        });
    },
    { immediate: true, deep: true },
  );

  return { resolved };
}
