<script setup lang="ts">
import { CalendarDate, type DateValue } from "@internationalized/date";
import { computed, ref } from "vue";

import { pressed } from "@/components/pressed";
import { isMatchable, useAppState } from "@/composables/useAppState";
import { findLayer } from "@/composables/useCatalogue";
import { useClock } from "@/composables/useClock";
import {
  atSlot,
  dayOf,
  earliestTime,
  formatTime,
  hasTimeOnDay,
  humanTime,
  latestTime,
  listTimes,
  parseTime,
  type ResolvedTime,
  slotOf,
  timeAgo,
  timeAtOrBefore,
  timeAfter,
  type TimeDomain,
  timeShiftedBy,
  timesOnDay,
} from "@/lib/layers/time";
import type { Layer, TimeSpec } from "@/lib/layers/types";

/**
 * Everything for choosing a Time, behind the pane's one time button. Shaped by what the Times are:
 *
 *   - vintages and snapshots: the whole list, each with its age, because there are a handful
 *   - daily series: a calendar that greys out the days the satellite or service skipped
 *   - sub-daily series: the calendar, then the hours of that day and the frames in the hour, so a
 *     missing frame is a disabled button rather than a silent jump to an earlier one
 *
 * On a phone the day is the phone's own date picker (`native`), which is the better one there.
 * It cannot grey out a skipped day, so choosing one moves to the nearest earlier day that has
 * pictures and says so.
 */

const props = defineProps<{ layer: Layer; spec: TimeSpec; domain: TimeDomain; resolved: ResolvedTime; following: boolean; native?: boolean }>();
const emit = defineEmits<{ update: [time: string | undefined]; done: [] }>();

const { now } = useClock();
const { panes, showTimeOnEveryPane } = useAppState();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const shape = computed(() => (props.spec.values ? "list" : props.domain.precision === "minute" ? "slots" : "date"));
const current = computed(() => parseTime(props.resolved.time));
const latest = computed(() => latestTime(props.domain));
const latestLabel = computed(() => (latest.value === undefined ? "" : formatTime(latest.value, props.domain.precision)));

function ago(time: string): string {
  const ms = parseTime(time);
  return ms === undefined ? "" : timeAgo(ms, now.value);
}

function pick(time: string | undefined, done = true) {
  emit("update", time);
  if (done) emit("done");
}

/**
 * Following or fixed, said as a state with the one action that changes it. A switch read the same
 * either way, and turning it off changed nothing visible: fixing keeps the picture on screen. The
 * fixed state leads with the newest picture, which is why anyone opens it.
 */
const isNewest = computed(() => current.value !== undefined && current.value === latest.value);
const status = computed(() => {
  if (props.following) {
    return {
      title: "Following the latest",
      note: "Updates as new pictures arrive. A shared link shows whatever is newest when it is opened.",
      action: { label: "Keep this picture", icon: "i-lucide-pin", color: "neutral" as const, variant: "outline" as const, time: props.resolved.time },
    };
  }
  if (isNewest.value) {
    return {
      title: "Fixed",
      note: "This is still the newest picture. A shared link keeps showing it.",
      action: { label: "Follow the latest", icon: "i-lucide-radio", color: "neutral" as const, variant: "outline" as const, time: undefined },
    };
  }
  return {
    title: "Fixed",
    note: `Newest is ${humanTime(latestLabel.value)} (${ago(latestLabel.value)}).`,
    action: { label: "Go to latest", icon: "i-lucide-skip-forward", color: "primary" as const, variant: "solid" as const, time: undefined },
  };
});

// ------------------------------------------------------------------------------ list

/** Newest first: the recent end is where people look. */
const options = computed(() => (shape.value === "list" ? (listTimes(props.domain) ?? []).toReversed() : []));

// ------------------------------------------------------------------------------ day

function toCalendar(day: string): CalendarDate {
  const [y, m, d] = day.split("-").map(Number);
  return new CalendarDate(y!, m!, d!);
}

const day = computed(() => dayOf(props.resolved.time));
const bounds = computed(() => {
  const first = earliestTime(props.domain);
  return { min: first === undefined ? undefined : formatTime(first, "day"), max: latest.value === undefined ? undefined : formatTime(latest.value, "day") };
});
const calendarValue = computed(() => toCalendar(day.value));
const calendarMin = computed(() => (bounds.value.min ? toCalendar(bounds.value.min) : undefined));
const calendarMax = computed(() => (bounds.value.max ? toCalendar(bounds.value.max) : undefined));

function isSkipped(date: DateValue): boolean {
  const ms = parseTime(date.toString());
  return ms === undefined || !hasTimeOnDay(props.domain, ms);
}

/** A day asked for that had no pictures, and the day shown instead, said while that day is on screen. */
const skipped = ref<{ asked: string; shown: string; at: number }>();

/**
 * A sub-daily day keeps its time of day, or the frame nearest it, so stepping dates compares like
 * with like. A day without pictures, which only the phone's date picker can offer, becomes the
 * nearest earlier day that has some, the same rule a link to a missing Time follows.
 */
