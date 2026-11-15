<script setup lang="ts">
import { useAppState } from "@/composables/useAppState";

/**
 * Where the map is looking, as text.
 *
 * Its own component because the camera changes on every frame of a pan: read in App.vue, it would
 * re-render the whole app shell sixty times a second; here it re-renders one line.
 */
const { camera } = useAppState();
</script>

<template>
  <span class="text-muted font-mono text-[11px] whitespace-nowrap tabular-nums">
    {{ camera.center[1].toFixed(5) }}, {{ camera.center[0].toFixed(5) }} · z{{ camera.zoom.toFixed(2) }}
  </span>
</template>
