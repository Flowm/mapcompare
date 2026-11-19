<script setup lang="ts">
import { CalendarDate, type DateValue } from "@internationalized/date";
import { computed } from "vue";

import { pressed } from "@/components/pressed";
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
  type TimeDomain,
  timeShiftedBy,
  timesOnDay,
} from "@/lib/layers/time";
import type { TimeSpec } from "@/lib/layers/types";

/**
 * Everything for choosing a Time, behind the pane's one time button. Shaped by what the Times are:
 *
 *   - vintages and snapshots: the whole list, each with its age, because there are a handful
 *   - daily series: a calendar that greys out the days the satellite or service skipped
 *   - sub-daily series: the calendar, then the hours of that day and the frames in the hour, so a
 *     missing frame is a disabled button rather than a silent jump to an earlier one
 *
 * On a phone the day is the phone's own date picker (`native`), which is the better one there;
 * it cannot grey out a skipped day, so the hours below it still show what that day holds.
 */

const props = defineProps<{ spec: TimeSpec; domain: TimeDomain; resolved: ResolvedTime; following: boolean; native?: boolean }>();
const emit = defineEmits<{ update: [time: string | undefined]; done: [] }>();

const { now } = useClock();
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

/** Pinning keeps the picture on screen; following hands the pane back to whatever is newest. */
function setFollowing(on: boolean) {
  pick(on ? undefined : props.resolved.time, false);
}

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

/** A sub-daily day keeps its time of day, or the frame nearest it, so stepping dates compares like with like. */
function pickDay(value: string) {
  const ms = parseTime(value);
  if (ms === undefined) return;
  if (shape.value !== "slots") {
    pick(value);
    return;
  }
  const frames = timesOnDay(props.domain, ms);
  if (frames.length === 0) return;
  const wanted = parseTime(atSlot(value, slotOf(props.resolved.time) ?? "12:00"))!;
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

const shortcuts = computed(() => {
  const t = current.value;
  if (t === undefined || shape.value !== "slots") return [];
  return [
    { label: "−1 h", target: timeShiftedBy(props.domain, t, -HOUR) },
    { label: "+1 h", target: timeShiftedBy(props.domain, t, HOUR) },
    { label: "Same time yesterday", target: timeShiftedBy(props.domain, t, -DAY) },
  ].map((s) => ({ ...s, time: s.target === undefined ? undefined : formatTime(s.target, props.domain.precision) }));
});
</script>

<template>
  <div class="w-full space-y-3 p-3 sm:w-[19rem]">
    <div>
      <p class="text-muted text-[10px] font-semibold tracking-wide uppercase">{{ spec.label }}</p>
      <p class="text-highlighted text-sm font-medium tabular-nums">{{ humanTime(resolved.time) }}</p>
      <p class="text-muted text-[11px]">{{ ago(resolved.time) }}</p>
    </div>

    <USwitch
      :model-value="following"
      size="sm"
      label="Follow the latest picture"
      :description="following ? 'A shared link shows whatever is newest when it is opened.' : `Newest: ${humanTime(latestLabel)}, ${ago(latestLabel)}.`"
      :ui="{ description: 'text-[11px]' }"
      @update:model-value="setFollowing"
    />

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
      <UInput
        v-if="native"
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
      <p v-if="!native" class="text-dimmed text-[10px] leading-snug">Days in UTC. Struck-through days have no picture.</p>
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
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="frame in byHour.get(shownHour!)"
            :key="frame"
            size="xs"
            :label="slotOf(frame)"
            v-bind="pressed(frame === resolved.time, 'soft')"
            class="font-mono text-[10px] pointer-coarse:py-1.5"
            @click="pick(frame, false)"
          />
        </div>
      </div>
      <div class="flex flex-wrap gap-1">
        <UButton
          v-for="shortcut in shortcuts"
          :key="shortcut.label"
          size="xs"
          color="neutral"
          variant="outline"
          :label="shortcut.label"
          :disabled="shortcut.time === undefined"
          class="text-[10px]"
          @click="pick(shortcut.time, false)"
        />
      </div>
    </div>
  </div>
</template>
