<script setup lang="ts">
import { computed } from "vue";

import { useAppState } from "@/composables/useAppState";
import { getProvider } from "@/lib/providers/registry";

/**
 * Blink mode's only visible affordance.
 *
 * Blink stacks two panes and shows one at a time, which leaves the screen looking exactly like a
 * single-pane view: nothing on it says a second layer exists, which one you are looking at, or how
 * to get to the other. Hold-to-peek on `B` is the fast gesture, but a gesture nobody can see is
 * not a control.
 *
 * So this names both layers, marks the one on screen, and flips on click — a latch, unlike the
 * key, so you can let go and study the frame.
 */

const { panes, blinkTopVisible, toggleBlink } = useAppState();

const shownIndex = computed(() => (blinkTopVisible.value ? 0 : 1));

function label(index: number): string {
  const pane = panes.value[index];
  if (!pane) return "—";
  return getProvider(pane.providerId)?.label ?? pane.providerId;
}
</script>

<template>
  <!-- Sibling of the clipped pane wrappers, like SwipeDivider: inside one it would be masked away
       exactly when the layer it describes is hidden.

       Sits above the pane's bottom row rather than beside it. Centred chrome at the same height as
       the credit would cover it on a narrow window, and painting over a required credit is a
       licensing failure, not a cosmetic one. -->
  <div class="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex justify-center">
    <button
      type="button"
      class="border-ink-600/70 bg-ink-950/85 text-ink-50 hover:bg-ink-800 pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full border py-1 pr-2 pl-1.5 text-xs backdrop-blur transition-colors"
      title="Flip layers — press Space, or hold B to peek"
      @click="toggleBlink"
    >
      <span v-for="index in [0, 1]" :key="index" class="flex min-w-0 items-center gap-1.5" :class="index === shownIndex ? '' : 'text-ink-500'">
        <span v-if="index === 1" class="text-ink-400" aria-hidden="true">⇄</span>
        <span class="rounded px-1 font-mono text-[10px]" :class="index === shownIndex ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-400'">{{ index + 1 }}</span>
        <span class="max-w-[11rem] truncate">{{ label(index) }}</span>
      </span>

      <kbd class="border-ink-700 text-ink-400 ml-0.5 rounded border px-1 font-mono text-[10px]">space</kbd>
    </button>
  </div>
</template>
