import type { StyleSpecification } from "maplibre-gl";
import { computed, type Ref, shallowRef, watch } from "vue";

import { fetchLabelOverlayStyle, fetchStyle as fetchStyleFromNetwork, LABEL_OVERLAY_STYLE_URL } from "@/api/styles";
import { creditParts } from "@/lib/attribution";
import type { ApiKeys } from "@/lib/providers/availability";
import { buildStyle, resolveAttribution } from "@/lib/providers/buildStyle";
import { applyLabelOverlay, extractLabelOverlay, type LabelOverlay } from "@/lib/providers/labelOverlay";
import { getProvider, LABEL_OVERLAY_PROVIDER_ID } from "@/lib/providers/registry";
import type { ApiKeyName, PaneLayer, Provider, Wordmark } from "@/lib/providers/types";
import { resolveVariant } from "@/lib/providers/variants";

import { useApiKeys } from "./useApiKeys";
import { useAppState } from "./useAppState";
import { useClock } from "./useClock";
import { useDisplaySettings } from "./useDisplaySettings";

/**
 * Everything one pane is legally obliged to show, decided here because this is where it becomes
 * known which providers' content the pane actually renders.
 *
 * `parts` is attribution HTML and is NOT sanitized — the renderer does that, immediately before it
 * reaches `v-html`.
 */
export interface PaneCredit {
  parts: readonly string[];
  wordmarks: readonly Wordmark[];
}

export type ResolvedStyle =
  /**
   * `variant` is the variant actually applied, which is what any chip describing the pane must use.
   * `credit` is the same idea for the legal notice: it names what is on screen, including the label
   * overlay when the pane got one, so no renderer has to re-derive it and get it wrong.
   */
  | { state: "ready"; style: StyleSpecification; variant: string | undefined; credit: PaneCredit }
  | { state: "loading" }
  | { state: "missing-key"; key: ApiKeyName; providerLabel: string }
  | { state: "error"; message: string }
  | { state: "unknown-provider"; providerId: string };

/**
 * Everything this module needs from outside itself.
 *
 * Passed in rather than reached for. Every one of these was previously an undeclared dependency
 * — two localStorage singletons, the URL-backed app state, the network and the wall clock — which
 * meant the interface understated itself by five facts and none of the logic below could be
 * pinned in a test. `defaultResolvedStyleDeps` supplies the production wiring, so call sites are
 * unchanged.
 */
export interface ResolvedStyleDeps {
  keys: Ref<ApiKeys>;
  resampling: Ref<"linear" | "nearest">;
  labels: Ref<boolean>;
  /** Fetches a style-URL provider's document. */
  fetchStyle: (url: string) => Promise<StyleSpecification>;
  /** Resolves the shared label overlay. Memoised in the default wiring, not here. */
  loadOverlay: () => Promise<LabelOverlay>;
  /** The style the overlay comes from, so a pane showing it is not labelled twice. */
  overlayStyleUrl: string;
  /**
   * The app's clock. A watched ref, not a `() => Date`: a function called inside the watcher would
   * be re-read on every unrelated invalidation, which is what let a date pane change day in
   * response to an unrelated setting. See `useClock`.
   */
  now: Ref<Date>;
}

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
 * The credit for a pane showing `provider`'s content, with the overlay's own credit folded in when
 * the pane got one.
 *
 * The overlay is the Liberty provider's vector tiles, so its credit is Liberty's registry entry
 * rather than anything read off the overlay object: Liberty declares its source as a TileJSON `url`,
 * which means the fetched document carries no attribution to copy. An OSM-derived overlay drawn over
 * every pane with nothing crediting OSM was the exact failure this closes.
 */
function paneCredit(provider: Provider, variant: string | undefined, style: StyleSpecification, labelled: boolean): PaneCredit {
  const overlaySource = labelled ? getProvider(LABEL_OVERLAY_PROVIDER_ID) : undefined;
  const crediting = overlaySource ? [provider, overlaySource] : [provider];

  return {
    // The variant is applied to both, harmlessly: only EOX puts a token in its credit, and a
    // provider without one is untouched.
    parts: creditParts(
      crediting.map((p) => resolveAttribution(p, variant)),
      style,
    ),
    wordmarks: crediting.flatMap((p) => (p.wordmark ? [p.wordmark] : [])),
  };
}

