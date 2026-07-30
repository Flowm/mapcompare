<script setup lang="ts">
import { onScopeDispose } from "vue";

import MapDeck from "@/components/MapDeck.vue";
import ModeSwitcher from "@/components/ModeSwitcher.vue";
import { useAppState } from "@/composables/useAppState";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useMapSync } from "@/composables/useMapSync";

const { camera } = useAppState();
const { onChange } = useMapSync();

useKeyboardShortcuts();

// The camera flows one way: sync group -> state. Nothing watches `camera` back into
// applyCamera, because a delayed echo is the one feedback loop the sync group's synchronous
// guard cannot catch. Deliberate group-wide moves (presets, popstate) call applyCamera
// directly instead.
onScopeDispose(onChange((next) => (camera.value = next)));
</script>

<template>
  <div class="bg-ink-950 flex h-full flex-col">
    <header class="border-ink-700 flex shrink-0 items-center gap-3 border-b px-3 py-2">
      <h1 class="text-sm font-semibold tracking-tight">map<span class="text-accent">compare</span></h1>
      <ModeSwitcher />
      <span class="text-ink-400 ml-auto font-mono text-[11px] tabular-nums">
        {{ camera.center[1].toFixed(5) }}, {{ camera.center[0].toFixed(5) }} · z{{ camera.zoom.toFixed(2) }}
      </span>
    </header>

    <main class="min-h-0 flex-1">
      <MapDeck />
    </main>
  </div>
</template>
