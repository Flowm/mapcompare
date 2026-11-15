<script setup lang="ts">
import { computed } from "vue";

import StatusChip from "@/components/StatusChip.vue";
import { useAppState } from "@/composables/useAppState";
import { useCamera } from "@/composables/useCamera";
import { licenceClasses, licenceInfo } from "@/lib/layers/licence";
import { displayTime, type ResolvedTime, type SubstitutionReason } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";
import { SEVERITY_CLASSES } from "@/lib/severity";
import { formatZoomFit, shortZoomFit, type ZoomFit, zoomFit, zoomSeverity } from "@/lib/zoomFit";

const props = defineProps<{ layer: Layer; time: ResolvedTime | undefined; ended: string | undefined; failedTiles: number }>();

const { camera } = useAppState();
const { moveCamera } = useCamera();

const licence = computed(() => licenceInfo(props.layer.licence.tier));
/**
 * The camera changes on every frame of a move, but the fit only changes at whole tile zooms. Handing
 * back the previous object while it says the same keeps the chips from re-rendering every frame.
 */
const fit = computed<ZoomFit>((previous) => {
  const next = zoomFit(props.layer, camera.value.zoom);
  return previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
});
const fitSeverity = computed(() => zoomSeverity(fit.value));
/** The Time shown, or a static Layer's own capture date where it is known. */
const shownTime = computed(() => (props.time ? displayTime(props.time.time) : props.layer.vintage));

/** Why the pane is not showing what was asked for, in words that say what to do about it. */
const SUBSTITUTION_REASONS: Record<SubstitutionReason, (requested: string, shown: string) => string> = {
  gap: (requested, shown) => `This layer has no picture for ${requested}: the satellite or the service skipped it. ${shown} is the latest picture before it.`,
  "too-recent": (requested, shown) => `${requested} is newer than this layer's latest picture, ${shown}. It may not be published yet.`,
  "before-archive": (requested, shown) =>
    `${requested} is older than this layer's archive, which starts at ${shown}. Rolling archives drop old pictures, so a pinned link can age out.`,
  unreadable: (requested, shown) => `"${requested}" is not a time this layer understands, so its latest picture, ${shown}, is shown.`,
};

const substitution = computed(() => {
  const time = props.time;
  if (!time?.substitution) return undefined;
  const requested = displayTime(time.substitution.requested);
  const shown = displayTime(time.time);
  return { requested, shown, explanation: SUBSTITUTION_REASONS[time.substitution.reason](requested, shown) };
});

/** Drops the whole group to this pane's native ceiling, for an apples-to-apples look. */
function zoomToNative() {
  if (fit.value.kind !== "upscaled") return;
  moveCamera({ ...camera.value, zoom: fit.value.nativeMax });
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-end gap-1">
    <StatusChip :color="licenceClasses(layer).color">
      {{ licence.label }}
      <template #detail>
        <p class="text-ink-50 font-medium">{{ layer.licence.note }}</p>
        <p>{{ licence.explanation }}</p>
      </template>
    </StatusChip>

    <!-- The pane is not showing what was asked for: a pinned link that aged out of a rolling
         archive, or a day the satellite missed. Said, never silent; it replaces the plain Time
         chip so the shown Time is never stated twice. -->
    <StatusChip v-if="substitution" color="warning" mono>
      Requested {{ substitution.requested }}, showing {{ substitution.shown }}
      <template #detail>{{ substitution.explanation }}</template>
    </StatusChip>
    <StatusChip v-else-if="shownTime" mono>
      {{ shownTime }}
      <template #detail>
        <p>The time of the picture this pane shows.</p>
        <p v-if="layer.time">“latest” follows the newest picture instead of pinning this one, and a shared link keeps following it.</p>
      </template>
    </StatusChip>

    <StatusChip v-if="ended" color="warning">
      ended {{ ended }}
      <template #detail>No new pictures since {{ ended }}. The archive is still served.</template>
    </StatusChip>

    <!-- Blur past a Layer's native zoom is correct behaviour, not a failure. This chip is what
         says so, and offers the one click that makes the comparison honest again. -->
    <StatusChip v-if="fit.kind !== 'native'" :color="SEVERITY_CLASSES[fitSeverity].color">
      {{ shortZoomFit(fit) }}
      <template #detail>
        <p>{{ formatZoomFit(fit) }}.</p>
        <UButton v-if="fit.kind === 'upscaled'" size="xs" icon="i-lucide-arrow-down-to-line" :label="`Zoom every pane to z${fit.nativeMax}`" @click="zoomToNative" />
      </template>
    </StatusChip>

    <!-- Refused, not missing. This counts 401/403/429/5xx, which in practice means a bad key or a
         rate limit; coverage gaps arrive as 404s, which MapLibre never reports (see usePaneTiles).
         Labelling these "missing" would promise a coverage warning the app cannot give. -->
    <StatusChip v-if="failedTiles > 0" color="error">
      {{ failedTiles }} tiles refused
      <template #detail>
        The provider refused these tile requests, usually a rejected API key, a rate limit or an outage. Tiles absent for want of coverage are not counted.
      </template>
    </StatusChip>
  </div>
</template>
