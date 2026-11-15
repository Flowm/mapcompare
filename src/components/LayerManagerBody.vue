<script setup lang="ts">
import { computed, ref } from "vue";

import LayerManagerActions from "@/components/LayerManagerActions.vue";
import { pressed } from "@/components/pressed";
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
import { licenceClasses, licenceInfo } from "@/lib/layers/licence";
import { getLayer, LAYERS } from "@/lib/layers/registry";
import { type Cadence, cadenceOf } from "@/lib/layers/time";
import { type ApiKeyName, type Category, type Layer, type Orbit, paneLayer, type ProviderId } from "@/lib/layers/types";

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
 *   - copies one pane's exact layer onto another (`→2`), and swaps a pair
 *   - lists the layers that need an API key, with the reason and a way to add one
 *
 * It is closable, and that only works because the pickers do the everyday job on their own. With
 * the panel shut the app is still fully usable and the map gets the width back.
 *
 * This is the content only. LayerManager puts it in a side column on desktop and in a bottom drawer
 * on a phone, so neither shell is baked in here.
 */

const { footer = true } = defineProps<{ footer?: boolean }>();
const emit = defineEmits<{ "open-keys": [key?: ApiKeyName]; "open-sources": [] }>();

const { panes, setPaneLayer, swapPanes } = useAppState();
const { keys } = useApiKeys();
const { activePane, groupBy, focusPane } = useLayerPanel();

/**
 * Not persisted, unlike the grouping: a filter left on from yesterday would quietly hide Layers
 * from someone who has forgotten setting it, and finding Layers is what this list is for.
 *
 * The typed text is kept apart from the facets so a keystroke does not rebuild every facet chip.
 */
const facetFilter = ref<LayerFilter>({ ...NO_FILTER });
const query = ref("");
const filter = computed<LayerFilter>(() => ({ ...facetFilter.value, text: query.value }));

function clearFilters() {
  facetFilter.value = { ...NO_FILTER };
  query.value = "";
}

const statuses = computed(() => layerStatuses(LAYERS, keys.value));
const groups = computed(() =>
  groupLayers(
    statuses.value.filter((s) => matchesFilter(s.layer, filter.value)),
    groupBy.value,
  ),
);

const facets = {
  categories: Object.entries(CATEGORY_LABELS) as [Category, string][],
  orbits: Object.entries(ORBIT_LABELS) as [Orbit, string][],
  // Only the Cadences some Layer has: a "Monthly" chip that can only ever empty the list is noise.
  cadences: (Object.entries(CADENCE_LABELS) as [Cadence, string][]).filter(([cadence]) => LAYERS.some((l) => cadenceOf(l.time) === cadence)),
};

function toggle<K extends "categories" | "orbits" | "cadences">(facet: K, value: LayerFilter[K][number]) {
  const current = facetFilter.value[facet] as readonly string[];
  const nextValues = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  facetFilter.value = { ...facetFilter.value, [facet]: nextValues };
}

/** A select item cannot carry an empty value, so "every provider" needs a name of its own. */
const ALL_PROVIDERS = "all";

/** Only Providers that have a Layer here, in catalogue order. */
const providerItems = [
  { label: "All providers", value: ALL_PROVIDERS },
  ...[...new Map(LAYERS.map((l) => [l.provider, providerLabel(l)]))].map(([value, label]) => ({ label, value })),
];

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

type Facet = "categories" | "orbits" | "cadences";

/**
 * Every facet's chips as one list, so the template renders a chip one way. Each chip carries its own
 * toggle, which keeps the facet and its value typed together instead of re-dispatching on the facet.
 */
function chipsFor<K extends Facet>(facet: K, options: [LayerFilter[K][number], string][]) {
  return options.map(([value, label]) => ({
    key: `${facet}:${value}`,
    label,
    on: (facetFilter.value[facet] as readonly string[]).includes(value),
    toggle: () => toggle(facet, value),
  }));
}

