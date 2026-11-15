<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed } from "vue";

import { pressed } from "@/components/pressed";
import { useAppState } from "@/composables/useAppState";
import { useViewport } from "@/composables/useViewport";
import { isStacked, type Mode, MODE_ICONS, MODE_KEYS, MODE_LABELS, MODES } from "@/lib/mode";

const { mode, setMode } = useAppState();
const { isCompact } = useViewport();

/**
 * Two groups: how many panes tile the deck, and the two stacked comparisons. Only the stacked ones
 * carry a word on desktop; the pane counts read from their icons.
 */
const GROUPS: { label: string; modes: Mode[]; labelled: boolean }[] = [
  { label: "Pane layout", modes: MODES.filter((m) => !isStacked(m)), labelled: false },
  { label: "Comparison mode", modes: MODES.filter(isStacked), labelled: true },
];

/** The phone's menu: the same modes, grouped as the button groups are. */
const menuItems = computed<DropdownMenuItem[][]>(() =>
  GROUPS.map((group) =>
    group.modes.map((m) => ({
      label: MODE_LABELS[m],
      icon: MODE_ICONS[m],
      type: "checkbox" as const,
      checked: mode.value === m,
      onSelect: () => setMode(m),
    })),
  ),
);
</script>

<template>
  <UDropdownMenu v-if="isCompact" :items="menuItems" :content="{ align: 'start' }">
    <UButton :icon="MODE_ICONS[mode]" trailing-icon="i-lucide-chevron-down" size="sm" color="neutral" variant="outline" :aria-label="`Mode: ${MODE_LABELS[mode]}`" />
  </UDropdownMenu>

  <div v-else class="flex items-center gap-1.5">
    <UFieldGroup v-for="group in GROUPS" :key="group.label" size="sm" :aria-label="group.label">
      <UTooltip v-for="m in group.modes" :key="m" :text="MODE_LABELS[m]" :kbds="[MODE_KEYS[m]]">
        <UButton :icon="MODE_ICONS[m]" :label="group.labelled ? MODE_LABELS[m] : undefined" v-bind="pressed(mode === m)" :aria-label="MODE_LABELS[m]" @click="setMode(m)" />
      </UTooltip>
    </UFieldGroup>
  </div>
</template>
