import type { StyleSpecification } from "maplibre-gl";
import { computed, type Ref, shallowRef, watch } from "vue";

import { loadTimeDomain as loadTimeDomainFromNetwork } from "@/api/discovery";
import { fetchLabelOverlayStyle, fetchStyle as fetchStyleFromNetwork, LABEL_OVERLAY_STYLE_URL } from "@/api/styles";
import { creditParts } from "@/lib/attribution";
import type { ApiKeys } from "@/lib/layers/availability";
import { buildStyle, resolveAttribution } from "@/lib/layers/buildStyle";
import { applyLabelOverlay, extractLabelOverlay, type LabelOverlay } from "@/lib/layers/labelOverlay";
import { getLayer, LABEL_OVERLAY_LAYER_ID } from "@/lib/layers/registry";
import { endedOn, type ResolvedTime, resolveTime, type TimeDomain } from "@/lib/layers/time";
import type { ApiKeyName, Layer, PaneLayer, Wordmark } from "@/lib/layers/types";

import { useApiKeys } from "./useApiKeys";
import { useAppState } from "./useAppState";
import { useClock } from "./useClock";
import { useDisplaySettings } from "./useDisplaySettings";
import { useTimeDomain } from "./useTimeDomain";

/**
 * Everything one pane is legally obliged to show, decided here because this is where it becomes
 * known which Layers' content the pane actually renders.
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
   * `time` is the Time actually shown, which is what any chip describing the pane must use — with
   * what was asked for when that differs. `ended` names the day a Layer's series stopped.
   * `credit` is the same idea for the legal notice: it names what is on screen, including the label
   * overlay when the pane got one, so no renderer has to re-derive it and get it wrong.
   */
  | { state: "ready"; style: StyleSpecification; time: ResolvedTime | undefined; ended?: string; credit: PaneCredit }
  | { state: "loading" }
  | { state: "missing-key"; key: ApiKeyName; layerLabel: string }
  | { state: "error"; message: string }
  | { state: "unknown-layer"; layerId: string };

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
  /** Fetches a style Layer's document. */
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
  /** Asks a Layer's service which Times it has. Memoised in the default wiring, not here. */
  loadTimeDomain: (layer: Layer, now: Date) => Promise<TimeDomain | undefined>;
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
 * The credit for a pane showing `layer`'s content, with the overlay's own credit folded in when
 * the pane got one.
 *
 * The overlay is the Liberty Layer's vector tiles, so its credit is Liberty's registry entry
 * rather than anything read off the overlay object: Liberty declares its source as a TileJSON `url`,
 * which means the fetched document carries no attribution to copy. An OSM-derived overlay drawn over
 * every pane with nothing crediting OSM was the exact failure this closes.
 */
function paneCredit(layer: Layer, time: ResolvedTime | undefined, style: StyleSpecification, labelled: boolean): PaneCredit {
  const overlaySource = labelled ? getLayer(LABEL_OVERLAY_LAYER_ID) : undefined;
  const crediting = overlaySource ? [layer, overlaySource] : [layer];

  return {
    // The Time is applied to both, harmlessly: the overlay's credit names no year.
    parts: creditParts(
      crediting.map((l) => resolveAttribution(l, time)),
      style,
    ),
    wordmarks: crediting.flatMap((l) => (l.wordmark ? [l.wordmark] : [])),
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
    loadTimeDomain: loadTimeDomainFromNetwork,
  };
}

/**
 * Resolves one pane's Layer and Time into a MapLibre style.
 *
 * A raster Layer whose Times are declared resolves synchronously. One that asks its service, and
 * a style Layer whose JSON must be fetched, go through `loading`. Either way the overlay is merged
 * into the spec BEFORE it is applied, never added afterwards with addLayer, so a Layer switch
 * cannot race against it.
 *
 * The resolved Time is published on the `ready` state, because this is the module that decides
 * it. Anything describing the pane — the Time chip above all — must read that value rather than
 * re-deriving it, or it ends up describing a picture the pane is not showing.
 */