const facetChips = computed(() => [...chipsFor("categories", facets.categories), ...chipsFor("orbits", facets.orbits), ...chipsFor("cadences", facets.cadences)]);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-default shrink-0 border-b p-1.5">
      <div class="flex items-center justify-between px-1 pb-1">
        <span class="text-muted text-[10px] font-semibold tracking-wide uppercase">Panes</span>
        <UButton v-if="panes.length === 2" size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-up-down" label="swap" class="text-[10px]" @click="swapPanes(0, 1)" />
      </div>

      <div v-for="{ pane, index, layer, licence } in paneRows" :key="index" class="rounded px-1.5 py-1" :class="index === target ? 'bg-primary/15' : ''">
        <button type="button" class="flex w-full items-center gap-1.5 text-left pointer-coarse:py-1.5" :aria-pressed="index === target" @click="focusPane(index)">
          <UBadge size="sm" :color="index === target ? 'primary' : 'neutral'" :variant="index === target ? 'solid' : 'subtle'" :label="String(index + 1)" class="font-mono" />
          <span class="text-highlighted min-w-0 flex-1 truncate text-xs">{{ layer?.label ?? pane.layerId }}</span>
          <span v-if="layer && licence" class="shrink-0 text-[10px]" :class="licenceClasses(layer).text">
            {{ licence.label }}
          </span>
        </button>

        <div v-if="layer?.time || panes.length > 1" class="mt-1 flex flex-wrap items-center gap-1 pl-6">
          <TimeControl v-if="layer?.time" dense :layer="layer" :time="pane.time" @update="pickTime(index, $event)" />

          <UTooltip v-for="other in otherPanes(index)" :key="other" :text="`Copy this layer onto pane ${other + 1}`">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :label="`→${other + 1}`"
              class="font-mono text-[10px]"
              :aria-label="`Copy this layer onto pane ${other + 1}`"
              @click="copyTo(index, other)"
            />
          </UTooltip>
        </div>
      </div>
    </div>

    <div class="border-default shrink-0 space-y-1.5 border-b p-1.5">
      <UInput v-model="query" type="search" icon="i-lucide-search" size="xs" placeholder="Filter layers…" class="w-full" />

      <!-- Facets. Within a facet the chips are alternatives; across facets all must hold. -->
      <div class="flex flex-wrap gap-1" role="group" aria-label="Filter by category, orbit and cadence">
        <UButton
          v-for="chip in facetChips"
          :key="chip.key"
          size="xs"
          v-bind="pressed(chip.on, 'soft')"
          :label="chip.label"
          class="px-1.5 py-0.5 text-[10px] pointer-coarse:px-2.5 pointer-coarse:py-1.5"
          @click="chip.toggle"
        />
      </div>

      <div class="flex items-center gap-1">
        <USelect
          :model-value="filter.providers[0] ?? ALL_PROVIDERS"
          :items="providerItems"
          size="xs"
          aria-label="Provider"
          class="min-w-0 flex-1"
          @update:model-value="pickProvider"
        />
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

      <p class="text-dimmed flex items-center justify-between px-0.5 text-[10px]">
        <span>Choosing a layer sets pane {{ target + 1 }}.</span>
        <UButton v-if="isFiltering(filter)" size="xs" color="neutral" variant="link" label="clear filters" class="p-0 text-[10px]" @click="clearFilters" />
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pb-2">
      <div v-for="group in groups" :key="group.key">
        <p class="bg-ink-900/95 text-muted sticky top-0 z-10 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{{ group.label }}</p>

        <!-- Gated layers stay listed, greyed. Hiding them here would remove the discovery this app
             exists for: knowing a layer exists, and what it would cost, is most of the value. The
             per-pane pickers can afford to hide them precisely because this list does not. -->
        <button
          v-for="entry in group.entries"
          :key="entry.layer.id"
          type="button"
          class="hover:bg-elevated block w-full px-2.5 py-1.5 text-left pointer-coarse:py-2.5"
          :class="panes[target]?.layerId === entry.layer.id ? 'bg-primary/10' : ''"
          :aria-current="panes[target]?.layerId === entry.layer.id ? 'true' : undefined"
          @click="entry.enabled ? assign(entry.layer) : emit('open-keys', entry.disabled!.key)"
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
        </button>
      </div>

      <p v-if="groups.length === 0" class="text-muted px-2.5 py-3 text-xs">No layer matches these filters.</p>
    </div>

    <!-- Pinned below the list, so they stay reachable while it scrolls. The drawer shows them in its
         header instead. -->
    <div v-if="footer" class="border-default flex shrink-0 items-center gap-1 border-t p-1.5">
      <LayerManagerActions @open-keys="emit('open-keys')" @open-sources="emit('open-sources')" />
    </div>
  </div>
</template>
