<script setup lang="ts">
import { onClickOutside, useEventListener, useWindowSize } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { type Anchor, placePanel } from "@/lib/anchor";
import { groupByOperator, providerStatuses } from "@/lib/providers/availability";
import { licenceInfo } from "@/lib/providers/licence";
import { PROVIDERS } from "@/lib/providers/registry";
import type { PaneLayer, Provider } from "@/lib/providers/types";
import { resolveVariant, variantValues } from "@/lib/providers/variants";

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
 * The panel is teleported to <body> and positioned from the trigger's viewport rect. Inside the
 * pane it would be clipped: by `overflow-hidden`, by the neighbouring pane's chrome stacking over
 * it, and in swipe mode by the top pane's `clip-path` erasing everything past the seam.
 */

const props = defineProps<{ index: number; layer: PaneLayer; align?: "left" | "right" }>();
const emit = defineEmits<{ update: [layer: PaneLayer] }>();

const { keys } = useApiKeys();
const { activePane, openPanel, focusPane } = useLayerPanel();

const PANEL = { width: 260, maxHeight: 340 };

const open = ref(false);
const query = ref("");
const trigger = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const search = ref<HTMLInputElement>();

const { width: viewportWidth, height: viewportHeight } = useWindowSize();
const anchor = ref<Anchor>({ top: 0, left: 0, right: 0, bottom: 0 });

const statuses = computed(() => providerStatuses(PROVIDERS, keys.value));
const available = computed(() => statuses.value.filter((s) => s.enabled));
const gatedCount = computed(() => statuses.value.length - available.value.length);

const groups = computed(() => {
  const term = query.value.trim().toLowerCase();
  const matching = term === "" ? available.value : available.value.filter((s) => `${s.provider.label} ${s.provider.operator}`.toLowerCase().includes(term));
  return groupByOperator(matching);
});

const current = computed(() => PROVIDERS.find((p) => p.id === props.layer.providerId));
const variants = computed(() => (current.value?.variant ? variantValues(current.value.variant) : []));
const selectedVariant = computed(() => (current.value?.variant ? resolveVariant(current.value.variant, props.layer.variant, new Date()) : ""));

const DOT_CLASS = { ok: "bg-tier-open", warn: "bg-tier-terms", bad: "bg-tier-restricted" } as const;

const placement = computed(() => {
  const { left, top, bottom, maxHeight } = placePanel(anchor.value, PANEL, { width: viewportWidth.value, height: viewportHeight.value }, props.align ?? "left");
  return {
    position: "fixed" as const,
    width: `${PANEL.width}px`,
    maxHeight: `${maxHeight}px`,
    left: `${left}px`,
    ...(top === undefined ? { bottom: `${bottom}px` } : { top: `${top}px` }),
  };
});

function measure() {
  const box = trigger.value?.getBoundingClientRect();
  if (box) anchor.value = { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
}

function toggle() {
  // Picking a pane on the map is also what the manager should act on next.
  focusPane(props.index);
  open.value = !open.value;
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  measure();
  query.value = "";
  await nextTick();
  search.value?.focus();
});

// The trigger moves whenever pane geometry changes, and the panel is anchored to where it was.
useEventListener(window, "resize", measure);
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key === "Escape" && open.value) open.value = false;
});
onClickOutside(panel, () => (open.value = false), { ignore: [trigger] });

function choose(provider: Provider) {
  // The old variant belonged to the old provider and would be meaningless here.
  emit("update", { providerId: provider.id });
  open.value = false;
}

function pickVariant(event: Event) {
  emit("update", { providerId: props.layer.providerId, variant: (event.target as HTMLSelectElement).value });
}

function showEverything() {
  openPanel();
  open.value = false;
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      ref="trigger"
      type="button"
      class="bg-ink-950/85 text-ink-50 hover:bg-ink-800 flex max-w-[14rem] items-center gap-1.5 rounded border px-2 py-1 text-xs backdrop-blur transition-colors"
      :class="activePane === index ? 'border-accent/70' : 'border-ink-600/70'"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="rounded px-1 font-mono text-[10px]" :class="activePane === index ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-200'">{{ index + 1 }}</span>
      <span v-if="current" class="size-1.5 shrink-0 rounded-full" :class="DOT_CLASS[licenceInfo(current.licence.tier).severity]" :title="licenceInfo(current.licence.tier).label" />
      <span class="truncate">{{ current?.label ?? layer.providerId }}</span>
      <span class="text-ink-400 shrink-0">▾</span>
    </button>

    <select
      v-if="variants.length > 0"
      :value="selectedVariant"
      :aria-label="current?.variant?.label"
      class="border-ink-600/70 bg-ink-950/85 text-ink-50 focus:border-accent rounded border px-1.5 py-1 font-mono text-xs backdrop-blur focus:outline-none"
      @change="pickVariant"
    >
      <option v-for="value in variants" :key="value.value" :value="value.value">{{ value.label }}</option>
    </select>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="border-ink-700 bg-ink-900/98 z-40 flex flex-col overflow-hidden rounded-lg border shadow-2xl backdrop-blur"
        :style="placement"
        role="listbox"
        :aria-label="`Layer for pane ${index + 1}`"
      >
        <div class="border-ink-800 shrink-0 border-b p-1.5">
          <input
            ref="search"
            v-model="query"
            type="search"
            placeholder="Switch layer…"
            class="bg-ink-950/60 text-ink-50 placeholder:text-ink-600 focus:border-accent w-full rounded border border-transparent px-2 py-1 text-xs focus:outline-none"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-for="group in groups" :key="group.operator">
            <p class="bg-ink-800/95 text-ink-400 sticky top-0 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{{ group.operator }}</p>

            <button
              v-for="entry in group.entries"
              :key="entry.provider.id"
              type="button"
              class="hover:bg-ink-800 flex w-full items-center gap-2 px-2.5 py-1 text-left"
              :class="entry.provider.id === layer.providerId ? 'bg-accent/10' : ''"
              role="option"
              :aria-selected="entry.provider.id === layer.providerId"
              @click="choose(entry.provider)"
            >
              <span class="size-1.5 shrink-0 rounded-full" :class="DOT_CLASS[licenceInfo(entry.provider.licence.tier).severity]" />
              <span class="text-ink-50 min-w-0 flex-1 truncate text-xs">{{ entry.provider.label }}</span>
            </button>
          </div>

          <p v-if="groups.length === 0" class="text-ink-400 px-2.5 py-3 text-xs">No layer matches “{{ query }}”.</p>
        </div>

        <!-- The way out to the wordy surface, and the only trace of what was filtered out. -->
        <button type="button" class="border-ink-800 text-ink-400 hover:text-ink-50 shrink-0 border-t px-2.5 py-1.5 text-left text-[11px]" @click="showEverything">
          <span v-if="gatedCount > 0">{{ gatedCount }} more need an API key — </span>open the layer manager →
        </button>
      </div>
    </Teleport>
  </div>
</template>
