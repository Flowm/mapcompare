<script setup lang="ts">
import UDrawer from "@nuxt/ui/components/Drawer.vue";
import UPopover from "@nuxt/ui/components/Popover.vue";
import { computed, ref } from "vue";

import LayerPickerList from "@/components/LayerPickerList.vue";
import TimeControl from "@/components/TimeControl.vue";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { useViewport } from "@/composables/useViewport";
import { licenceInfo } from "@/lib/layers/licence";
import { getLayer } from "@/lib/layers/registry";
import { type Layer, type PaneLayer, paneLayer } from "@/lib/layers/types";
import { SEVERITY_CLASSES } from "@/lib/severity";

/**
 * A pane's own layer switcher: the fastest path from "this pane" to "that layer".
 *
 * Two decisions carry the design, and both depend on LayerManager existing:
 *
 *   - One line per layer, no notes, no key instructions. The manager is where layers are
 *     explained, so repeating any of it here would only make the panel taller.
 *   - Layers that need an API key are LEFT OUT, not greyed. Everything listed is one click from
 *     being on the map. That is only honest because the manager still lists the gated ones with
 *     their notes and a way to add the key — the footer here says how many are waiting there.
 *
 * A popover on desktop, a drawer on a phone, where a pane can be a strip too short to hang a list
 * off. Both portal to <body>: inside the pane the list would be clipped by `overflow-hidden`, by the
 * neighbouring pane's chrome stacking over it, and in swipe mode by the top pane's `clip-path`.
 */

const props = defineProps<{ index: number; layer: PaneLayer; align?: "left" | "right" }>();
const emit = defineEmits<{ update: [layer: PaneLayer] }>();

const { activePane, openPanel, focusPane } = useLayerPanel();
const { isCompact } = useViewport();

const open = ref(false);
const current = computed(() => getLayer(props.layer.layerId));

const surface = computed(() =>
  isCompact.value
    ? { is: UDrawer, props: { title: `Layer for pane ${props.index + 1}`, ui: { body: "p-0 sm:p-0" } } }
    : {
        is: UPopover,
        props: { content: { side: "bottom" as const, align: props.align === "right" ? ("end" as const) : ("start" as const), collisionPadding: 8 }, ui: { content: "w-[260px]" } },
      },
);

function onOpen(isOpen: boolean) {
  // Picking a pane on the map is also what the manager should act on next.
  if (isOpen) focusPane(props.index);
  open.value = isOpen;
}

function choose(layer: Layer) {
  // The old Time belonged to the old Layer: a year of EOX means nothing to GOES.
  emit("update", { layerId: layer.id });
  open.value = false;
}

function pickTime(time: string | undefined) {
  emit("update", paneLayer(props.layer.layerId, time));
}

function showEverything() {
  open.value = false;
  openPanel();
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" :class="align === 'right' ? 'justify-end' : 'justify-start'">
    <component :is="surface.is" :open="open" v-bind="surface.props" @update:open="onOpen">
      <button
        type="button"
        class="bg-ink-950/85 text-ink-50 hover:bg-ink-800 flex max-w-[14rem] items-center gap-1.5 rounded border px-2 py-1 text-xs backdrop-blur transition-colors pointer-coarse:py-1.5"
        :class="activePane === index ? 'border-primary/70' : 'border-ink-600/70'"
        :aria-label="`Layer for pane ${index + 1}: ${current?.label ?? layer.layerId}`"
      >
        <span class="rounded px-1 font-mono text-[10px]" :class="activePane === index ? 'bg-primary text-ink-950' : 'bg-ink-800 text-ink-200'">{{ index + 1 }}</span>
        <span v-if="current" class="size-1.5 shrink-0 rounded-full" :class="SEVERITY_CLASSES[licenceInfo(current.licence.tier).severity].dot" />
        <span class="truncate">{{ current?.label ?? layer.layerId }}</span>
        <UIcon name="i-lucide-chevron-down" class="text-ink-400 size-3.5 shrink-0" />
      </button>

      <!-- A drawer's `content` slot would replace its handle and title, so the list goes in its body.
           No autofocus there: on a phone it would raise the keyboard over the list. -->
      <template v-if="isCompact" #body>
        <LayerPickerList :selected="layer.layerId" @choose="choose" @manager="showEverything" />
      </template>
      <template v-else #content>
        <LayerPickerList :selected="layer.layerId" autofocus @choose="choose" @manager="showEverything" />
      </template>
    </component>

    <TimeControl v-if="current?.time" :layer="current" :time="layer.time" @update="pickTime" />
  </div>
</template>
