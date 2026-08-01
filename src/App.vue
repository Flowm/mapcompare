<script setup lang="ts">
import { ref } from "vue";

import KeysDialog from "@/components/KeysDialog.vue";
import LabelToggle from "@/components/LabelToggle.vue";
import LayerManager from "@/components/LayerManager.vue";
import MapDeck from "@/components/MapDeck.vue";
import ModeSwitcher from "@/components/ModeSwitcher.vue";
import PresetMenu from "@/components/PresetMenu.vue";
import ShareButton from "@/components/ShareButton.vue";
import SourcesDialog from "@/components/SourcesDialog.vue";
import { useAppState } from "@/composables/useAppState";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useLayerPanel } from "@/composables/useLayerPanel";
import type { ApiKeyName } from "@/lib/providers/types";

const { camera, installHistoryListener } = useAppState();
const { panelOpen, togglePanel } = useLayerPanel();

useKeyboardShortcuts();

// The camera flows one way — panes -> useCamera -> URL — and that is now enforced by useCamera
// owning both ends rather than wired up here. Nothing to hand in, and no way to close the loop.
installHistoryListener();

const keysOpen = ref(false);
const sourcesOpen = ref(false);
const focusKey = ref<ApiKeyName | undefined>();

function openKeys(key?: ApiKeyName) {
  focusKey.value = key;
  keysOpen.value = true;
}
</script>

<template>
  <div class="bg-ink-950 flex h-full flex-col">
    <header class="border-ink-700 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <h1 class="text-sm font-semibold tracking-tight">map<span class="text-accent">compare</span></h1>
      <ModeSwitcher />
      <LabelToggle />
      <PresetMenu />
      <ShareButton />

      <div class="ml-auto flex items-center gap-2">
        <span class="text-ink-400 font-mono text-[11px] tabular-nums"> {{ camera.center[1].toFixed(5) }}, {{ camera.center[0].toFixed(5) }} · z{{ camera.zoom.toFixed(2) }} </span>

        <!-- One button, because everything about layers now lives behind it: the catalogue, the
             licence notes, the API keys and the sources table. -->
        <button
          type="button"
          class="rounded border px-2 py-1.5 text-xs transition-colors"
          :class="panelOpen ? 'border-accent/70 bg-accent text-ink-950 font-medium' : 'border-ink-700 bg-ink-900 text-ink-200 hover:bg-ink-800'"
          :aria-pressed="panelOpen"
          title="Layer manager"
          @click="togglePanel"
        >
          Layers
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <main class="min-h-0 flex-1">
        <MapDeck />
      </main>

      <LayerManager v-if="panelOpen" @open-keys="openKeys" @open-sources="sourcesOpen = true" />
    </div>

    <KeysDialog v-model:open="keysOpen" :focus-key="focusKey" />
    <SourcesDialog v-model:open="sourcesOpen" />
  </div>
</template>
