<script setup lang="ts">
import { computed, ref } from "vue";

import TimeControl from "@/components/TimeControl.vue";
import { useApiKeys } from "@/composables/useApiKeys";
import { useAppState } from "@/composables/useAppState";
import { useLayerPanel } from "@/composables/useLayerPanel";
import {
  CADENCE_LABELS,
  CATEGORY_LABELS,
  type GroupBy,
  groupLayers,
  isFiltering,
  type LayerFilter,
  layerStatuses,
  matchesFilter,
  NO_FILTER,
  ORBIT_LABELS,
  providerLabel,
} from "@/lib/layers/availability";
import { licenceInfo } from "@/lib/layers/licence";
import { getLayer, LAYERS } from "@/lib/layers/registry";
import { type Cadence, cadenceOf } from "@/lib/layers/time";
import { type ApiKeyName, type Category, type Layer, type Orbit, paneLayer, type ProviderId } from "@/lib/layers/types";
import { SEVERITY_CLASSES } from "@/lib/severity";

/**
 * The whole catalogue, and the whole deck, in one column.
 *
 * This is the app's second job made into a surface: anyone can put two images side by side, the
 * useful part is knowing that the sharper one is the one you are not allowed to use. So everything
 * wordy lives here — notes, licence tiers, which panes use what, the API keys and the sources
 * table — and the per-pane pickers stay one-line switchers.
 *
 * It does three things a per-pane popover cannot:
 *
 *   - shows every pane at once, so a four-up deck reads without opening four menus
 *   - copies one pane's exact layer onto another (`→2`), and swaps a pair
 *   - lists the layers that need an API key, with the reason and a way to add one
 *
 * It is closable, and that only works because the pickers do the everyday job on their own. With
 * the panel shut the app is still fully usable and the map gets the width back.
 */

const emit = defineEmits<{ "open-keys": [key?: ApiKeyName]; "open-sources": [] }>();

const { panes, setPaneLayer, swapPanes } = useAppState();
const { keys } = useApiKeys();
const { activePane, groupBy, closePanel, focusPane } = useLayerPanel();

/**
 * Not persisted, unlike the grouping: a filter left on from yesterday would quietly hide Layers
 * from someone who has forgotten setting it, and finding Layers is what this list is for.
 */
const filter = ref<LayerFilter>({ ...NO_FILTER });

const statuses = computed(() => layerStatuses(LAYERS, keys.value));
const gatedCount = computed(() => statuses.value.filter((s) => !s.enabled).length);
const groups = computed(() =>
  groupLayers(
    statuses.value.filter((s) => matchesFilter(s.layer, filter.value)),
    groupBy.value,
  ),
);

/** Only Providers that have a Layer here, in catalogue order. */
const providerOptions = computed(() => [...new Map(LAYERS.map((l) => [l.provider, providerLabel(l)]))].map(([key, label]) => ({ key, label })));

const facets = {
  categories: Object.entries(CATEGORY_LABELS) as [Category, string][],
  orbits: Object.entries(ORBIT_LABELS) as [Orbit, string][],
  // Only the Cadences some Layer has: a "Monthly" chip that can only ever empty the list is noise.
  cadences: (Object.entries(CADENCE_LABELS) as [Cadence, string][]).filter(([cadence]) => LAYERS.some((l) => cadenceOf(l.time) === cadence)),
};

function toggle<K extends "categories" | "orbits" | "cadences">(facet: K, value: LayerFilter[K][number]) {
  const current = filter.value[facet] as readonly string[];
  const nextValues = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  filter.value = { ...filter.value, [facet]: nextValues };
}

function pickProvider(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  // The options are built from the registry, so the value is always one of its Provider ids.
  filter.value = { ...filter.value, providers: value === "" ? [] : [value as ProviderId] };
}

function setText(event: Event) {
  filter.value = { ...filter.value, text: (event.target as HTMLInputElement).value };
}

function setGroupBy(value: GroupBy) {
  groupBy.value = value;
}

/** `activePane` outlives the pane it pointed at when the mode shrinks the deck. */
const target = computed(() => Math.min(activePane.value, panes.value.length - 1));

/** Which panes show a given Layer — the badges that make a four-up deck legible. */
function panesUsing(layerId: string): number[] {
  return panes.value.flatMap((pane, index) => (pane.layerId === layerId ? [index] : []));
}

/** Each pane with its Layer looked up once, rather than once per binding in the template. */
const paneRows = computed(() =>
  panes.value.map((pane, index) => {
    const layer = getLayer(pane.layerId);
    return { pane, index, layer, licence: layer ? licenceInfo(layer.licence.tier) : undefined };
  }),
);

