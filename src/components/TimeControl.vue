<script setup lang="ts">
// Imported rather than auto-registered: `<component :is>` needs the component objects themselves.
import UDrawer from "@nuxt/ui/components/Drawer.vue";
import UPopover from "@nuxt/ui/components/Popover.vue";
import { computed, ref } from "vue";

import TimePanel from "@/components/TimePanel.vue";
import { useTimeDomain } from "@/composables/useTimeDomain";
import { useViewport } from "@/composables/useViewport";
import { formatTime, humanTime, parseTime, resolveTime, timeAfter, timeBefore } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";

/**
 * One control for every time-aware Layer: ◀, a button naming the Time on screen, ▶.
 *
 * ◀ ▶ step to the neighbouring Time that actually exists, so a missing day or a skipped ten-minute
 * slot is stepped over rather than landed on. The button opens TimePanel, which holds the rest: the
 * list, calendar or hours, and following the latest. "Latest" clears the request instead of
 * pinning today's latest, which is what keeps a shared link meaning "latest" tomorrow.
 *
 * The joined date field, slot list and "latest" button this replaces were half a pane wide, wrapped
 * in the manager's column, offered days that had no picture, and sat empty while a service was
 * still being asked which Times it has. The button says "Loading times…" instead.
 */

const props = defineProps<{ layer: Layer; time: string | undefined; dense?: boolean }>();
const emit = defineEmits<{ update: [time: string | undefined] }>();

const { isCompact } = useViewport();
const { domain: state } = useTimeDomain(computed(() => props.layer));

/** Only an answer about this Layer: while a switch is in flight the control shows nothing stale. */
const domain = computed(() => (state.value.state === "ready" && state.value.layerId === props.layer.id ? state.value.domain : undefined));
const spec = computed(() => props.layer.time);
const resolved = computed(() => (domain.value ? resolveTime(domain.value, props.time) : undefined));

/**
 * "empty" is a service that answered with no Times, which would otherwise look like loading that
 * never ends. Empty and error still open the panel: it is where the reason can be read on a phone.
 */
const status = computed(() => {
  if (resolved.value) return "ready";
  if (state.value.layerId !== props.layer.id) return "loading";
  if (state.value.state === "error") return "error";
  if (state.value.state === "ready" || state.value.state === "static") return "empty";
  return "loading";
});
const problem = computed(() => {
  const what = `${spec.value?.label.toLowerCase() ?? "time"}s for ${props.layer.label}`;
  if (status.value === "error") return { title: `Could not load the ${what}.`, detail: state.value.state === "error" ? state.value.message : "" };
  return { title: `The service lists no ${what} right now.`, detail: "Try again later, or choose another layer." };
});
const current = computed(() => (resolved.value ? parseTime(resolved.value.time) : undefined));
const following = computed(() => props.time === undefined);

const previous = computed(() => (domain.value && current.value !== undefined ? timeBefore(domain.value, current.value) : undefined));
const next = computed(() => (domain.value && current.value !== undefined ? timeAfter(domain.value, current.value) : undefined));

const label = computed(() => {
  if (resolved.value) return humanTime(resolved.value.time);
  if (status.value === "error") return "Times unavailable";
  if (status.value === "empty") return "No times listed";
  return "Loading times…";
});

/** Wide enough for the longest label of its kind, so ◀ ▶ do not shift as the date changes. */
const minWidth = computed(() => {
  if (spec.value?.precision === "minute") return props.dense ? "min-w-[9.5rem]" : "min-w-[11.5rem]";
  if (spec.value?.precision === "day") return props.dense ? "min-w-[6rem]" : "min-w-[7rem]";
  return "";
});

const open = ref(false);

const surface = computed(() =>
  isCompact.value
    ? {
        is: UDrawer,
        // Dense means the layer manager, which is itself a drawer on a phone.
        props: { title: `${spec.value?.label ?? "Time"} for ${props.layer.label}`, nested: props.dense, ui: { body: "p-0 sm:p-0" } },
      }
    : { is: UPopover, props: { content: { side: "bottom" as const, align: "start" as const, collisionPadding: 8 } } },
);

/** The drawer's body or the popover's content: one panel either way. */
const panelSlot = computed(() => (isCompact.value ? "body" : "content"));

function step(target: number | undefined) {
  if (target !== undefined && domain.value) emit("update", formatTime(target, domain.value.precision));
}

/**
 * Over the map the control needs its own backdrop to stay legible on any imagery; in the manager it
 * sits on the panel and stays small.
 */
const overMap = computed(() => (props.dense ? "" : "bg-ink-950/85 backdrop-blur"));
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

    <component :is="surface.is" v-model:open="open" v-bind="surface.props">
      <UButton
        color="neutral"
        variant="outline"
        trailing-icon="i-lucide-chevron-down"
        :loading="status === 'loading'"
        :disabled="status === 'loading'"
        :class="[overMap, minWidth, dense && 'text-[10px]', 'justify-between tabular-nums']"
        :aria-label="`${spec.label}: ${label.replace(/…$/, '')}${resolved ? (following ? ', following the latest' : ', fixed') : ''}. Choose another`"
      >
        <span class="truncate">{{ label }}</span>
        <!-- Which panes move on their own and which are fixed, readable across a whole deck. -->
        <span v-if="resolved && following" class="text-primary flex shrink-0 items-center gap-1 text-[10px] font-medium" aria-hidden="true">
          <span class="bg-primary size-1.5 rounded-full" />latest
        </span>
        <UIcon v-else-if="resolved" name="i-lucide-pin" class="text-muted size-3 shrink-0" aria-hidden="true" />
      </UButton>

      <template #[panelSlot]>
        <TimePanel
          v-if="domain && resolved"
          :layer="layer"
          :spec="spec"
          :domain="domain"
          :resolved="resolved"
          :following="following"
          :native="isCompact"
          @update="emit('update', $event)"
          @done="open = false"
        />
        <div v-else class="w-full space-y-1 p-3 text-xs sm:w-[19rem]" role="status">
          <p class="text-highlighted font-medium">{{ problem.title }}</p>
          <p v-if="problem.detail" class="text-muted text-[11px] leading-snug break-words">{{ problem.detail }}</p>
        </div>
      </template>
    </component>

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
  </UFieldGroup>
</template>
