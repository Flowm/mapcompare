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

function pickDay(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (value === "") return;
  // A new day keeps the time of day, so stepping a GEO pane through dates compares like with like.
  emit("update", shape.value === "slots" ? atSlot(value, (resolved.value && slotOf(resolved.value.time)) ?? "12:00") : value);
}

function pick(event: Event) {
  emit("update", (event.target as HTMLSelectElement).value);
}

const field = computed(() =>
  props.dense
    ? "border-ink-700 bg-ink-900 text-ink-50 focus:border-primary rounded border px-1 py-0.5 font-mono text-[10px] focus:outline-none"
    : "border-ink-600/70 bg-ink-950/85 text-ink-50 focus:border-primary rounded border px-1.5 py-1 font-mono text-xs backdrop-blur focus:outline-none",
);
const button = computed(() =>
  props.dense
    ? "border-ink-700 text-ink-400 hover:text-ink-50 hover:border-ink-500 rounded border px-1 py-0.5 font-mono text-[10px] disabled:opacity-30 disabled:hover:text-ink-400"
    : "border-ink-600/70 bg-ink-950/85 text-ink-200 hover:text-ink-50 rounded border px-1.5 py-1 font-mono text-xs backdrop-blur disabled:opacity-30",
);
</script>

<template>
  <div v-if="spec" class="flex items-center gap-0.5" role="group" :aria-label="`${spec.label} for ${layer.label}`">
    <button type="button" :class="button" :disabled="previous === undefined" :title="`Previous ${spec.label.toLowerCase()}`" @click="step(previous)">◀</button>

    <select v-if="shape === 'list'" :value="resolved?.time" :aria-label="spec.label" :class="field" @change="pick">
      <option v-for="value in options" :key="value" :value="value">{{ value }}</option>
    </select>

    <template v-else>
      <input type="date" :value="day" :min="bounds.min" :max="bounds.max" :aria-label="`${spec.label} (UTC date)`" :class="field" @change="pickDay" />
      <select v-if="shape === 'slots'" :value="resolved?.time" :aria-label="`${spec.label} (UTC)`" :class="field" @change="pick">
        <option v-for="slot in slots" :key="slot" :value="slot">{{ slotOf(slot) }}</option>
      </select>
    </template>

    <button type="button" :class="button" :disabled="next === undefined" :title="`Next ${spec.label.toLowerCase()}`" @click="step(next)">▶</button>
    <button
      type="button"
      :class="[button, time === undefined ? 'border-primary/60! text-primary!' : '']"
      :aria-pressed="time === undefined"
      title="Always show the newest picture, also in a shared link"
      @click="emit('update', undefined)"
    >
      latest
    </button>
  </div>
</template>
