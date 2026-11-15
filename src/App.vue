<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed, ref } from "vue";

import KeysDialog from "@/components/KeysDialog.vue";
import LabelToggle from "@/components/LabelToggle.vue";
import LayerManager from "@/components/LayerManager.vue";
import LocationSearch from "@/components/LocationSearch.vue";
import MapDeck from "@/components/MapDeck.vue";
import ModeSwitcher from "@/components/ModeSwitcher.vue";
import { pressed } from "@/components/pressed";
import PWAUpdateBar from "@/components/PWAUpdateBar.vue";
import ShareButton from "@/components/ShareButton.vue";
import SourcesDialog from "@/components/SourcesDialog.vue";
import { useAppState } from "@/composables/useAppState";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { useShare } from "@/composables/useShare";
import type { ApiKeyName } from "@/lib/layers/types";

const { camera, labels, setLabels, installHistoryListener } = useAppState();
const { managerOpen, toggleManager } = useLayerPanel();
const { share } = useShare();

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

/** On a phone the header has room for the essentials only; the rest waits behind this menu. */
const overflowItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: "Copy link", icon: "i-lucide-link", onSelect: () => share("toast") },
    {
      label: "Map labels",
      description: "Names, roads and borders from OpenFreeMap",
      icon: "i-lucide-tags",
      type: "checkbox",
      checked: labels.value,
      onUpdateChecked: (checked: boolean) => setLabels(checked),
    },
  ],
  [
    { label: "API keys", icon: "i-lucide-key-round", onSelect: () => openKeys() },
    { label: "Sources & licences", icon: "i-lucide-book-open", onSelect: () => (sourcesOpen.value = true) },
  ],
]);
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
    <div class="bg-ink-950 flex h-dvh flex-col">
      <!-- Below lg the header's buttons keep their icons and give up their words, which screen
           readers still hear. One rule for the whole bar, so a new button cannot forget it. -->
      <header
        class="border-default flex shrink-0 items-center gap-2 border-b py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pr-[calc(0.75rem+env(safe-area-inset-right))] pl-[calc(0.75rem+env(safe-area-inset-left))] max-lg:[&_[data-slot=label]]:sr-only"
      >
        <h1 class="shrink-0 text-sm font-semibold tracking-tight">map<span class="text-primary">compare</span></h1>
        <ModeSwitcher />
        <LocationSearch />

        <div class="ml-auto flex items-center gap-2">
          <span class="text-muted hidden font-mono text-[11px] tabular-nums md:inline">
            {{ camera.center[1].toFixed(5) }}, {{ camera.center[0].toFixed(5) }} · z{{ camera.zoom.toFixed(2) }}
          </span>

          <div class="hidden items-center gap-2 md:flex">
            <ShareButton />
            <LabelToggle />
          </div>

          <!-- One button, because everything about layers lives behind it: the catalogue, the
               licence notes, the API keys and the sources table. A side column on desktop, a
               drawer on a phone; LayerManager decides which. -->
          <UTooltip text="Layer manager">
            <UButton icon="i-lucide-layers" label="Layers" size="sm" v-bind="pressed(managerOpen)" @click="toggleManager" />
          </UTooltip>

          <UDropdownMenu :items="overflowItems" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis-vertical" size="sm" color="neutral" variant="ghost" aria-label="More" class="md:hidden" />
          </UDropdownMenu>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        <!-- Insets keep pane chrome — the credits above all — clear of a notch and the home indicator. -->
        <main class="min-h-0 flex-1 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
          <MapDeck />
        </main>

        <LayerManager @open-keys="openKeys" @open-sources="sourcesOpen = true" />
      </div>

      <KeysDialog v-model:open="keysOpen" :focus-key="focusKey" />
      <SourcesDialog v-model:open="sourcesOpen" />
      <PWAUpdateBar />
    </div>
  </UApp>
</template>
