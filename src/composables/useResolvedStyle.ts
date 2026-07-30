import type { StyleSpecification } from "maplibre-gl";
import { type Ref, shallowRef, watch } from "vue";

import { fetchStyle } from "@/api/styles";
import { buildStyle } from "@/lib/providers/buildStyle";
import { getProvider } from "@/lib/providers/registry";
import type { ApiKeyName, PaneLayer } from "@/lib/providers/types";
import { resolveVariant } from "@/lib/providers/variants";

import { useApiKeys } from "./useApiKeys";
import { useDisplaySettings } from "./useDisplaySettings";

export type ResolvedStyle =
  | { state: "ready"; style: StyleSpecification }
  | { state: "loading" }
  | { state: "missing-key"; key: ApiKeyName; providerLabel: string }
  | { state: "error"; message: string }
  | { state: "unknown-provider"; providerId: string };

/**
 * Resolves one pane's layer choice into a MapLibre style.
 *
 * Raster providers resolve synchronously. Style providers need their JSON fetched (see
 * api/styles.ts for why), so the result passes through `loading` first.
 */
export function useResolvedStyle(layer: Ref<PaneLayer>) {
  const { keys } = useApiKeys();
  const { resampling } = useDisplaySettings();
  // shallowRef, not ref: a StyleSpecification is a large immutable document, and letting Vue
  // deep-unwrap it costs real reactivity overhead — and blows TypeScript's instantiation depth
  // limit outright (TS2589) at the setStyle call site.
  const resolved = shallowRef<ResolvedStyle>({ state: "loading" });

  watch(
    [layer, keys, resampling],
    () => {
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

      if (!("needsFetch" in result)) {
        resolved.value = { state: "ready", style: result.style };
        return;
      }

      // Guard against a slow fetch landing after the user has already picked something else.
      const requestedFor = providerId;
      resolved.value = { state: "loading" };
      fetchStyle(result.url)
        .then((style) => {
          if (layer.value.providerId !== requestedFor) return;
          resolved.value = { state: "ready", style };
        })
        .catch((error: unknown) => {
          if (layer.value.providerId !== requestedFor) return;
          resolved.value = { state: "error", message: error instanceof Error ? error.message : String(error) };
        });
    },
    { immediate: true, deep: true },
  );

  return { resolved };
}
