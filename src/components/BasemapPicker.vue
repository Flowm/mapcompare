<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { computed, ref } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { groupByOperator, providerStatuses } from "@/lib/providers/availability";
import { licenceInfo } from "@/lib/providers/licence";
import { PROVIDERS } from "@/lib/providers/registry";
import type { ApiKeyName, PaneLayer, Provider } from "@/lib/providers/types";
import { resolveVariant, variantValues } from "@/lib/providers/variants";

const props = defineProps<{ layer: PaneLayer; align?: "left" | "right" }>();
const emit = defineEmits<{ update: [layer: PaneLayer]; "open-keys": [key: ApiKeyName] }>();

const { keys } = useApiKeys();

const open = ref(false);
const root = ref<HTMLElement>();
onClickOutside(root, () => (open.value = false));

const statuses = computed(() => providerStatuses(PROVIDERS, keys.value));
const groups = computed(() => groupByOperator(statuses.value));
const gatedCount = computed(() => statuses.value.filter((s) => !s.enabled).length);

const current = computed(() => PROVIDERS.find((p) => p.id === props.layer.providerId));
const variants = computed(() => (current.value?.variant ? variantValues(current.value.variant) : []));
const selectedVariant = computed(() => (current.value?.variant ? resolveVariant(current.value.variant, props.layer.variant, new Date()) : ""));

const SEVERITY_CLASS = { ok: "text-tier-open", warn: "text-tier-terms", bad: "text-tier-restricted" } as const;

function choose(provider: Provider) {
  // The old variant belonged to the old provider and would be meaningless here.
  emit("update", { providerId: provider.id });
  open.value = false;
}

function pickVariant(event: Event) {
  emit("update", { providerId: props.layer.providerId, variant: (event.target as HTMLSelectElement).value });
}
</script>

<template>
  <div ref="root" class="relative flex items-center gap-1.5">
    <button
      type="button"
      class="border-ink-600/70 bg-ink-950/85 text-ink-50 hover:bg-ink-800 max-w-[14rem] truncate rounded border px-2 py-1 text-left text-xs backdrop-blur transition-colors"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      {{ current?.label ?? layer.providerId }}
      <span class="text-ink-400">▾</span>
    </button>

    <select
      v-if="variants.length > 0"
      :value="selectedVariant"
      :aria-label="current?.variant?.label"
      class="border-ink-600/70 bg-ink-950/85 text-ink-50 focus:border-accent rounded border px-1.5 py-1 font-mono text-xs backdrop-blur focus:outline-none"
      @change="pickVariant"
    >
      <option v-for="value in variants" :key="value.value" :value="value.value">{{ value.label }}</option>
    </select>

    <div
      v-if="open"
      class="border-ink-700 bg-ink-900/98 absolute top-full left-0 z-40 mt-1 max-h-[70vh] w-96 overflow-y-auto rounded border shadow-xl backdrop-blur"
      role="listbox"
    >
      <p v-if="gatedCount > 0" class="border-ink-800 text-ink-400 border-b px-3 py-2 text-[11px]">
        {{ gatedCount }} provider{{ gatedCount === 1 ? "" : "s" }} need an API key. They stay listed so you can see what they'd cost.
      </p>

      <div v-for="group in groups" :key="group.operator">
        <p class="bg-ink-800/95 text-ink-400 sticky top-0 px-3 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{{ group.operator }}</p>

        <!-- Unavailable providers are shown greyed rather than hidden. Hiding them would remove
             the discovery this app exists for: knowing a layer exists, and what it would cost,
             is most of the value. -->
        <div v-for="entry in group.entries" :key="entry.provider.id" class="border-ink-800/60 border-b px-3 py-2 last:border-b-0" :class="entry.enabled ? 'hover:bg-ink-800' : ''">
          <button
            type="button"
            class="block w-full text-left"
            :class="entry.enabled ? '' : 'cursor-default'"
            role="option"
            :aria-selected="entry.provider.id === layer.providerId"
            :aria-disabled="!entry.enabled"
            @click="entry.enabled && choose(entry.provider)"
          >
            <span class="flex items-baseline justify-between gap-2">
              <span class="text-xs font-medium" :class="entry.enabled ? 'text-ink-50' : 'text-ink-400'">
                {{ entry.provider.label }}
                <span v-if="entry.provider.id === layer.providerId" class="text-accent">·</span>
              </span>
              <span class="shrink-0 text-[10px]" :class="SEVERITY_CLASS[licenceInfo(entry.provider.licence.tier).severity]">
                {{ licenceInfo(entry.provider.licence.tier).label }}
              </span>
            </span>
            <span class="mt-0.5 block text-[11px] leading-snug" :class="entry.enabled ? 'text-ink-400' : 'text-ink-600'">{{ entry.provider.note }}</span>
          </button>

          <div v-if="entry.disabled" class="text-ink-400 mt-1.5 text-[11px] leading-snug">
            <p>{{ entry.disabled.message }}</p>
            <div class="mt-1 flex items-center gap-2">
              <button type="button" class="border-ink-600 text-ink-200 hover:bg-ink-800 rounded border px-1.5 py-0.5 text-[10px]" @click="emit('open-keys', entry.disabled.key)">
                Add key
              </button>
              <a v-if="entry.disabled.keyUrl" :href="entry.disabled.keyUrl" target="_blank" rel="noreferrer noopener" class="text-accent text-[10px] hover:underline">
                Get one free ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
