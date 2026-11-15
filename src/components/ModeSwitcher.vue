<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed } from "vue";

import { useAppState } from "@/composables/useAppState";
import { type Mode, MODE_KEYS, MODE_LABELS } from "@/lib/mode";

const { mode, setMode } = useAppState();

/**
 * Two groups: how many panes tile the deck, and the two stacked comparisons. Only the stacked ones
 * carry a word on desktop; the pane counts read from their icons.
 */
const GROUPS: { label: string; modes: Mode[]; labelled: boolean }[] = [
  { label: "Pane layout", modes: ["g1", "g2", "g3", "g4"], labelled: false },
  { label: "Comparison mode", modes: ["sw", "bl"], labelled: true },
];

const ICONS: Record<Mode, string> = {
  g1: "i-lucide-square",
  g2: "i-lucide-columns-2",
  g3: "i-lucide-columns-3",
  g4: "i-lucide-grid-2x2",
  sw: "i-lucide-square-split-horizontal",
  bl: "i-lucide-eye",
};

/** The phone's menu: the same modes, grouped as the button groups are. */
const menuItems = computed<DropdownMenuItem[][]>(() =>
  GROUPS.map((group) =>
    group.modes.map((m) => ({
      label: MODE_LABELS[m],
      icon: ICONS[m],
      type: "checkbox" as const,
      checked: mode.value === m,
      onSelect: () => setMode(m),
    })),
  ),
);
</script>

<template>
  <div class="hidden items-center gap-1.5 md:flex">
    <UFieldGroup v-for="group in GROUPS" :key="group.label" size="sm" :aria-label="group.label">
      <UTooltip v-for="m in group.modes" :key="m" :text="MODE_LABELS[m]" :kbds="[MODE_KEYS[m]]">
        <UButton
          :icon="ICONS[m]"
          :label="group.labelled ? MODE_LABELS[m] : undefined"
          :ui="{ label: 'max-lg:sr-only' }"
          :color="mode === m ? 'primary' : 'neutral'"
          :variant="mode === m ? 'solid' : 'outline'"
          :aria-label="MODE_LABELS[m]"
          :aria-pressed="mode === m"
          @click="setMode(m)"
        />
      </UTooltip>
    </UFieldGroup>
  </div>

  <UDropdownMenu :items="menuItems" :content="{ align: 'start' }">
    <UButton :icon="ICONS[mode]" trailing-icon="i-lucide-chevron-down" size="sm" color="neutral" variant="outline" :aria-label="`Mode: ${MODE_LABELS[mode]}`" class="md:hidden" />
  </UDropdownMenu>
</template>
