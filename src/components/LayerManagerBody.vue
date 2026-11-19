<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed, nextTick, ref, watch } from "vue";

import LayerManagerActions from "@/components/LayerManagerActions.vue";
import { pressed } from "@/components/pressed";
import TimeControl from "@/components/TimeControl.vue";
import { useApiKeys } from "@/composables/useApiKeys";
import { useAppState } from "@/composables/useAppState";
import { findLayer, useCatalogue } from "@/composables/useCatalogue";
import { useDialogs } from "@/composables/useDialogs";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { useViewport } from "@/composables/useViewport";
import { isAddedLayer } from "@/lib/layers/added";
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
import { licenceClasses, licenceInfo } from "@/lib/layers/licence";
import { type Cadence, cadenceOf } from "@/lib/layers/time";
import { type Category, type Layer, type Orbit, paneLayer, type ProviderId } from "@/lib/layers/types";

/**
 * The whole catalogue, and the whole deck, in one surface.
 *
 * This is the app's second job made into a surface: anyone can put two images side by side, the
 * useful part is knowing that the sharper one is the one you are not allowed to use. So everything
 * wordy lives here — notes, licence tiers, which panes use what, the API keys and the sources
 * table — and the per-pane pickers stay one-line switchers.
 *
 * It does three things a per-pane popover cannot:
 *
 *   - shows every pane at once, so a four-up deck reads without opening four menus
 *   - copies one pane's exact layer onto another, and swaps any two, from each pane's menu
 *   - lists the layers that need an API key, with the reason and a way to add one
 *
 * It is closable, and that only works because the pickers do the everyday job on their own. With
 * the panel shut the app is still fully usable and the map gets the width back.
 *
 * This is the content only. LayerManager puts it in a side column on desktop and in a bottom drawer
 * on a phone, so neither shell is baked in here.
 */

const { footer = true } = defineProps<{ footer?: boolean }>();

const { panes, setPaneLayer, swapPanes, removeAddedLayer } = useAppState();
const { keys } = useApiKeys();
const { activePane, groupBy, focusPane, searchPending, managerSearchHandled } = useLayerPanel();
const { isCompact } = useViewport();
const { catalogue, isSaved, saveLayer } = useCatalogue();
const { openKeys, openAddLayer } = useDialogs();

/**
 * Not persisted, unlike the grouping: a filter left on from yesterday would quietly hide Layers
 * from someone who has forgotten setting it, and finding Layers is what this list is for.
 *
 * The typed text is kept apart from the facets so a keystroke does not rebuild every facet chip.
 */
const facetFilter = ref<LayerFilter>({ ...NO_FILTER });
const query = ref("");
const filter = computed<LayerFilter>(() => ({ ...facetFilter.value, text: query.value }));

/**
 * The facets fold away behind one button. Open, they took most of a phone's half-height drawer, so
 * opening the manager to pick a layer showed no layer at all. The button's count and the summary
 * line under the search say when a folded filter is still narrowing the list.
 */
const filtersOpen = ref(false);
const activeFacets = computed(() => {
  const f = facetFilter.value;
  return f.categories.length + f.orbits.length + f.cadences.length + f.providers.length;
});

/**
 * Asked for by a picker's "Layer manager" entry. Not on a phone, where focus would raise the
 * keyboard over the drawer that was just opened to show the list. Waits a frame for the popover
 * that asked to close and hand focus back to its trigger, which would otherwise take it straight
 * back.
 */
const SEARCH_ID = "layer-manager-search";
watch(
  searchPending,
  async (pending) => {
    if (!pending) return;
    managerSearchHandled();
    if (isCompact.value) return;
    await nextTick();
    requestAnimationFrame(() => {
      const input = document.getElementById(SEARCH_ID);
      if (!(input instanceof HTMLInputElement)) return;
      input.focus();
      input.select();
    });
  },
  { immediate: true },
);

function clearFilters() {
  facetFilter.value = { ...NO_FILTER };
  query.value = "";
}

const statuses = computed(() => layerStatuses(catalogue.value, keys.value));
const matching = computed(() => statuses.value.filter((s) => matchesFilter(s.layer, filter.value)));
const groups = computed(() => groupLayers(matching.value, groupBy.value));