export function useResolvedStyle(layer: Ref<PaneLayer>, deps: ResolvedStyleDeps = defaultResolvedStyleDeps()) {
  const { keys, labels, resampling } = deps;

  // shallowRef, not ref: a StyleSpecification is a large immutable document, and letting Vue
  // deep-unwrap it costs real reactivity overhead — and blows TypeScript's instantiation depth
  // limit outright (TS2589) at the setStyle call site.
  const resolved = shallowRef<ResolvedStyle>({ state: "loading" });

  /**
   * Resampling only reaches a raster source, so a style pane must not treat it as an input.
   * Watching it unconditionally re-ran the whole resolution — including `applyLabelOverlay`,
   * which returns a fresh object and so provoked a full `setStyle` — for a setting that cannot
   * change what those panes render.
   */
  const effectiveResampling = computed(() => (getLayer(layer.value.layerId)?.kind !== "style" ? resampling.value : undefined));

  /**
   * The Layer's Times, kept apart from the style so that a cached answer stays cached: a key, the
   * labels or resampling changing must rebuild the style from it, not send a GIBS pane back
   * through `loading` to ask again.
   */
  const chosenLayer = computed(() => getLayer(layer.value.layerId));
  const { domain: times } = useTimeDomain(chosenLayer, { now: deps.now, loadTimeDomain: deps.loadTimeDomain });

  /** Increments on every request so a slow response from a superseded choice is discarded. */
  let generation = 0;

  watch(
    [layer, keys, effectiveResampling, labels, times],
    () => {
      const request = ++generation;
      const stale = () => request !== generation;

      const { layerId, time: requested } = layer.value;
      const chosen = getLayer(layerId);
      if (!chosen) {
        resolved.value = { state: "unknown-layer", layerId };
        return;
      }

      let domain: TimeDomain | undefined;
      if (chosen.time) {
        const known = times.value;
        // An answer about the Layer this pane just left is no answer at all.
        if (known.layerId !== chosen.id || known.state === "loading" || known.state === "static") {
          resolved.value = { state: "loading" };
          return;
        }
        if (known.state === "error") {
          resolved.value = { state: "error", message: known.message };
          return;
        }
        domain = known.domain;
      }

      const time = domain ? resolveTime(domain, requested) : undefined;
      if (chosen.time && !time) {
        resolved.value = { state: "error", message: `${chosen.label} has no pictures available right now.` };
        return;
      }
      const ended = domain && chosen.time ? endedOn(domain, chosen.time, deps.now.value) : undefined;
      const extra = ended === undefined ? {} : { ended };

      const result = buildStyle(chosen, time, keys.value, { resampling: effectiveResampling.value });
      if (!result.ok) {
        resolved.value = { state: "missing-key", key: result.key, layerLabel: chosen.label };
        return;
      }

      const base = "needsFetch" in result ? deps.fetchStyle(result.url) : Promise.resolve(result.style);

      // The overlay IS Liberty's symbol layers, so adding it to a Liberty pane would draw every
      // label twice and make the two copies compete for placement.
      const isOverlaySource = "needsFetch" in result && result.url === deps.overlayStyleUrl;
      const withLabels = labels.value && !isOverlaySource;

      // Synchronous fast path: a raster Layer with labels off needs no await, so the pane
      // never flashes through a loading state on a Layer switch.
      if (!withLabels && !("needsFetch" in result)) {
        resolved.value = { state: "ready", style: result.style, time, ...extra, credit: paneCredit(chosen, time, result.style, false) };
        return;
      }

      resolved.value = { state: "loading" };
      Promise.all([base, withLabels ? deps.loadOverlay() : Promise.resolve(undefined)])
        .then(([style, overlay]) => {
          if (stale()) return;
          const applied = overlay ? applyLabelOverlay(style, overlay) : style;
          resolved.value = { state: "ready", style: applied, time, ...extra, credit: paneCredit(chosen, time, applied, overlay !== undefined) };
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