function pickDay(value: string) {
  const ms = parseTime(value);
  if (ms === undefined) return;
  if (shape.value !== "slots") {
    pick(value);
    return;
  }
  let target = value;
  if (!hasTimeOnDay(props.domain, ms)) {
    const fallback = timeAtOrBefore(props.domain, ms) ?? timeAfter(props.domain, ms);
    if (fallback === undefined) return;
    target = formatTime(fallback, "day");
  }
  skipped.value = target === value ? undefined : { asked: value, shown: target, at: Date.now() };
  const frames = timesOnDay(props.domain, parseTime(target)!);
  const wanted = parseTime(atSlot(target, slotOf(props.resolved.time) ?? "12:00"))!;
  const nearest = frames.reduce((best, f) => (Math.abs(parseTime(f)! - wanted) < Math.abs(parseTime(best)! - wanted) ? f : best));
  pick(nearest, false);
}

function onCalendar(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) pickDay(String(value));
}

function onNative(value: string | number | null | undefined) {
  if (typeof value === "string" && value !== "") pickDay(value);
}

// ------------------------------------------------------------------------------ slots

/** The frames of the shown day, by hour. */
const frames = computed(() => (shape.value === "slots" && current.value !== undefined ? timesOnDay(props.domain, current.value) : []));
const byHour = computed(() => {
  const hours = new Map<string, string[]>();
  for (const f of frames.value) {
    const hour = slotOf(f)!.slice(0, 2);
    hours.set(hour, [...(hours.get(hour) ?? []), f]);
  }
  return hours;
});
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
/** Picking an hour picks a frame in it, so the hour on screen is always the shown frame's. */
const shownHour = computed(() => slotOf(props.resolved.time)?.slice(0, 2));

/** An hour keeps the minutes of the frame on screen when it has them, else takes its first frame. */
function pickHour(hour: string) {
  const inHour = byHour.value.get(hour);
  if (!inHour) return;
  const minutes = slotOf(props.resolved.time)?.slice(3);
  pick(inHour.find((f) => slotOf(f)!.endsWith(`:${minutes}`)) ?? inHour[0], false);
}

/** Greyed out when that hour or day has no picture, rather than landing somewhere else. */
const shortcuts = computed(() => {
  const t = current.value;
  if (t === undefined || shape.value !== "slots") return [];
  return [
    { label: "−1 d", name: "One day earlier", delta: -DAY },
    { label: "−1 h", name: "One hour earlier", delta: -HOUR },
    { label: "+1 h", name: "One hour later", delta: HOUR },
    { label: "+1 d", name: "One day later", delta: DAY },
  ].map((s) => {
    const target = timeShiftedBy(props.domain, t, s.delta);
    return { ...s, time: target === undefined ? undefined : formatTime(target, props.domain.precision) };
  });
});

// ------------------------------------------------------------------------------ every pane

/**
 * Offered from a satellite pane, and only when another satellite pane has Times to set. Following,
 * it is offered only while some satellite pane is fixed: when they all follow it would do nothing.
 */
const canMatch = computed(() => {
  if (!isMatchable(props.layer)) return false;
  const matchable = panes.value.filter((p) => {
    const layer = findLayer(p.layerId);
    return layer !== undefined && isMatchable(layer);
  });
  return matchable.length > 1 && (!props.following || matchable.some((p) => p.time !== undefined));
});

/** Following the latest is what gets shared when this pane follows it; otherwise the moment on screen. */
const everywhere = computed(() =>
  props.following
    ? { label: "Follow the latest on every pane", icon: "i-lucide-radio", note: "Each satellite pane follows its own newest picture. Basemaps keep their Time." }
    : {
        label: "Show this time on every pane",
        icon: "i-lucide-copy",
        note: "Each satellite pane shows its own picture of this moment and stops following the latest. Basemaps keep their Time.",
      },
);

function showEverywhere() {
  showTimeOnEveryPane(props.following ? undefined : props.resolved.time);
  emit("done");
}
</script>