const facets = computed(() => ({
  categories: Object.entries(CATEGORY_LABELS) as [Category, string][],
  orbits: Object.entries(ORBIT_LABELS) as [Orbit, string][],
  // Only the Cadences some Layer has: a "Monthly" chip that can only ever empty the list is noise.
  cadences: (Object.entries(CADENCE_LABELS) as [Cadence, string][]).filter(([cadence]) => catalogue.value.some((l) => cadenceOf(l.time) === cadence)),
}));

function toggle<K extends "categories" | "orbits" | "cadences">(facet: K, value: LayerFilter[K][number]) {
  const current = facetFilter.value[facet] as readonly string[];
  const nextValues = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  facetFilter.value = { ...facetFilter.value, [facet]: nextValues };
}

/** A select item cannot carry an empty value, so "every provider" needs a name of its own. */
const ALL_PROVIDERS = "all";

/** Only Providers that have a Layer here, in catalogue order. */
const providerItems = computed(() => [
  { label: "All providers", value: ALL_PROVIDERS },
  ...[...new Map(catalogue.value.map((l) => [l.provider, providerLabel(l)]))].map(([value, label]) => ({ label, value })),
]);

const GROUPINGS: { value: GroupBy; label: string }[] = [
  { value: "provider", label: "by provider" },
  { value: "category", label: "by type" },
];

function pickProvider(value: unknown) {
  // The options are built from the registry, so the value is always one of its Provider ids.
  facetFilter.value = { ...facetFilter.value, providers: value === ALL_PROVIDERS || typeof value !== "string" ? [] : [value as ProviderId] };
}

/** `activePane` outlives the pane it pointed at when the mode shrinks the deck. */
const target = computed(() => Math.min(activePane.value, panes.value.length - 1));

/** Which panes show each Layer — the badges that make a four-up deck legible. Built once per change, not per row. */
const paneUsage = computed(() => {
  const usage = new Map<string, number[]>();
  panes.value.forEach((pane, index) => usage.set(pane.layerId, [...(usage.get(pane.layerId) ?? []), index]));
  return usage;
});

/** Each pane with its Layer looked up once, rather than once per binding in the template. */
const paneRows = computed(() =>
  panes.value.map((pane, index) => {
    const layer = findLayer(pane.layerId);
    return { pane, index, layer, licence: layer ? licenceInfo(layer.licence.tier) : undefined };
  }),
);

function otherPanes(index: number): number[] {
  return panes.value.map((_, i) => i).filter((i) => i !== index);
}

