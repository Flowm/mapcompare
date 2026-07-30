<script setup lang="ts">
import { useElementBounding } from "@vueuse/core";
import { computed, ref } from "vue";

import BasemapPicker from "@/components/BasemapPicker.vue";
import MapPane from "@/components/MapPane.vue";
import SwipeDivider from "@/components/SwipeDivider.vue";
import { useAppState } from "@/composables/useAppState";
import { isStacked } from "@/lib/mode";
import { clipInsetFor } from "@/lib/swipe";

/**
 * Owns THE ONLY v-for over panes, keyed by pane index.
 *
 * This is load-bearing. Switching modes must swap CSS on the wrappers, not remount the
 * children, so the `maplibregl.Map` instances survive grid <-> swipe <-> blink with no
 * re-initialisation and no tile refetch. Verified in the browser by tagging canvas elements
 * across a 2 -> 4 -> 2 round trip.
 *
 * Two traps to avoid:
 *   - Do NOT key on provider id. That would tear down and rebuild a WebGL context on every
 *     basemap change: the most expensive possible way to do the cheapest operation.
 *   - Do NOT split this into separate grid and stacked components each owning their own
 *     v-for. That is the obvious structure and it silently destroys every map on each mode
 *     switch.
 */

const { mode, panes, swipe, blinkTopVisible, setPaneLayer, setSwipe } = useAppState();

const deck = ref<HTMLElement>();
useElementBounding(deck);

const gridClass = computed(() => {
  switch (mode.value) {
    case "g1":
      return "grid-cols-1 grid-rows-1";
    case "g2":
      return "grid-cols-2 grid-rows-1";
    // Equal tracks rather than a 2-over-1 layout: the shared crosshair mirrors pointer offsets
    // between panes without projecting coordinates, which only holds while panes match in size.
    case "g3":
      return "grid-cols-3 grid-rows-1";
    case "g4":
      return "grid-cols-2 grid-rows-2";
    default:
      return "grid-cols-1 grid-rows-1";
  }
});

/**
 * In stacked modes both panes fill the deck and the TOP one (index 0) is masked with
 * clip-path. Never size it instead: resizing changes the canvas, so MapLibre re-fits the same
 * camera to a different extent and the seam stops lining up.
 */
function paneStyle(index: number) {
  if (!isStacked(mode.value)) return undefined;
  if (index === 0) return { zIndex: 1, clipPath: clipInsetFor(mode.value, swipe.value, blinkTopVisible.value) };
  return { zIndex: 0 };
}
</script>

<template>
  <div ref="deck" class="relative h-full w-full overflow-hidden">
    <div class="h-full w-full" :class="isStacked(mode) ? 'relative' : `bg-ink-700 grid gap-px ${gridClass}`">
      <div v-for="(pane, index) in panes" :key="index" :class="isStacked(mode) ? 'absolute inset-0' : 'relative min-h-0 min-w-0'" :style="paneStyle(index)">
        <MapPane :index="index" :layer="pane" />

        <!-- Hidden for the masked top pane in blink mode, where two stacked pickers would
             otherwise overlap illegibly. -->
        <div v-if="!isStacked(mode) || index === 0" class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <div class="pointer-events-auto">
            <BasemapPicker :layer="pane" @update="setPaneLayer(index, $event)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Sibling of the clipped wrappers, not a child: inside one it would clip itself away. -->
    <SwipeDivider v-if="mode === 'sw'" :position="swipe" :deck="deck" @update:position="setSwipe" />

    <!-- In blink mode the second pane's picker sits at the bottom, since its pane is masked. -->
    <div v-if="mode === 'bl' && panes[1]" class="absolute inset-x-0 bottom-0 z-20 flex justify-start p-2">
      <BasemapPicker :layer="panes[1]" @update="setPaneLayer(1, $event)" />
    </div>
  </div>
</template>
