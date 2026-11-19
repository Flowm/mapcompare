<script setup lang="ts">
import { computed } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { useDialogs } from "@/composables/useDialogs";
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

const { keys } = useApiKeys();
const { openKeys, openSources } = useDialogs();
const gatedCount = computed(() => layerStatuses(LAYERS, keys.value).filter((s) => !s.enabled).length);
</script>

<template>
  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-key-round" @click="openKeys()">
    API keys<span v-if="gatedCount > 0" class="text-muted">{{ gatedCount }}<span class="sr-only"> layers need one</span></span>
  </UButton>
  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-book-open" label="Sources &amp; licences" @click="openSources" />
</template>
