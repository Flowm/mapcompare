<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed } from "vue";

import { useAppState } from "@/composables/useAppState";
import { type Mode, MODE_LABELS } from "@/lib/mode";

const { mode, setMode } = useAppState();

const GRID_MODES: Mode[] = ["g1", "g2", "g3", "g4"];
const STACKED_MODES: Mode[] = ["sw", "bl"];

const ICONS: Record<Mode, string> = {
  g1: "i-lucide-square",
  g2: "i-lucide-columns-2",
  g3: "i-lucide-columns-3",
  g4: "i-lucide-grid-2x2",
  sw: "i-lucide-square-split-horizontal",
  bl: "i-lucide-eye",
};

/** The keyboard shortcut for each mode, from useKeyboardShortcuts. */
const KEYS: Record<Mode, string> = { g1: "1", g2: "2", g3: "3", g4: "4", sw: "s", bl: "b" };

const HINTS: Partial<Record<Mode, string>> = {
  sw: "drag the divider",
  bl: "hold B to peek, Space to flip",
};

function tooltip(m: Mode): string {
  const hint = HINTS[m];
  return hint ? `${MODE_LABELS[m]} — ${hint}` : MODE_LABELS[m];
}

/** The phone's menu: the same modes, grouped as the two button groups are. */
const menuItems = computed<DropdownMenuItem[][]>(() =>
  [GRID_MODES, STACKED_MODES].map((group) =>
    group.map((m) => ({
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
    <UFieldGroup v-for="(group, i) in [GRID_MODES, STACKED_MODES]" :key="i" size="sm" :aria-label="i === 0 ? 'Pane layout' : 'Comparison mode'">
      <UTooltip v-for="m in group" :key="m" :text="tooltip(m)" :kbds="[KEYS[m]]">
        <UButton
          :icon="ICONS[m]"
          :label="i === 1 ? MODE_LABELS[m] : undefined"
          :color="mode === m ? 'primary' : 'neutral'"
          :variant="mode === m ? 'solid' : 'outline'"
          :aria-label="MODE_LABELS[m]"
          :aria-pressed="mode === m"
          @click="setMode(m)"
        />
      </UTooltip>
    </UFieldGroup>
  </div>

  <UDropdownMenu :items="menuItems" :content="{ align: 'start' }" class="md:hidden">
    <UButton :icon="ICONS[mode]" trailing-icon="i-lucide-chevron-down" size="sm" color="neutral" variant="outline" :aria-label="`Mode: ${MODE_LABELS[mode]}`" class="md:hidden" />
  </UDropdownMenu>
</template>
