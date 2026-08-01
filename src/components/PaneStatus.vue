<script setup lang="ts">
import { computed } from "vue";

import { useAppState } from "@/composables/useAppState";
import { useMapSync } from "@/composables/useMapSync";
import { licenceInfo } from "@/lib/providers/licence";
import type { Provider } from "@/lib/providers/types";
import { vintageFor } from "@/lib/providers/variants";
import { formatZoomFit, shortZoomFit, zoomFit, zoomSeverity } from "@/lib/zoomFit";

const props = defineProps<{ provider: Provider; variant: string | undefined; failedTiles: number }>();

const { camera } = useAppState();
const { applyCamera } = useMapSync();

const licence = computed(() => licenceInfo(props.provider.licence.tier));
const fit = computed(() => zoomFit(props.provider, camera.value.zoom));
const fitSeverity = computed(() => zoomSeverity(fit.value));
const vintage = computed(() => vintageFor(props.provider, props.variant));

const SEVERITY_CLASS = {
  ok: "border-tier-open/40 bg-ink-950/75 text-tier-open",
  warn: "border-tier-terms/40 bg-ink-950/75 text-tier-terms",
  bad: "border-tier-restricted/40 bg-ink-950/75 text-tier-restricted",
} as const;

/** Drops the whole group to this pane's native ceiling, for an apples-to-apples look. */
function zoomToNative() {
  if (fit.value.kind !== "upscaled") return;
  applyCamera({ ...camera.value, zoom: fit.value.nativeMax });
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-end gap-1 text-[10px] leading-none">
    <span class="rounded border px-1.5 py-1 backdrop-blur" :class="SEVERITY_CLASS[licence.severity]" :title="`${provider.licence.note}\n\n${licence.explanation}`">
      {{ licence.label }}
    </span>

    <span v-if="vintage" class="border-ink-600/50 bg-ink-950/75 text-ink-200 rounded border px-1.5 py-1 font-mono backdrop-blur" title="Capture vintage">
      {{ vintage }}
    </span>

    <!-- Blur past a provider's native zoom is correct behaviour, not a failure. This chip is what
         says so, and offers the one click that makes the comparison honest again. -->
    <button
      v-if="fit.kind === 'upscaled'"
      type="button"
      class="rounded border px-1.5 py-1 backdrop-blur transition-colors hover:brightness-125"
      :class="SEVERITY_CLASS[fitSeverity]"
      :title="`${formatZoomFit(fit)}. Click to zoom every pane to z${fit.nativeMax}, where this layer is at full resolution.`"
      @click="zoomToNative"
    >
      {{ shortZoomFit(fit) }} ↧
    </button>

    <span v-else-if="fit.kind === 'belowMin'" class="rounded border px-1.5 py-1 backdrop-blur" :class="SEVERITY_CLASS[fitSeverity]" :title="formatZoomFit(fit)">
      {{ shortZoomFit(fit) }}
    </span>

    <!-- Refused, not missing. This counts 401/403/429/5xx, which in practice means a bad key or a
         rate limit; coverage gaps arrive as 404s, which MapLibre never reports (see usePaneTiles).
         Labelling these "missing" would promise a coverage warning the app cannot give. -->
    <span
      v-if="failedTiles > 0"
      class="rounded border px-1.5 py-1 backdrop-blur"
      :class="SEVERITY_CLASS.bad"
      title="The provider refused these tile requests — usually a rejected API key, a rate limit or an outage. Tiles absent for want of coverage are not counted."
    >
      {{ failedTiles }} tiles refused
    </span>
  </div>
</template>
