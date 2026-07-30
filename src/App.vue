<script setup lang="ts">
import { onScopeDispose, ref } from "vue";

import KeysDialog from "@/components/KeysDialog.vue";
import LabelToggle from "@/components/LabelToggle.vue";
import MapDeck from "@/components/MapDeck.vue";
import ModeSwitcher from "@/components/ModeSwitcher.vue";
import PresetMenu from "@/components/PresetMenu.vue";
import ShareButton from "@/components/ShareButton.vue";
import SourcesDialog from "@/components/SourcesDialog.vue";
import { useApiKeys } from "@/composables/useApiKeys";
import { useAppState } from "@/composables/useAppState";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useMapSync } from "@/composables/useMapSync";
import { PROVIDERS } from "@/lib/providers/registry";
import type { ApiKeyName } from "@/lib/providers/types";

const { camera, installHistoryListener } = useAppState();
const { onChange, applyCamera } = useMapSync();
const { sources } = useApiKeys();

useKeyboardShortcuts();

// The camera flows one way: sync group -> state -> URL. Nothing watches `camera` back into
// applyCamera, because a delayed echo is the one feedback loop the sync group's synchronous
// guard cannot catch. Deliberate group-wide moves (presets, popstate) call applyCamera
// directly instead, which is why the history listener is handed it here.
onScopeDispose(onChange((next) => (camera.value = next)));
installHistoryListener(applyCamera);

const keysOpen = ref(false);
const sourcesOpen = ref(false);
const focusKey = ref<ApiKeyName | undefined>();

function openKeys(key?: ApiKeyName) {
  focusKey.value = key;
  keysOpen.value = true;
}

function gatedCount(): number {
  return PROVIDERS.filter((p) => p.requiresKey && sources.value[p.requiresKey] === "none").length;
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
        <button type="button" class="border-ink-700 bg-ink-900 text-ink-200 hover:bg-ink-800 rounded border px-2 py-1.5 text-xs" @click="sourcesOpen = true">Sources</button>
        <button type="button" class="border-ink-700 bg-ink-900 text-ink-200 hover:bg-ink-800 rounded border px-2 py-1.5 text-xs" @click="openKeys()">
          Keys<span v-if="gatedCount() > 0" class="text-ink-400 ml-1">{{ gatedCount() }}</span>
        </button>
      </div>
    </header>

    <main class="min-h-0 flex-1">
      <MapDeck @open-keys="openKeys" />
    </main>

    <KeysDialog v-model:open="keysOpen" :focus-key="focusKey" />
    <SourcesDialog v-model:open="sourcesOpen" />
  </div>
</template>
