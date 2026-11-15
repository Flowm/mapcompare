<script setup lang="ts">
import { computed } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { layerStatuses } from "@/lib/layers/availability";
import { LAYERS } from "@/lib/layers/registry";

/**
 * The layer manager's two ways out: the API keys and the sources table.
 *
 * They belong to the catalogue, not to the app header: one is why some rows are greyed out, the
 * other is the long form of the licence word on every row. Each shell pins them where they stay
 * in view, which on a phone means the drawer's header, since its bottom edge is below the screen
 * at half height.
 */

const emit = defineEmits<{ "open-keys": []; "open-sources": [] }>();

const { keys } = useApiKeys();
const gatedCount = computed(() => layerStatuses(LAYERS, keys.value).filter((s) => !s.enabled).length);
</script>

<template>
  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-key-round" @click="emit('open-keys')">
    API keys<span v-if="gatedCount > 0" class="text-muted">{{ gatedCount }}</span>
  </UButton>
  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-book-open" label="Sources &amp; licences" @click="emit('open-sources')" />
</template>
