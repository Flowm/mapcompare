<script setup lang="ts">
import { computed } from "vue";

import BasemapPicker from "@/components/BasemapPicker.vue";
import MapPane from "@/components/MapPane.vue";
import { useAppState } from "@/composables/useAppState";
import { isStacked } from "@/lib/mode";

/**
 * Owns THE ONLY v-for over panes, keyed by pane index.
 *
 * This is load-bearing. Switching modes must swap CSS on the wrappers, not remount the
 * children, so the `maplibregl.Map` instances survive grid <-> swipe <-> blink with no
 * re-initialisation and no tile refetch.
 *
 * Two traps to avoid:
 *   - Do NOT key on provider id. That would tear down and rebuild a WebGL context on every
 *     basemap change: the most expensive possible way to do the cheapest operation.
 *   - Do NOT split this into separate grid and stacked components each owning their own
 *     v-for. That is the obvious structure and it silently destroys every map on each mode
 *     switch.
 */

const { mode, panes, setPaneLayer } = useAppState();

const gridClass = computed(() => {
  switch (mode.value) {
    case "g1":
      return "grid-cols-1 grid-rows-1";
    case "g2":
      return "grid-cols-2 grid-rows-1";
    // Equal tracks rather than a 2-over-1 layout: the shared crosshair mirrors pointer
    // offsets between panes without projecting coordinates, which only holds while every
    // pane is the same size.
    case "g3":
      return "grid-cols-3 grid-rows-1";
    case "g4":
      return "grid-cols-2 grid-rows-2";
    default:
      return "grid-cols-1 grid-rows-1";
  }
});
</script>

<template>
  <div class="h-full w-full">
    <div class="bg-ink-700 grid h-full w-full gap-px" :class="isStacked(mode) ? '' : gridClass">
      <div v-for="(pane, index) in panes" :key="index" class="relative min-h-0 min-w-0">
        <MapPane :index="index" :layer="pane" />

        <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <div class="pointer-events-auto">
            <BasemapPicker :layer="pane" @update="setPaneLayer(index, $event)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
