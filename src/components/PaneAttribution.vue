<script setup lang="ts">
import { computed } from "vue";

import { collectAttribution, dedupeAttribution, sanitizeAttributionHtml, type StyleLike } from "@/lib/attribution";

const props = defineProps<{ style: StyleLike | undefined }>();

/**
 * Derived from the APPLIED style rather than from the provider descriptor, so raster providers,
 * fetched vendor styles and the label overlay all converge on one code path and none of them can
 * be silently missed.
 */
const parts = computed(() => (props.style ? dedupeAttribution(collectAttribution(props.style)).map(sanitizeAttributionHtml) : []));

const plain = computed(() => parts.value.map((p) => p.replaceAll(/<[^>]*>/g, "")).join(" · "));
</script>

<template>
  <!-- Rendered per pane, and inside the pane, so it stays with the imagery it credits. In swipe
       mode this is why MapLibre's own control is disabled: it would be clipped away with the top
       pane, which is a licensing failure rather than a cosmetic one. -->
  <div v-if="parts.length > 0" class="bg-ink-950/70 text-ink-200 pointer-events-auto max-w-full truncate rounded px-1.5 py-0.5 text-[10px] backdrop-blur" :title="plain">
    <span v-for="(part, i) in parts" :key="i" class="attribution">
      <span v-if="i > 0" aria-hidden="true"> · </span>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized above; links must stay clickable -->
      <span v-html="part" />
    </span>
  </div>
</template>

<style scoped>
.attribution :deep(a) {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
}

.attribution :deep(a:hover) {
  text-decoration-color: currentColor;
}
</style>
