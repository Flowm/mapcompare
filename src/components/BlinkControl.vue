<script setup lang="ts">
import { onLongPress } from "@vueuse/core";
import { computed, ref } from "vue";

import { useAppState } from "@/composables/useAppState";
import { findLayer } from "@/composables/useCatalogue";

/**
 * Blink mode's only visible affordance.
 *
 * Blink stacks two panes and shows one at a time, which leaves the screen looking exactly like a
 * single-pane view: nothing on it says a second layer exists, which one you are looking at, or how
 * to get to the other. Hold-to-peek on `B` is the fast gesture, but a gesture nobody can see is
 * not a control.
 *
 * So this names both layers, marks the one on screen, and flips on click — a latch, unlike the
 * key, so you can let go and study the frame. On a touch screen, holding it peeks like the key.
 */

const { panes, blinkTopVisible, toggleBlink, setBlinkTopVisible } = useAppState();

/**
 * Press and hold on a touch screen is the B key's hold-to-peek: the other layer shows for as long
 * as the finger stays down. A plain tap still latches, like a click. A mouse keeps click only,
 * since it has the key.
 */
const button = ref<HTMLButtonElement>();
let peeking = false;
let swallowClick = false;

onLongPress(
  button,
  (event) => {
    if (event.pointerType === "mouse") return;
    peeking = true;
    setBlinkTopVisible(!blinkTopVisible.value);
  },
  {
    delay: 250,
    // A finger sliding onto the map is a pan, not a hold.
    distanceThreshold: 10,
    onMouseUp: (_duration, _distance, _isLongPress, event) => {
      if (!peeking) return;
      peeking = false;
      // Only a release is followed by a click to swallow. A cancelled press sends none, so arming
      // the swallow then would eat the next real tap.
      swallowClick = event.type === "pointerup";
      setBlinkTopVisible(!blinkTopVisible.value);
    },
  },
);

function onClick() {
  if (swallowClick) {
    swallowClick = false;
    return;
  }
  toggleBlink();
}

const shownIndex = computed(() => (blinkTopVisible.value ? 0 : 1));

function label(index: number): string {
  const pane = panes.value[index];
  if (!pane) return "—";
  return findLayer(pane.layerId)?.label ?? pane.layerId;
}
</script>

<template>
  <!-- Sibling of the clipped pane wrappers, like SwipeDivider: inside one it would be masked away
       exactly when the layer it describes is hidden.

       Sits above the pane's bottom row rather than beside it, higher on a phone, where the chips
       and the credit wrap onto more lines. Centred chrome at the same height as
       the credit would cover it on a narrow window, and painting over a required credit is a
       licensing failure, not a cosmetic one. -->
  <div class="compact:bottom-20 pointer-events-none absolute inset-x-0 bottom-8 z-20 flex justify-center">
    <button
      ref="button"
      type="button"
      class="border-ink-600/70 bg-ink-950/85 text-ink-50 hover:bg-ink-800 pointer-events-auto flex max-w-[92vw] touch-manipulation items-center gap-2 rounded-full border py-1 pr-2 pl-1.5 text-xs backdrop-blur transition-colors select-none pointer-coarse:py-2"
      @click="onClick"
      @pointerdown="swallowClick = false"
      @contextmenu.prevent
    >
      <span v-for="index in [0, 1]" :key="index" class="flex min-w-0 items-center gap-1.5" :class="index === shownIndex ? '' : 'text-dimmed'">
        <span v-if="index === 1" class="text-muted" aria-hidden="true">⇄</span>
        <span class="rounded px-1 font-mono text-[10px]" :class="index === shownIndex ? 'bg-primary text-ink-950' : 'bg-ink-800 text-muted'">{{ index + 1 }}</span>
        <span class="compact:max-w-[6.5rem] max-w-[11rem] truncate">{{ label(index) }}</span>
      </span>

      <!-- Described, not labelled: an aria-label would replace the layer names, which are the point. -->
      <span class="sr-only">Flip layers. Space flips, holding B peeks.</span>
      <UKbd value="space" size="sm" class="ml-0.5" />
      <span class="text-dimmed hidden shrink-0 text-[10px] whitespace-nowrap pointer-coarse:inline">hold to peek</span>
    </button>
  </div>
</template>