function otherPanes(index: number): number[] {
  return panes.value.map((_, i) => i).filter((i) => i !== index);
}

function pickTime(index: number, time: string | undefined) {
  const layerId = panes.value[index]!.layerId;
  setPaneLayer(index, paneLayer(layerId, time));
}

/** Copies a pane's whole Layer, Time included: the point is an identical second view. */
function copyTo(from: number, to: number) {
  const source = panes.value[from];
  if (!source) return;
  setPaneLayer(to, { ...source });
}

function assign(layer: Layer) {
  setPaneLayer(target.value, { layerId: layer.id });
}

const chip = (on: boolean) =>
  on
    ? "border-primary/70 bg-primary/15 text-ink-50 rounded border px-1.5 py-0.5 text-[10px]"
    : "border-ink-700 text-ink-400 hover:text-ink-50 rounded border px-1.5 py-0.5 text-[10px]";
</script>

<template>
  <aside class="border-ink-700 bg-ink-950 flex w-[18rem] shrink-0 flex-col border-l" aria-label="Layer manager">
    <div class="border-ink-800 flex shrink-0 items-center gap-1 border-b px-2.5 py-1.5">
      <h2 class="text-ink-200 flex-1 text-xs font-medium">Layers</h2>
      <button type="button" class="text-ink-400 hover:text-ink-50 rounded px-1 text-xs" title="Hide the panel — each pane keeps its own picker" @click="closePanel">×</button>
    </div>

    <div class="border-ink-800 shrink-0 border-b p-1.5">
      <div class="flex items-center justify-between px-1 pb-1">
        <span class="text-ink-400 text-[10px] font-semibold tracking-wide uppercase">Panes</span>
        <button v-if="panes.length === 2" type="button" class="text-ink-400 hover:text-ink-50 text-[10px]" title="Swap the two panes" @click="swapPanes(0, 1)">swap ⇅</button>
      </div>

      <div v-for="{ pane, index, layer, licence } in paneRows" :key="index" class="rounded px-1.5 py-1" :class="index === target ? 'bg-primary/15' : ''">
        <button type="button" class="flex w-full items-center gap-1.5 text-left" :aria-pressed="index === target" @click="focusPane(index)">
          <span class="rounded px-1 font-mono text-[10px]" :class="index === target ? 'bg-primary text-ink-950' : 'bg-ink-800 text-ink-200'">{{ index + 1 }}</span>
          <span class="text-ink-50 min-w-0 flex-1 truncate text-xs">{{ layer?.label ?? pane.layerId }}</span>
          <span v-if="licence" class="shrink-0 text-[10px]" :class="SEVERITY_CLASSES[licence.severity].text">
            {{ licence.label }}
          </span>
        </button>

        <div v-if="layer?.time || panes.length > 1" class="mt-0.5 flex flex-wrap items-center gap-1 pl-5">
          <TimeControl v-if="layer?.time" dense :layer="layer" :time="pane.time" @update="pickTime(index, $event)" />

          <button
            v-for="other in otherPanes(index)"
            :key="other"
            type="button"
            class="border-ink-700 text-ink-400 hover:text-ink-50 hover:border-ink-500 rounded border px-1 py-0.5 font-mono text-[10px]"
            :title="`Copy this layer onto pane ${other + 1}`"
            @click="copyTo(index, other)"
          >
            →{{ other + 1 }}
          </button>
        </div>
      </div>
    </div>

    <div class="border-ink-800 shrink-0 space-y-1 border-b p-1.5">
      <input
        :value="filter.text"
        type="search"
        placeholder="Filter layers…"
        class="bg-ink-900 text-ink-50 placeholder:text-ink-600 border-ink-700 focus:border-primary w-full rounded border px-2 py-1 text-xs focus:outline-none"
        @input="setText"
      />
      <!-- Facets. Within a row the chips are alternatives; across rows all must hold. -->
      <div class="flex flex-wrap gap-1" role="group" aria-label="Category">
        <button
          v-for="[value, label] in facets.categories"
          :key="value"
          type="button"
          :class="chip(filter.categories.includes(value))"
          :aria-pressed="filter.categories.includes(value)"
          @click="toggle('categories', value)"
        >
          {{ label }}
        </button>
        <button
          v-for="[value, label] in facets.orbits"
          :key="value"
          type="button"
          :class="chip(filter.orbits.includes(value))"
          :aria-pressed="filter.orbits.includes(value)"
          @click="toggle('orbits', value)"
        >
          {{ label }}
        </button>
      </div>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Cadence">
        <button
          v-for="[value, label] in facets.cadences"
          :key="value"
          type="button"
          :class="chip(filter.cadences.includes(value))"
          :aria-pressed="filter.cadences.includes(value)"
          @click="toggle('cadences', value)"
        >
          {{ label }}
        </button>
      </div>
      <div class="flex items-center gap-1">
        <select
          :value="filter.providers[0] ?? ''"
          aria-label="Provider"
          class="border-ink-700 bg-ink-900 text-ink-200 focus:border-primary min-w-0 flex-1 rounded border px-1 py-0.5 text-[10px] focus:outline-none"
          @change="pickProvider"
        >
          <option value="">All providers</option>
          <option v-for="option in providerOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
        </select>
        <div class="border-ink-700 flex shrink-0 items-center rounded border p-px text-[10px]" role="group" aria-label="Group by">
          <button
            type="button"
            class="rounded px-1.5 py-px"
            :class="groupBy === 'provider' ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-50'"
            :aria-pressed="groupBy === 'provider'"
            @click="setGroupBy('provider')"
          >
            by provider
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-px"
            :class="groupBy === 'category' ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-50'"
            :aria-pressed="groupBy === 'category'"
            @click="setGroupBy('category')"
          >
            by type
          </button>
        </div>
      </div>
      <p class="text-ink-600 flex justify-between px-0.5 text-[10px]">
        <span>Clicking a layer sets pane {{ target + 1 }}.</span>
        <button v-if="isFiltering(filter)" type="button" class="text-ink-400 hover:text-ink-50" @click="filter = { ...NO_FILTER }">clear filters</button>
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pb-2">
      <div v-for="group in groups" :key="group.key">
        <p class="bg-ink-900/95 text-ink-400 sticky top-0 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{{ group.label }}</p>

        <!-- Gated layers stay listed, greyed. Hiding them here would remove the discovery this app
             exists for: knowing a layer exists, and what it would cost, is most of the value. The
             per-pane pickers can afford to hide them precisely because this list does not. -->
        <button
          v-for="entry in group.entries"
          :key="entry.layer.id"
          type="button"
          class="hover:bg-ink-800 block w-full px-2.5 py-1.5 text-left"
          :class="[panes[target]?.layerId === entry.layer.id ? 'bg-primary/10' : '', entry.enabled ? '' : 'opacity-55']"
          :title="entry.enabled ? undefined : entry.disabled!.message"
          @click="entry.enabled ? assign(entry.layer) : emit('open-keys', entry.disabled!.key)"
        >
          <span class="flex items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full" :class="SEVERITY_CLASSES[licenceInfo(entry.layer.licence.tier).severity].dot" />
            <span class="text-ink-50 min-w-0 flex-1 truncate text-xs">{{ entry.layer.label }}</span>
            <span v-for="paneIndex in panesUsing(entry.layer.id)" :key="paneIndex" class="bg-primary text-ink-950 shrink-0 rounded px-1 font-mono text-[10px]">
              {{ paneIndex + 1 }}
            </span>
            <span v-if="entry.disabled" class="border-ink-600 text-ink-200 shrink-0 rounded border px-1 text-[10px]">key ↗</span>
          </span>
          <span class="mt-0.5 flex items-baseline justify-between gap-2">
            <span class="text-ink-400 line-clamp-2 text-[11px] leading-snug"
              ><span v-if="groupBy === 'category'" class="text-ink-200">{{ providerLabel(entry.layer) }} · </span>{{ entry.layer.note }}</span
            >
            <span class="shrink-0 text-[10px]" :class="SEVERITY_CLASSES[licenceInfo(entry.layer.licence.tier).severity].text">{{
              licenceInfo(entry.layer.licence.tier).label
            }}</span>
          </span>
        </button>
      </div>

      <p v-if="groups.length === 0" class="text-ink-400 px-2.5 py-3 text-xs">No layer matches these filters.</p>
    </div>

    <!-- Keys and sources belong to the catalogue, not to the app header: one is why some rows above
         are greyed out, the other is the long form of the licence word on every row. Pinned, so
         they stay reachable while the list scrolls. -->
    <div class="border-ink-800 flex shrink-0 items-center gap-1 border-t p-1.5">
      <button type="button" class="text-ink-200 hover:bg-ink-800 rounded px-2 py-1 text-xs transition-colors" @click="emit('open-keys')">
        API keys<span v-if="gatedCount > 0" class="text-ink-400 ml-1">{{ gatedCount }}</span>
      </button>
      <button type="button" class="text-ink-200 hover:bg-ink-800 rounded px-2 py-1 text-xs transition-colors" @click="emit('open-sources')">Sources &amp; licences</button>
    </div>
  </aside>
</template>
