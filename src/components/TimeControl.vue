<script setup lang="ts">
import { computed } from "vue";

import { useTimeDomain } from "@/composables/useTimeDomain";
import { atSlot, dayOf, earliestTime, formatTime, latestTime, listTimes, parseTime, resolveTime, slotOf, timeAfter, timeBefore, timesOnDay } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";

/**
 * One control for every time-aware Layer, shaped by what its Times are.
 *
 *   - vintages and snapshots: a list, because there are a handful and each is a deliberate edition
 *   - daily series: a date, because there are thousands
 *   - sub-daily series: a date and the slots that exist on it
 *
 * ◀ ▶ step to the neighbouring Time that actually exists, so a missing day or a skipped ten-minute
 * slot is stepped over rather than landed on. "Latest" clears the request instead of pinning
 * today's latest, which is what keeps a shared link meaning "latest" tomorrow.
 */

const props = defineProps<{ layer: Layer; time: string | undefined; dense?: boolean }>();
const emit = defineEmits<{ update: [time: string | undefined] }>();

const { domain: state } = useTimeDomain(computed(() => props.layer));
/** Only an answer about this Layer: while a switch is in flight the control shows nothing stale. */
const domain = computed(() => (state.value.state === "ready" && state.value.layerId === props.layer.id ? state.value.domain : undefined));

const spec = computed(() => props.layer.time);
const resolved = computed(() => (domain.value ? resolveTime(domain.value, props.time) : undefined));
const current = computed(() => (resolved.value ? parseTime(resolved.value.time) : undefined));
const precision = computed(() => spec.value?.precision ?? "day");

const shape = computed(() => (spec.value?.values ? "list" : precision.value === "minute" ? "slots" : "date"));
const options = computed(() => (domain.value && shape.value === "list" ? (listTimes(domain.value) ?? []) : []));

const previous = computed(() => (domain.value && current.value !== undefined ? timeBefore(domain.value, current.value) : undefined));
const next = computed(() => (domain.value && current.value !== undefined ? timeAfter(domain.value, current.value) : undefined));

const day = computed(() => (resolved.value ? dayOf(resolved.value.time) : ""));
const bounds = computed(() => {
  const first = domain.value ? earliestTime(domain.value) : undefined;
  const last = domain.value ? latestTime(domain.value) : undefined;
  return { min: first === undefined ? undefined : formatTime(first, "day"), max: last === undefined ? undefined : formatTime(last, "day") };
});
const slots = computed(() => (domain.value && shape.value === "slots" && current.value !== undefined ? timesOnDay(domain.value, current.value) : []));

function step(target: number | undefined) {
  if (target !== undefined) emit("update", formatTime(target, precision.value));
}

function pickDay(value: string | number | null | undefined) {
  if (typeof value !== "string" || value === "") return;
  // A new day keeps the time of day, so stepping a GEO pane through dates compares like with like.
  emit("update", shape.value === "slots" ? atSlot(value, (resolved.value && slotOf(resolved.value.time)) ?? "12:00") : value);
}

function pick(value: unknown) {
  if (typeof value === "string") emit("update", value);
}

const listItems = computed(() => options.value.map((value) => ({ label: value, value })));
const slotItems = computed(() => slots.value.map((slot) => ({ label: slotOf(slot), value: slot })));

/**
 * Over the map the control needs its own backdrop to stay legible on any imagery; in the manager it
 * sits on the panel and stays small.
 */
const overMap = computed(() => (props.dense ? "" : "bg-ink-950/85 backdrop-blur"));
const fieldUi = computed(() => ({ base: ["font-mono", props.dense ? "text-[10px]" : "", overMap.value].join(" ") }));
</script>

<template>
  <UFieldGroup v-if="spec" :size="dense ? 'xs' : 'sm'" :aria-label="`${spec.label} for ${layer.label}`">
    <UTooltip :text="`Previous ${spec.label.toLowerCase()}`">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="outline"
        :class="overMap"
        :disabled="previous === undefined"
        :aria-label="`Previous ${spec.label.toLowerCase()}`"
        @click="step(previous)"
      />
    </UTooltip>

    <USelect v-if="shape === 'list'" :model-value="resolved?.time" :items="listItems" :aria-label="spec.label" :ui="fieldUi" @update:model-value="pick" />

    <template v-else>
      <!-- Native, not a calendar component: a phone's own date picker is the better one. -->
      <UInput type="date" :model-value="day" :min="bounds.min" :max="bounds.max" :aria-label="`${spec.label} (UTC date)`" :ui="fieldUi" @update:model-value="pickDay" />
      <USelect v-if="shape === 'slots'" :model-value="resolved?.time" :items="slotItems" :aria-label="`${spec.label} (UTC)`" :ui="fieldUi" @update:model-value="pick" />
    </template>

    <UTooltip :text="`Next ${spec.label.toLowerCase()}`">
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="outline"
        :class="overMap"
        :disabled="next === undefined"
        :aria-label="`Next ${spec.label.toLowerCase()}`"
        @click="step(next)"
      />
    </UTooltip>
    <UTooltip text="Always show the newest picture, also in a shared link">
      <UButton
        label="latest"
        :color="time === undefined ? 'primary' : 'neutral'"
        variant="outline"
        class="font-mono"
        :class="[overMap, dense && 'text-[10px]']"
        :aria-pressed="time === undefined"
        @click="emit('update', undefined)"
      />
    </UTooltip>
  </UFieldGroup>
</template>
