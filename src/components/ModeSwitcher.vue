<script setup lang="ts">
import { useAppState } from "@/composables/useAppState";
import { type Mode, MODE_LABELS } from "@/lib/mode";

const { mode, setMode } = useAppState();

// Swipe and blink are two-pane stacked modes; they arrive with the stacked layout.
const GRID_MODES: Mode[] = ["g1", "g2", "g3", "g4"];
</script>

<template>
  <div class="border-ink-700 bg-ink-900 flex items-center gap-0.5 rounded border p-0.5" role="group" aria-label="Pane layout">
    <button
      v-for="m in GRID_MODES"
      :key="m"
      type="button"
      class="rounded px-2 py-1 text-xs transition-colors"
      :class="mode === m ? 'bg-accent text-ink-950 font-medium' : 'text-ink-200 hover:bg-ink-800'"
      :aria-pressed="mode === m"
      :title="MODE_LABELS[m]"
      @click="setMode(m)"
    >
      {{ m.slice(1) }}
    </button>
  </div>
</template>
