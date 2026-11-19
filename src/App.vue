<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { useToast } from "@nuxt/ui/composables/useToast";
import { computed, watch } from "vue";

import AddLayerDialog from "@/components/AddLayerDialog.vue";
import CameraReadout from "@/components/CameraReadout.vue";
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
import { useCatalogue } from "@/composables/useCatalogue";
import { useDialogs } from "@/composables/useDialogs";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { useShare } from "@/composables/useShare";

const { labels, setLabels, installHistoryListener } = useAppState();
const { managerOpen, toggleManager } = useLayerPanel();
const { share } = useShare();
const { restoredByLink } = useCatalogue();
const toast = useToast();

// Going Back to a link that showed a Layer the user has since removed shows it again, which is right —
// that is what the link describes — but would read as a removal that did not work unless it is said.
watch(restoredByLink, (layers) => {
  if (layers.length === 0) return;
  toast.add({
    title: "Shown again from this link",
    description: `${layers.map((l) => l.label).join(", ")}: for this session only. Remove it again, or keep it from the layer manager.`,
    icon: "i-lucide-history",
  });
});

useKeyboardShortcuts();

// The camera flows one way — panes -> useCamera -> URL — and that is now enforced by useCamera
// owning both ends rather than wired up here. Nothing to hand in, and no way to close the loop.
installHistoryListener();

const { keysOpen, focusKey, sourcesOpen, addLayerOpen } = useDialogs();

/** A constant, so the app shell does not hand UApp a new object, and re-render it, on every render. */
const TOASTER = { position: "bottom-right" } as const;

/**
 * On a phone the header has room for the essentials only, so the Share and Labels buttons wait
 * behind this menu. Only those: API keys, adding a layer and the sources table are in the layer
 * manager's drawer, one tap away, and listing them twice made this menu longer for nothing.
 */
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
]);
</script>

<template>
  <UApp :toaster="TOASTER">
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
          <!-- From lg only: between md and lg it squeezed the search and wrapped onto two lines. -->
          <CameraReadout class="hidden lg:inline" />

          <div class="roomy:flex hidden items-center gap-2">
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
            <UButton icon="i-lucide-ellipsis-vertical" size="sm" color="neutral" variant="ghost" aria-label="More" class="roomy:hidden" />
          </UDropdownMenu>
        </div>
      </header>

      <!-- Insets keep pane chrome — the credits above all — and the side column clear of a notch and
           the home indicator. The side insets go on the row, so the column is inset too, and the
           map does not get an empty gutter between itself and the column. -->
      <div class="flex min-h-0 flex-1 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main class="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
          <MapDeck />
        </main>

        <LayerManager />
      </div>

      <KeysDialog v-model:open="keysOpen" :focus-key="focusKey" />
      <SourcesDialog v-model:open="sourcesOpen" />
      <AddLayerDialog v-model:open="addLayerOpen" />
      <PWAUpdateBar />
    </div>
  </UApp>
</template>
