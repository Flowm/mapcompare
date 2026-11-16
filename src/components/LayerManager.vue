<script setup lang="ts">
import LayerManagerActions from "@/components/LayerManagerActions.vue";
import LayerManagerBody from "@/components/LayerManagerBody.vue";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { useViewport } from "@/composables/useViewport";
import type { ApiKeyName } from "@/lib/layers/types";

/**
 * Where the layer manager lives: a side column on desktop, a bottom drawer on a phone.
 *
 * The column pushes the map narrower rather than covering it, so a comparison never hides under
 * the catalogue. A phone has no width to give, so there the drawer opens at half height first,
 * keeping the map in view while layers are tried; drag it up for the whole catalogue.
 */

const emit = defineEmits<{ "open-keys": [key?: ApiKeyName]; "open-sources": []; "add-layer": [] }>();

const { managerOpen, closeManager } = useLayerPanel();
const { isCompact } = useViewport();
</script>

<template>
  <UDrawer v-if="isCompact" v-model:open="managerOpen" title="Layers" :snap-points="[0.55, 1]" :ui="{ content: 'h-[95dvh]', body: 'flex min-h-0 flex-col p-0 sm:p-0' }">
    <!-- In the header, not a footer: at half height the drawer's bottom edge is below the screen. -->
    <template #actions>
      <LayerManagerActions @open-keys="emit('open-keys')" @open-sources="emit('open-sources')" />
    </template>
    <template #body>
      <LayerManagerBody :footer="false" @open-keys="emit('open-keys', $event)" @open-sources="emit('open-sources')" @add-layer="emit('add-layer')" />
    </template>
  </UDrawer>

  <aside v-else-if="managerOpen" class="border-default bg-ink-950 flex w-[18rem] shrink-0 flex-col border-l pb-[env(safe-area-inset-bottom)]" aria-label="Layer manager">
    <div class="border-default flex shrink-0 items-center gap-1 border-b px-2.5 py-1">
      <h2 class="text-toned flex-1 text-xs font-medium">Layers</h2>
      <UTooltip text="Hide the layer manager">
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="Hide the layer manager" @click="closeManager" />
      </UTooltip>
    </div>
    <LayerManagerBody @open-keys="emit('open-keys', $event)" @open-sources="emit('open-sources')" @add-layer="emit('add-layer')" />
  </aside>
</template>