/** Drops the memoised overlay. For tests, and for forcing a retry. */
export function clearOverlayCache(): void {
  overlayPromise = undefined;
}

export function defaultResolvedStyleDeps(): ResolvedStyleDeps {
  const { keys } = useApiKeys();
  const { resampling } = useDisplaySettings();
  const { labels } = useAppState();
  const { now } = useClock();

  return {
    keys,
    resampling,
    labels,
    fetchStyle: fetchStyleFromNetwork,
    loadOverlay,
    overlayStyleUrl: LABEL_OVERLAY_STYLE_URL,
    now,
  };
}

/**
 * Resolves one pane's layer choice into a MapLibre style.
 *
 * Raster providers resolve synchronously; style providers need their JSON fetched first. Either
 * way the overlay is merged into the spec BEFORE it is applied, never added afterwards with
 * addLayer, so a basemap switch cannot race against it.
 *
 * The resolved variant is published on the `ready` state, because this is the module that decides
 * it. Anything describing the pane — the vintage chip above all — must read that value rather than
 * re-deriving it, or it ends up describing a vintage the pane is not showing.
 */
export function useResolvedStyle(layer: Ref<PaneLayer>, deps: ResolvedStyleDeps = defaultResolvedStyleDeps()) {
  const { keys, labels, resampling } = deps;

  // shallowRef, not ref: a StyleSpecification is a large immutable document, and letting Vue
  // deep-unwrap it costs real reactivity overhead — and blows TypeScript's instantiation depth
  // limit outright (TS2589) at the setStyle call site.
  const resolved = shallowRef<ResolvedStyle>({ state: "loading" });

  /**
   * Resampling only reaches a raster source, so a style-URL pane must not treat it as an input.
   * Watching it unconditionally re-ran the whole resolution — including `applyLabelOverlay`,
   * which returns a fresh object and so provoked a full `setStyle` — for a setting that cannot
   * change what those panes render.
   */
  const effectiveResampling = computed(() => (getProvider(layer.value.providerId)?.kind === "raster" ? resampling.value : undefined));

  /** Increments on every request so a slow response from a superseded choice is discarded. */
  let generation = 0;

  watch(
    [layer, keys, effectiveResampling, labels, deps.now],
    () => {
      const request = ++generation;
      const stale = () => request !== generation;

      const { providerId, variant } = layer.value;
      const provider = getProvider(providerId);
      if (!provider) {
        resolved.value = { state: "unknown-provider", providerId };
        return;
      }

      const chosenVariant = provider.variant ? resolveVariant(provider.variant, variant, deps.now.value) : undefined;
      const result = buildStyle(provider, chosenVariant, keys.value, { resampling: effectiveResampling.value });

      if (!result.ok) {
        resolved.value = { state: "missing-key", key: result.key, providerLabel: provider.label };
        return;
      }

      const base = "needsFetch" in result ? deps.fetchStyle(result.url) : Promise.resolve(result.style);

      // The overlay IS Liberty's symbol layers, so adding it to a Liberty pane would draw every
      // label twice and make the two copies compete for placement.
      const isOverlaySource = "needsFetch" in result && result.url === deps.overlayStyleUrl;
      const withLabels = labels.value && !isOverlaySource;

      // Synchronous fast path: a raster provider with labels off needs no await, so the pane
      // never flashes through a loading state on a basemap switch.
      if (!withLabels && !("needsFetch" in result)) {
        resolved.value = { state: "ready", style: result.style, variant: chosenVariant, credit: paneCredit(provider, chosenVariant, result.style, false) };
        return;
      }

      resolved.value = { state: "loading" };
      Promise.all([base, withLabels ? deps.loadOverlay() : Promise.resolve(undefined)])
        .then(([style, overlay]) => {
          if (stale()) return;
          const applied = overlay ? applyLabelOverlay(style, overlay) : style;
          resolved.value = { state: "ready", style: applied, variant: chosenVariant, credit: paneCredit(provider, chosenVariant, applied, overlay !== undefined) };
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
