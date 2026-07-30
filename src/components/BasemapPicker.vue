<script setup lang="ts">
import { computed } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { groupByOperator, providerStatuses } from "@/lib/providers/availability";
import { PROVIDERS } from "@/lib/providers/registry";
import type { PaneLayer } from "@/lib/providers/types";
import { resolveVariant, variantValues } from "@/lib/providers/variants";

const props = defineProps<{ layer: PaneLayer }>();
const emit = defineEmits<{ update: [layer: PaneLayer] }>();

const { keys } = useApiKeys();

const groups = computed(() => groupByOperator(providerStatuses(PROVIDERS, keys.value)));
const current = computed(() => PROVIDERS.find((p) => p.id === props.layer.providerId));

const variants = computed(() => (current.value?.variant ? variantValues(current.value.variant) : []));
const selectedVariant = computed(() => {
  const spec = current.value?.variant;
  if (!spec) return "";
  return resolveVariant(spec, props.layer.variant, new Date());
});

function pickProvider(event: Event) {
  const providerId = (event.target as HTMLSelectElement).value;
  // Drop any variant: it belongs to the old provider and would be meaningless here.
  emit("update", { providerId });
}

function pickVariant(event: Event) {
  emit("update", { providerId: props.layer.providerId, variant: (event.target as HTMLSelectElement).value });
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <select
      :value="props.layer.providerId"
      class="border-ink-600/70 bg-ink-900/90 text-ink-50 focus:border-accent max-w-[13rem] truncate rounded border px-1.5 py-1 text-xs backdrop-blur focus:outline-none"
      @change="pickProvider"
    >
      <optgroup v-for="group in groups" :key="group.operator" :label="group.operator">
        <!-- Unavailable providers stay listed and merely disabled: hiding them would destroy
             the discovery value, which is most of the point of this app. -->
        <option v-for="entry in group.entries" :key="entry.provider.id" :value="entry.provider.id" :disabled="!entry.enabled">
          {{ entry.provider.label }}{{ entry.enabled ? "" : " — needs a key" }}
        </option>
      </optgroup>
    </select>

    <select
      v-if="variants.length > 0"
      :value="selectedVariant"
      :aria-label="current?.variant?.label"
      class="border-ink-600/70 bg-ink-900/90 text-ink-50 focus:border-accent rounded border px-1.5 py-1 font-mono text-xs backdrop-blur focus:outline-none"
      @change="pickVariant"
    >
      <option v-for="value in variants" :key="value.value" :value="value.value">{{ value.label }}</option>
    </select>
  </div>
</template>