/** What one pane can do to the others: an identical second view, or trading places. */
function paneMenu(index: number): DropdownMenuItem[][] {
  const others = otherPanes(index);
  return [
    others.map((other) => ({ label: `Copy onto pane ${other + 1}`, icon: "i-lucide-copy", onSelect: () => copyTo(index, other) })),
    others.map((other) => ({ label: `Swap with pane ${other + 1}`, icon: "i-lucide-arrow-left-right", onSelect: () => swapPanes(index, other) })),
  ];
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

type Facet = "categories" | "orbits" | "cadences";

/**
 * Each facet's chips, so the template renders a chip one way. Each chip carries its own toggle,
 * which keeps the facet and its value typed together instead of re-dispatching on the facet.
 */
function chipsFor<K extends Facet>(facet: K, options: [LayerFilter[K][number], string][]) {
  return options.map(([value, label]) => ({
    key: `${facet}:${value}`,
    label,
    on: (facetFilter.value[facet] as readonly string[]).includes(value),
    toggle: () => toggle(facet, value),
  }));
}

/** One labelled row per facet, so it reads which chips are alternatives to each other. */
const facetRows = computed(() => [
  { key: "categories", label: "Type", chips: chipsFor("categories", facets.value.categories) },
  { key: "orbits", label: "Orbit", chips: chipsFor("orbits", facets.value.orbits) },
  { key: "cadences", label: "Cadence", chips: chipsFor("cadences", facets.value.cadences) },
]);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-default shrink-0 border-b p-1.5">
      <div class="flex items-center justify-between px-1 pb-1">
        <span class="text-muted text-[10px] font-semibold tracking-wide uppercase">Panes</span>
        <UButton v-if="panes.length === 2" size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-up-down" label="swap" class="text-[10px]" @click="swapPanes(0, 1)" />
      </div>

      <div v-for="{ pane, index, layer, licence } in paneRows" :key="index" class="rounded px-1.5 py-1" :class="index === target ? 'bg-primary/15' : ''">
        <div class="flex items-center gap-1">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-left pointer-coarse:py-1.5" :aria-pressed="index === target" @click="focusPane(index)">
            <UBadge size="sm" :color="index === target ? 'primary' : 'neutral'" :variant="index === target ? 'solid' : 'subtle'" :label="String(index + 1)" class="font-mono" />
            <span class="text-highlighted min-w-0 flex-1 truncate text-xs">{{ layer?.label ?? pane.layerId }}</span>
            <span v-if="layer && licence" class="shrink-0 text-[10px]" :class="licenceClasses(layer).text">
              {{ licence.label }}
            </span>
          </button>
          <!-- A sibling of the row's button, not inside it, so it stays reachable by keyboard. -->
          <UDropdownMenu v-if="panes.length > 1" :items="paneMenu(index)" :content="{ align: 'end' }">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis" class="-my-1" :aria-label="`Copy or swap pane ${index + 1}`" />
          </UDropdownMenu>
        </div>

        <div v-if="layer?.time" class="mt-1 flex flex-wrap items-center gap-1 pl-6">
          <TimeControl dense :layer="layer" :time="pane.time" @update="pickTime(index, $event)" />
        </div>
      </div>
    </div>

    <div class="border-default shrink-0 space-y-1.5 border-b p-1.5">
      <div class="flex items-center gap-1">
        <UInput :id="SEARCH_ID" v-model="query" type="search" icon="i-lucide-search" size="xs" placeholder="Filter layers…" aria-label="Filter layers" class="min-w-0 flex-1" />
        <UTooltip :text="filtersOpen ? 'Hide filters' : 'Filter by type, orbit, cadence and provider'">
          <UButton
            size="xs"
            icon="i-lucide-sliders-horizontal"
            :color="filtersOpen || activeFacets > 0 ? 'primary' : 'neutral'"
            :variant="filtersOpen || activeFacets > 0 ? 'soft' : 'outline'"
            :label="activeFacets > 0 ? String(activeFacets) : undefined"
            :aria-label="activeFacets > 0 ? `Filters, ${activeFacets} on` : 'Filters'"
            :aria-expanded="filtersOpen"
            aria-controls="layer-filters"
            @click="filtersOpen = !filtersOpen"
          />
        </UTooltip>
        <UTooltip text="Add a layer by URL: STAC, COG or XYZ tiles">
          <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-plus" label="Add" @click="openAddLayer" />
        </UTooltip>
      </div>

      <!-- Within a facet the chips are alternatives; across facets all must hold. -->
      <div v-if="filtersOpen" id="layer-filters" class="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 px-0.5">
        <template v-for="row in facetRows" :key="row.key">
          <span :id="`facet-${row.key}`" class="text-dimmed text-[10px]">{{ row.label }}</span>
          <div class="flex flex-wrap gap-1" role="group" :aria-labelledby="`facet-${row.key}`">
            <UButton
              v-for="chip in row.chips"
              :key="chip.key"
              size="xs"
              v-bind="pressed(chip.on, 'soft')"
              :label="chip.label"
              class="px-1.5 py-0.5 text-[10px] pointer-coarse:px-2.5 pointer-coarse:py-1.5"
              @click="chip.toggle"
            />
          </div>
        </template>

        <span class="text-dimmed text-[10px]">Provider</span>
        <USelect :model-value="filter.providers[0] ?? ALL_PROVIDERS" :items="providerItems" size="xs" aria-label="Provider" class="min-w-0" @update:model-value="pickProvider" />

        <span class="text-dimmed text-[10px]">Group</span>
        <UFieldGroup size="xs" aria-label="Group by">
          <UButton
            v-for="grouping in GROUPINGS"
            :key="grouping.value"
            :label="grouping.label"
            v-bind="pressed(groupBy === grouping.value, 'soft')"
            class="text-[10px]"
            @click="groupBy = grouping.value"
          />
        </UFieldGroup>
      </div>

      <p class="text-dimmed flex items-center justify-between gap-2 px-0.5 text-[10px]" aria-live="polite">
        <span>
          <template v-if="isFiltering(filter)">{{ matching.length }} of {{ statuses.length }} layers · </template>
          Choosing a layer sets pane {{ target + 1 }}.
        </span>
        <UButton v-if="isFiltering(filter)" size="xs" color="neutral" variant="link" label="clear filters" class="shrink-0 p-0 text-[10px]" @click="clearFilters" />
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pb-2">
      <div v-for="group in groups" :key="group.key">
        <p class="bg-ink-900/95 text-muted sticky top-0 z-10 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{{ group.label }}</p>

        <!-- Gated layers stay listed, greyed. Hiding them here would remove the discovery this app
             exists for: knowing a layer exists, and what it would cost, is most of the value. The
             per-pane pickers can afford to hide them precisely because this list does not. -->
        <div v-for="entry in group.entries" :key="entry.layer.id" class="group relative">
          <button
            type="button"
            class="hover:bg-elevated block w-full px-2.5 py-1.5 text-left pointer-coarse:py-2.5"
            :class="panes[target]?.layerId === entry.layer.id ? 'bg-primary/10' : ''"
            :aria-current="panes[target]?.layerId === entry.layer.id ? 'true' : undefined"
            @click="entry.enabled ? assign(entry.layer) : openKeys(entry.disabled!.key)"
          >
            <span class="flex items-center gap-1.5" :class="entry.enabled ? '' : 'opacity-55'">
              <span class="size-1.5 shrink-0 rounded-full" :class="licenceClasses(entry.layer).dot" />
              <span class="text-highlighted min-w-0 flex-1 truncate text-xs">{{ entry.layer.label }}</span>
              <!-- The badges are digits to the eye; a screen reader hears what they mean. -->
              <span v-if="paneUsage.get(entry.layer.id)" class="sr-only"
                >, on pane
                {{
                  paneUsage
                    .get(entry.layer.id)!
                    .map((i) => i + 1)
                    .join(" and ")
                }}</span
              >
              <UBadge v-for="paneIndex in paneUsage.get(entry.layer.id)" :key="paneIndex" size="sm" :label="String(paneIndex + 1)" class="shrink-0 font-mono" aria-hidden="true" />
              <UBadge v-if="entry.disabled" size="sm" color="neutral" variant="outline" trailing-icon="i-lucide-key-round" label="key" class="shrink-0" />
            </span>
            <span class="mt-0.5 flex items-baseline justify-between gap-2" :class="entry.enabled ? '' : 'opacity-55'">
              <span class="text-muted line-clamp-2 text-[11px] leading-snug"
                ><span v-if="groupBy === 'category'" class="text-toned">{{ providerLabel(entry.layer) }} · </span>{{ entry.layer.note }}</span
              >
              <span class="shrink-0 text-[10px]" :class="licenceClasses(entry.layer).text">{{ licenceInfo(entry.layer.licence.tier).label }}</span>
            </span>
            <!-- Said, not hovered: on a phone a title is never seen, and this is why the row is grey. -->
            <span v-if="entry.disabled" class="text-warning mt-0.5 block text-[10px] leading-snug">{{ entry.disabled.message }}</span>
            <span v-if="isAddedLayer(entry.layer) && !isSaved(entry.layer.id)" class="text-primary mt-0.5 block text-[10px] leading-snug"
              >From a link, for this session only. Keep it to save it.</span
            >
          </button>
          <!-- A sibling, not a child: a button inside the row's button is invalid and unreachable by keyboard. -->
          <div
            v-if="isAddedLayer(entry.layer)"
            class="bg-ink-950/90 absolute right-1.5 bottom-1 flex gap-0.5 rounded opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          >
            <UTooltip v-if="!isSaved(entry.layer.id)" text="Keep this layer in this browser">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-bookmark-plus" :aria-label="`Keep ${entry.layer.label}`" @click="saveLayer(entry.layer)" />
            </UTooltip>
            <UTooltip text="Remove this layer. A link that shows it can still bring it back, for that session.">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="`Remove ${entry.layer.label}`" @click="removeAddedLayer(entry.layer.id)" />
            </UTooltip>
          </div>
        </div>
      </div>

      <div v-if="groups.length === 0" class="px-2.5 py-4 text-center">
        <p class="text-muted text-xs">No layer matches these filters.</p>
        <UButton size="xs" color="neutral" variant="outline" label="Clear filters" class="mt-2" @click="clearFilters" />
      </div>
    </div>

    <!-- Pinned below the list, so they stay reachable while it scrolls. The drawer shows them in its
         header instead. -->
    <div v-if="footer" class="border-default flex shrink-0 items-center gap-1 border-t p-1.5">
      <LayerManagerActions />
    </div>
  </div>
</template>
