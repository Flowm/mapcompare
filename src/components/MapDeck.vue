<script setup lang="ts">
import { useElementBounding } from "@vueuse/core";
import { computed, ref } from "vue";

import BasemapPicker from "@/components/BasemapPicker.vue";
import BlinkControl from "@/components/BlinkControl.vue";
import MapPane from "@/components/MapPane.vue";
import SwipeDivider from "@/components/SwipeDivider.vue";
import { useAppState } from "@/composables/useAppState";
import { isStacked, layoutFor } from "@/lib/mode";
import { clipInsetFor, paneSide } from "@/lib/swipe";

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

const gridClass = computed(() => layoutFor(mode.value));

/** Which side this pane's chrome lives on. `lib/swipe.ts` owns the rule; see `paneSide`. */
function sideFor(index: number): "left" | "right" {
  return paneSide(mode.value, index);
}

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
        <MapPane :index="index" :layer="pane" :side="sideFor(index)" />

        <!-- Every pane gets its own picker, placed on the same side as the rest of its chrome. -->
        <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start p-2" :class="sideFor(index) === 'left' ? 'justify-start' : 'justify-end'">
          <div class="pointer-events-auto">
            <BasemapPicker :index="index" :layer="pane" :align="sideFor(index)" @update="setPaneLayer(index, $event)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Siblings of the clipped wrappers, not children: inside one they would clip themselves away. -->
    <SwipeDivider v-if="mode === 'sw'" :position="swipe" :deck="deck" @update:position="setSwipe" />
    <BlinkControl v-if="mode === 'bl'" />
  </div>
</template>
