<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

import { useAppState } from "@/composables/useAppState";
import { type Preset, PRESETS } from "@/lib/presets";

const { applyPreset } = useAppState();

const open = ref(false);
const root = ref<HTMLElement>();
onClickOutside(root, () => (open.value = false));

function choose(preset: Preset) {
  applyPreset(preset);
  open.value = false;
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="border-ink-700 bg-ink-900 text-ink-200 hover:bg-ink-800 rounded border px-2 py-1.5 text-xs transition-colors"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      Places
    </button>

    <div v-if="open" class="border-ink-700 bg-ink-900/98 absolute top-full left-0 z-30 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded border shadow-xl backdrop-blur" role="menu">
      <button
        v-for="preset in PRESETS"
        :key="preset.name"
        type="button"
        class="border-ink-800 hover:bg-ink-800 block w-full border-b px-3 py-2 text-left last:border-b-0"
        role="menuitem"
        @click="choose(preset)"
      >
        <span class="flex items-baseline justify-between gap-2">
          <span class="text-ink-50 text-xs font-medium">{{ preset.name }}</span>
          <span class="text-ink-400 shrink-0 font-mono text-[10px]">z{{ preset.zoom }}</span>
        </span>
        <!-- The reason is the point of the entry, not decoration: it says what to look for. -->
        <span class="text-ink-400 mt-0.5 block text-[11px] leading-snug">{{ preset.why }}</span>
      </button>
    </div>
  </div>
</template>