<template>
  <div class="w-full space-y-3 p-3 sm:w-[19rem]">
    <div>
      <p class="text-muted text-[10px] font-semibold tracking-wide uppercase">{{ spec.label }}</p>
      <p class="text-highlighted text-sm font-medium tabular-nums">{{ humanTime(resolved.time) }}</p>
      <p class="text-muted text-[11px]">{{ ago(resolved.time) }}</p>
    </div>

    <!-- Vintages and snapshots: every one, with its age. -->
    <div v-if="shape === 'list'" class="border-default max-h-60 overflow-y-auto rounded border" role="group" :aria-label="spec.label">
      <button
        v-for="option in options"
        :key="option"
        type="button"
        class="hover:bg-elevated flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs pointer-coarse:py-2.5"
        :class="option === resolved.time ? 'bg-primary/10' : ''"
        :aria-pressed="option === resolved.time"
        @click="pick(option)"
      >
        <span class="text-highlighted flex-1 tabular-nums">{{ humanTime(option) }}</span>
        <span class="text-muted text-[11px]">{{ ago(option) }}</span>
        <UIcon v-if="option === resolved.time" name="i-lucide-check" class="text-primary size-3.5" aria-hidden="true" />
      </button>
    </div>

    <template v-else>
      <!-- Native on a phone: its own date picker is the better one there. -->
      <!-- Keyed on the skip, so the field shows the day taken even when it is the one already shown. -->
      <UInput
        v-if="native"
        :key="skipped?.at"
        type="date"
        :model-value="day"
        :min="bounds.min"
        :max="bounds.max"
        :aria-label="`${spec.label} (UTC date)`"
        class="w-full"
        @update:model-value="onNative"
      />
      <UCalendar
        v-else
        :model-value="calendarValue"
        :min-value="calendarMin"
        :max-value="calendarMax"
        :is-date-unavailable="isSkipped"
        :week-starts-on="1"
        size="sm"
        fixed-weeks
        @update:model-value="onCalendar"
      />
      <p v-if="native && skipped?.shown === day" class="text-warning text-[11px] leading-snug" role="status">
        No pictures on {{ humanTime(skipped.asked) }}. Showing {{ humanTime(skipped.shown) }}.
      </p>
      <p class="text-dimmed text-[10px] leading-snug">{{ native ? "Days in UTC." : "Days in UTC. Struck-through days have no picture." }}</p>
    </template>

    <!-- Sub-daily: the hours of the day, then the frames in the chosen hour. A missing hour or frame
         is a disabled button, where the old list simply left it out. -->
    <div v-if="shape === 'slots'" class="space-y-2">
      <div>
        <p class="text-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">Hour (UTC)</p>
        <div class="grid grid-cols-8 gap-1">
          <UButton
            v-for="hour in HOURS"
            :key="hour"
            size="xs"
            :label="hour"
            v-bind="pressed(hour === shownHour, 'soft')"
            :disabled="!byHour.has(hour)"
            class="justify-center px-0 font-mono text-[10px] pointer-coarse:py-1.5"
            :aria-label="`${hour}:00 UTC`"
            @click="pickHour(hour)"
          />
        </div>
      </div>
      <div v-if="shownHour && (byHour.get(shownHour)?.length ?? 0) > 1">
        <p class="text-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">Frame</p>
        <!-- Six columns: the ten-minute layers' six frames an hour sit on one line, as the hours
             above sit in rows of eight. A five-minute layer gets two rows of six. -->
        <div class="grid grid-cols-6 gap-1">
          <UButton
            v-for="frame in byHour.get(shownHour!)"
            :key="frame"
            size="xs"
            :label="slotOf(frame)"
            v-bind="pressed(frame === resolved.time, 'soft')"
            class="justify-center px-0 font-mono text-[10px] pointer-coarse:py-1.5"
            @click="pick(frame, false)"
          />
        </div>
      </div>
      <div class="grid grid-cols-4 gap-1">
        <UButton
          v-for="shortcut in shortcuts"
          :key="shortcut.label"
          size="xs"
          color="neutral"
          variant="outline"
          :label="shortcut.label"
          :aria-label="shortcut.name"
          :disabled="shortcut.time === undefined"
          class="justify-center font-mono text-[10px] pointer-coarse:py-1.5"
          @click="pick(shortcut.time, false)"
        />
      </div>
    </div>

    <!-- Below the picking, beside the other "what happens to this pane" choice: picking a time
         fixes the pane anyway, so this is where the result is read and undone. -->
    <div class="border-default space-y-3 border-t pt-3">
      <div class="border-default rounded border p-2.5">
        <p class="flex items-center gap-1.5 text-xs">
          <span v-if="following" class="bg-primary size-1.5 shrink-0 rounded-full" aria-hidden="true" />
          <UIcon v-else name="i-lucide-pin" class="text-toned size-3.5 shrink-0" aria-hidden="true" />
          <span class="text-highlighted font-medium">{{ status.title }}</span>
        </p>
        <p class="text-muted mt-0.5 text-[11px] leading-snug">{{ status.note }}</p>
        <UButton
          size="xs"
          :color="status.action.color"
          :variant="status.action.variant"
          :icon="status.action.icon"
          :label="status.action.label"
          class="mt-2 w-full justify-center pointer-coarse:py-1.5"
          @click="pick(status.action.time, false)"
        />
      </div>

      <!-- The same moment everywhere: GOES-East beside Meteosat at one instant, or a daily swath
         beside the geostationary frame of that morning. -->
      <div v-if="canMatch">
        <UButton size="xs" color="neutral" variant="outline" :icon="everywhere.icon" :label="everywhere.label" class="w-full justify-center" @click="showEverywhere" />
        <p class="text-dimmed mt-1 text-[10px] leading-snug">{{ everywhere.note }}</p>
      </div>
    </div>
  </div>
</template>
