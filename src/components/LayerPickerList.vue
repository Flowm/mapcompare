<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";
import { computed, ref } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { useCatalogue } from "@/composables/useCatalogue";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { groupLayers, layerStatuses, providerLabel } from "@/lib/layers/availability";
import { licenceClasses } from "@/lib/layers/licence";
import type { Layer } from "@/lib/layers/types";

/**
 * The searchable list inside a pane's picker, the same in the desktop popover and the phone drawer.
 *
 * One line per Layer and only the Layers that work right now: see LayerPicker for why both.
 */

const props = defineProps<{ selected: string; autofocus?: boolean }>();
const emit = defineEmits<{ choose: [layer: Layer]; manager: [] }>();

const { keys } = useApiKeys();
const { groupBy } = useLayerPanel();
const { catalogue } = useCatalogue();

const query = ref("");

const statuses = computed(() => layerStatuses(catalogue.value, keys.value));
const available = computed(() => statuses.value.filter((s) => s.enabled));
const gatedCount = computed(() => statuses.value.length - available.value.length);

interface LayerItem extends CommandPaletteItem {
  dot: string;
}

/** Filtered here rather than by the palette, so the provider's name matches too. */
const groups = computed<CommandPaletteGroup[]>(() => {
  const term = query.value.trim().toLowerCase();
  const matching = term === "" ? available.value : available.value.filter((s) => `${s.layer.label} ${providerLabel(s.layer)}`.toLowerCase().includes(term));
  return groupLayers(matching, groupBy.value).map((group) => ({
    id: group.key,
    label: group.label,
    ignoreFilter: true,
    items: group.entries.map((entry): LayerItem => ({
      label: entry.layer.label,
      active: entry.layer.id === props.selected,
      dot: licenceClasses(entry.layer).dot,
      onSelect: () => emit("choose", entry.layer),
    })),
  }));
});
</script>

<template>
  <UCommandPalette
    v-model:search-term="query"
    :groups="groups"
    :autofocus="autofocus"
    placeholder="Switch layer…"
    size="sm"
    class="max-h-[min(340px,60dvh)]"
    :ui="{ item: 'py-1 pointer-coarse:py-2', group: 'p-1', label: 'py-1' }"
  >
    <!-- Centred on the row: the palette aligns items to the top, which puts a 6px dot above the
         middle of the label beside it. -->
    <template #item-leading="{ item }">
      <span class="size-1.5 shrink-0 self-center rounded-full" :class="(item as LayerItem).dot" />
    </template>

    <!-- The pane's own Layer, marked: the list otherwise gives no hint of what is on the map. -->
    <template #item-trailing="{ item }">
      <template v-if="item.active">
        <UIcon name="i-lucide-check" class="text-primary size-3.5 shrink-0 self-center" aria-hidden="true" />
        <span class="sr-only">(current)</span>
      </template>
    </template>

    <template #empty>
      <p class="text-muted px-3 py-4 text-xs">No layer matches “{{ query }}”.</p>
    </template>

    <!-- The way out to the wordy surface, and the only trace of what was filtered out. One
         line: the count is a nudge, not an explanation, and the manager does the explaining. -->
    <template #footer>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide-arrow-right"
        class="text-muted w-full"
        :aria-label="gatedCount > 0 ? `Layer manager, ${gatedCount} more layers need an API key` : 'Layer manager'"
        @click="emit('manager')"
      >
        <span class="flex-1 text-left">Layer manager</span>
        <UBadge v-if="gatedCount > 0" size="sm" color="neutral" variant="outline" :label="`+${gatedCount} with a key`" />
      </UButton>
    </template>
  </UCommandPalette>
</template>
