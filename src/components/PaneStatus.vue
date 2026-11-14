<script setup lang="ts">
import { computed } from "vue";

import { useAppState } from "@/composables/useAppState";
import { useCamera } from "@/composables/useCamera";
import { licenceInfo } from "@/lib/layers/licence";
import { displayTime, type ResolvedTime, type SubstitutionReason } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";
import { SEVERITY_CLASSES } from "@/lib/severity";
import { formatZoomFit, shortZoomFit, zoomFit, zoomSeverity } from "@/lib/zoomFit";

const props = defineProps<{ layer: Layer; time: ResolvedTime | undefined; ended: string | undefined; failedTiles: number }>();

const { camera } = useAppState();
const { moveCamera } = useCamera();

const licence = computed(() => licenceInfo(props.layer.licence.tier));
const fit = computed(() => zoomFit(props.layer, camera.value.zoom));
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
  <div class="flex flex-wrap items-center justify-end gap-1 text-[10px] leading-none">
    <span class="rounded border px-1.5 py-1 backdrop-blur" :class="SEVERITY_CLASSES[licence.severity].chip" :title="`${layer.licence.note}\n\n${licence.explanation}`">
      {{ licence.label }}
    </span>

    <!-- The pane is not showing what was asked for: a pinned link that aged out of a rolling
         archive, or a day the satellite missed. Said, never silent; it replaces the plain Time
         chip so the shown Time is never stated twice. -->
    <span v-if="substitution" class="rounded border px-1.5 py-1 font-mono backdrop-blur" :class="SEVERITY_CLASSES.warn.chip" :title="substitution.explanation">
      Requested {{ substitution.requested }}, showing {{ substitution.shown }}
    </span>
    <span v-else-if="shownTime" class="border-ink-600/50 bg-ink-950/75 text-ink-200 rounded border px-1.5 py-1 font-mono backdrop-blur" title="Time of the picture">
      {{ shownTime }}
    </span>

    <span v-if="ended" class="rounded border px-1.5 py-1 backdrop-blur" :class="SEVERITY_CLASSES.warn.chip" :title="`No new pictures since ${ended}. The archive is still served.`">
      ended {{ ended }}
    </span>

    <!-- Blur past a Layer's native zoom is correct behaviour, not a failure. This chip is what
         says so, and offers the one click that makes the comparison honest again. -->
    <button
      v-if="fit.kind === 'upscaled'"
      type="button"
      class="rounded border px-1.5 py-1 backdrop-blur transition-colors hover:brightness-125"
      :class="SEVERITY_CLASSES[fitSeverity].chip"
      :title="`${formatZoomFit(fit)}. Click to zoom every pane to z${fit.nativeMax}, where this layer is at full resolution.`"
      @click="zoomToNative"
    >
      {{ shortZoomFit(fit) }} ↧
    </button>

    <span v-else-if="fit.kind === 'belowMin'" class="rounded border px-1.5 py-1 backdrop-blur" :class="SEVERITY_CLASSES[fitSeverity].chip" :title="formatZoomFit(fit)">
      {{ shortZoomFit(fit) }}
    </span>

    <!-- Refused, not missing. This counts 401/403/429/5xx, which in practice means a bad key or a
         rate limit; coverage gaps arrive as 404s, which MapLibre never reports (see usePaneTiles).
         Labelling these "missing" would promise a coverage warning the app cannot give. -->
    <span
      v-if="failedTiles > 0"
      class="rounded border px-1.5 py-1 backdrop-blur"
      :class="SEVERITY_CLASSES.bad.chip"
      title="The provider refused these tile requests — usually a rejected API key, a rate limit or an outage. Tiles absent for want of coverage are not counted."
    >
      {{ failedTiles }} tiles refused
    </span>
  </div>
</template>
