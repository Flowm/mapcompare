<script setup lang="ts">
import { computed } from "vue";

import type { PaneCredit } from "@/composables/useResolvedStyle";
import { sanitizeAttributionHtml } from "@/lib/attribution";

const props = defineProps<{
  /** Undefined until the pane has a style applied — see the template for why that gates the mark. */
  credit: PaneCredit | undefined;
  /** Which side the pane's chrome sits on, so the block aligns with the rest of it. */
  side: "left" | "right";
}>();

/**
 * Sanitized here, at the last possible moment, because this is the only place the strings meet
 * `v-html`. For style-URL providers they arrive from a fetched third-party document.
 */
const parts = computed(() => (props.credit?.parts ?? []).map(sanitizeAttributionHtml));

const plain = computed(() => parts.value.map((p) => p.replaceAll(/<[^>]*>/g, "")).join(" · "));
</script>

<template>
  <!-- Rendered per pane, and inside the pane, so it stays with the imagery it credits. In swipe
       mode this is why MapLibre's own control is disabled: it would be clipped away with the top
       pane, which is a licensing failure rather than a cosmetic one. The wordmark is in here with
       the text for exactly the same reason — one block, one side, clipped or visible together. -->
  <div v-if="credit" class="flex max-w-full flex-col gap-1" :class="props.side === 'left' ? 'items-start' : 'items-end'">
    <div v-if="parts.length > 0" class="bg-ink-950/70 text-ink-200 pointer-events-auto max-w-full truncate rounded px-1.5 py-0.5 text-[10px] backdrop-blur" :title="plain">
      <span v-for="(part, i) in parts" :key="i" class="attribution">
        <span v-if="i > 0" aria-hidden="true"> · </span>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized above; links must stay clickable -->
        <span v-html="part" />
      </span>
    </div>

    <!-- Vendor artwork, shown verbatim: no plate, no filter, no size override. Both marks are drawn
         white-on-dark-outline for imagery already, and both licences forbid restyling them.
         `width`/`height` are the file's own, so the block does not reflow when the SVG lands. -->
    <a v-for="wordmark in credit.wordmarks" :key="wordmark.src" :href="wordmark.href" target="_blank" rel="noreferrer noopener" class="pointer-events-auto block">
      <img :src="wordmark.src" :alt="wordmark.alt" :width="wordmark.width" :height="wordmark.height" />
    </a>
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
