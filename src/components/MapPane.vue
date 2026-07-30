<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { Map as MapLibreMap } from "maplibre-gl";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

import PaneAttribution from "@/components/PaneAttribution.vue";
import PaneStatus from "@/components/PaneStatus.vue";
import { useAppState } from "@/composables/useAppState";
import { useDisplaySettings } from "@/composables/useDisplaySettings";
import { useMapSync } from "@/composables/useMapSync";
import { usePaneTiles } from "@/composables/usePaneTiles";
import { useResolvedStyle } from "@/composables/useResolvedStyle";
import { getProvider } from "@/lib/providers/registry";
import type { PaneLayer } from "@/lib/providers/types";
import type { SyncableMap } from "@/lib/syncGroup";

const props = defineProps<{
  index: number;
  layer: PaneLayer;
  /**
   * Which side of the pane its chrome sits on.
   *
   * Load-bearing in swipe mode: the top pane is masked with clip-path, so anything placed on the
   * hidden side is clipped away — including its attribution, which would strip a required legal
   * credit rather than merely look untidy.
   */
  side?: "left" | "right";
}>();

const container = ref<HTMLDivElement>();
const map = shallowRef<MapLibreMap>();

const { camera } = useAppState();
const { registerPane } = useMapSync();
const { allowRotate } = useDisplaySettings();

const layerRef = computed(() => props.layer);
const { resolved } = useResolvedStyle(layerRef);
const provider = computed(() => getProvider(props.layer.providerId));
const { failed } = usePaneTiles(map);

/** The style actually applied, which is what the attribution must be derived from. */
const appliedStyle = computed(() => (resolved.value.state === "ready" ? resolved.value.style : undefined));

let unregister: (() => void) | undefined;

onMounted(() => {
  if (!container.value) return;

  const instance = new MapLibreMap({
    container: container.value,
    // An empty style to begin with; the real one is applied by the watcher below once
    // resolved. Keeps pane creation independent of network latency.
    style: { version: 8, sources: {}, layers: [] },
    center: camera.value.center,
    zoom: camera.value.zoom,
    bearing: camera.value.bearing,
    pitch: camera.value.pitch,

    // We render our own attribution. MapLibre's control lives inside the map container, so in
    // swipe mode the top pane's clip-path would clip its credit away — a licensing problem,
    // not a cosmetic one.
    attributionControl: false,

    // Every pane gets identical limits. Never derive these from the provider's native zoom
    // range: a pane that clamps differently reports a different zoom back to the sync group
    // and the panes fight each other. Zoom disparity is a UI concern, not a camera one.
    minZoom: 0,
    maxZoom: 22,

    // The sync group propagates exact zooms through jumpTo, which applies zoom snapping when
    // it is enabled. Snapping would quantise the pushed value and desync the panes, so it is
    // pinned off rather than left to the default.
    zoomSnap: 0,

    // No cross-fades anywhere: they blend two states while the user is comparing.
    fadeDuration: 0,

    // Pitch is close to useless for orthoimagery and invites confusing desync reports.
    dragRotate: allowRotate.value,
    pitchWithRotate: allowRotate.value,
    touchPitch: allowRotate.value,

    // MapLibre must never own the URL: the app writes its own, richer state there.
    hash: false,

    canvasContextAttributes: { antialias: false },
    refreshExpiredTiles: true,
  });

  map.value = instance;
  unregister = registerPane(instance as unknown as SyncableMap);
});

onBeforeUnmount(() => {
  // Order matters. Leaving the sync group first means a `move` fired during remove() cannot
  // reach a broadcast that touches a half-destroyed map.
  unregister?.();
  unregister = undefined;
  map.value?.remove();
  map.value = undefined;
});

watch(
  [map, resolved],
  () => {
    const instance = map.value;
    const state = resolved.value;
    if (!instance || state.state !== "ready") return;
    instance.setStyle(state.style);
  },
  { immediate: true },
);

watch(allowRotate, (enabled) => {
  const instance = map.value;
  if (!instance) return;
  if (enabled) {
    instance.dragRotate.enable();
    instance.touchPitch.enable();
  } else {
    instance.dragRotate.disable();
    instance.touchPitch.disable();
    if (instance.getBearing() !== 0 || instance.getPitch() !== 0) instance.jumpTo({ bearing: 0, pitch: 0 });
  }
});

// Mode switches change pane geometry. MapLibre preserves the centre across a resize, so every
// pane resizes identically and the group stays in sync.
useResizeObserver(container, () => map.value?.resize());
</script>

<template>
  <div class="bg-ink-900 relative h-full w-full overflow-hidden">
    <!-- h-full rather than `absolute inset-0`: maplibre sets `position: relative` on this
         element itself, which would defeat inset-based sizing. -->
    <div ref="container" class="h-full w-full" />

    <!-- Chips and credit share the bottom corner on `side`, beneath the picker MapDeck places at
         the top of the same side. Keeping them together on one side is what guarantees they stay
         inside the visible region when the top pane is clipped. -->
    <div class="pointer-events-none absolute bottom-1 z-10 flex max-w-full flex-col gap-1" :class="props.side === 'left' ? 'left-1 items-start' : 'right-1 items-end'">
      <div v-if="provider" class="pointer-events-auto">
        <PaneStatus :provider="provider" :variant="layer.variant" :failed-tiles="failed" />
      </div>
      <PaneAttribution :style="appliedStyle" />
    </div>

    <!-- Blocking states. Overzoom is deliberately NOT one of them: MapLibre upsamples rather
         than blanking, which is correct behaviour, and the pane badge explains it. -->
    <div v-if="resolved.state === 'missing-key'" class="bg-ink-950/85 absolute inset-0 grid place-items-center p-6 text-center">
      <div class="max-w-xs">
        <p class="text-ink-50 text-sm font-medium">{{ resolved.providerLabel }} needs an API key</p>
        <p class="text-ink-400 mt-2 text-xs leading-relaxed">
          Set <code class="text-ink-200 font-mono">{{ resolved.key }}</code> in <code class="text-ink-200 font-mono">.env.development</code>, or paste a key in Settings.
        </p>
        <a v-if="provider?.keyUrl" :href="provider.keyUrl" target="_blank" rel="noreferrer noopener" class="text-accent mt-3 inline-block text-xs hover:underline">
          Get a key<span v-if="provider.freeTier"> — {{ provider.freeTier }}</span> ↗
        </a>
      </div>
    </div>

    <div v-else-if="resolved.state === 'error'" class="bg-ink-950/85 absolute inset-0 grid place-items-center p-6 text-center">
      <div class="max-w-xs">
        <p class="text-ink-50 text-sm font-medium">Could not load this basemap</p>
        <p class="text-ink-400 mt-2 font-mono text-xs leading-relaxed break-words">{{ resolved.message }}</p>
      </div>
    </div>

    <div v-else-if="resolved.state === 'unknown-provider'" class="bg-ink-950/85 absolute inset-0 grid place-items-center p-6 text-center">
      <p class="text-ink-400 max-w-xs text-sm">
        Unknown basemap <code class="text-ink-200 font-mono">{{ resolved.providerId }}</code>
      </p>
    </div>
  </div>
</template>
