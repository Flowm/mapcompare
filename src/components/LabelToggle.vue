<script setup lang="ts">
import { useAppState } from "@/composables/useAppState";

const { labels, setLabels } = useAppState();
</script>

<template>
  <button
    type="button"
    class="border-ink-700 rounded border px-2 py-1.5 text-xs transition-colors"
    :class="labels ? 'bg-accent text-ink-950 font-medium' : 'bg-ink-900 text-ink-200 hover:bg-ink-800'"
    :aria-pressed="labels"
    title="Overlay place names, roads and boundaries from OpenFreeMap on every pane"
    @click="setLabels(!labels)"
  >
    Labels
  </button>
</template>
