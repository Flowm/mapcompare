<script setup lang="ts">
import { computed, ref } from "vue";

import { dividerPercent, fractionFromPointer, nudge } from "@/lib/swipe";

const props = defineProps<{ position: number; deck: HTMLElement | undefined }>();
const emit = defineEmits<{ "update:position": [value: number] }>();

const handle = ref<HTMLElement>();
const dragging = ref(false);

const left = computed(() => dividerPercent(props.position));

function move(clientX: number) {
  const rect = props.deck?.getBoundingClientRect();
  if (!rect) return;
  emit("update:position", fractionFromPointer(clientX, rect));
}

function onPointerDown(event: PointerEvent) {
  // Pointer capture is what stops the map underneath from panning mid-drag: every subsequent
  // pointermove is retargeted to the handle regardless of what is beneath the cursor.
  handle.value?.setPointerCapture(event.pointerId);
  dragging.value = true;
  move(event.clientX);
  event.preventDefault();
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  move(event.clientX);
}

function onPointerUp(event: PointerEvent) {
  dragging.value = false;
  handle.value?.releasePointerCapture(event.pointerId);
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 0.1 : 0.01;
  if (event.key === "ArrowLeft") emit("update:position", nudge(props.position, -step));
  else if (event.key === "ArrowRight") emit("update:position", nudge(props.position, step));
  else if (event.key === "Home") emit("update:position", nudge(0, 0));
  else if (event.key === "End") emit("update:position", nudge(1, 0));
  else return;
  event.preventDefault();
}
</script>

<template>
  <!-- Lives OUTSIDE the clipped pane wrappers. Inside one, it would clip itself away.
       touch-none keeps mobile drags from being stolen by the map or by page scroll. -->
  <div
    ref="handle"
    class="absolute inset-y-0 z-20 -ml-3 w-6 cursor-col-resize touch-none focus-visible:outline-none"
    :style="{ left }"
    role="separator"
    aria-orientation="vertical"
    aria-label="Comparison divider"
    :aria-valuenow="Math.round(props.position * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    tabindex="0"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeydown"
  >
    <div class="bg-ink-50/90 pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
    <div
      class="border-ink-50/80 bg-ink-950/80 pointer-events-none absolute top-1/2 left-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border backdrop-blur transition-colors"
      :class="dragging ? 'border-accent' : ''"
    >
      <svg viewBox="0 0 24 24" class="text-ink-50 size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M9 6 4 12l5 6M15 6l5 6-5 6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  </div>
</template>
