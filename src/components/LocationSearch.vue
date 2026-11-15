<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";
import { useEventListener } from "@vueuse/core";
import { computed, ref } from "vue";

import { useAppState } from "@/composables/useAppState";
import { isTypingTarget } from "@/composables/useKeyboardShortcuts";
import { useLocationSearch } from "@/composables/useLocationSearch";
import { useViewport } from "@/composables/useViewport";
import { coordinateToDestination, formatCoordinate } from "@/lib/coordinates";
import { type Destination, placeContext, placeCoordinates, placeToDestination, presetToDestination } from "@/lib/destination";
import { PRESETS } from "@/lib/presets";

/**
 * One way in, for three kinds of answer.
 *
 * Presets, searched places and pasted coordinates all collapse to a Destination before they get
 * here, so the list below renders one row type and arrow keys do not have to know which kind of
 * thing they are moving over. Everything specific to a source lives in its subtitle.
 *
 * A command palette in a modal rather than a dropdown off the header. The header has no room for a
 * 20rem field on a phone, and one implementation that works at every width beats a field on one
 * and a sheet on the other. The trigger still looks like a field on desktop, `/` included.
 *
 * A coordinate row shows the parse back, including the format it was read as and whether the axes
 * were swapped. There is no name to show, and no other way to catch a misreading before the camera
 * has already moved.
 */

const { goTo } = useAppState();
const { query, outcome, reset } = useLocationSearch();
const { isCompact } = useViewport();

const open = ref(false);

/**
 * Two lines, always. The tag is the compact technical fact about the row, whatever that is for the
 * source: a preset's hand-picked zoom, a coordinate's derived one, and for a place its position —
 * which is what tells two same-named towns in the same region apart.
 */
interface Row {
  key: string;
  destination: Destination;
  title: string;
  subtitle: string;
  tag: string;
}

const rows = computed<Row[]>(() => {
  const state = outcome.value;

  if (state.kind === "presets") {
    return PRESETS.map((preset) => ({
      key: preset.name,
      destination: presetToDestination(preset),
      title: preset.name,
      subtitle: preset.why,
      tag: `z${preset.zoom}`,
    }));
  }

  if (state.kind === "coordinate") {
    const { coordinate } = state;
    const destination = coordinateToDestination(coordinate);
    return [
      {
        key: "coordinate",
        destination,
        title: formatCoordinate(coordinate),
        subtitle: coordinate.note === undefined ? coordinate.format : `${coordinate.format} · ${coordinate.note}`,
        tag: `z${destination.zoom}`,
      },
    ];
  }

  if (state.kind === "places") {
    return state.places.map((place) => ({
      key: String(place.id),
      destination: placeToDestination(place),
      title: place.name,
      subtitle: placeContext(place),
      // The country code would go here, but the context line underneath already names the country.
      tag: placeCoordinates(place),
    }));
  }

  return [];
});

/** What the panel says when it has no rows. Never blank: a silent panel reads as a broken one. */
const message = computed(() => {
  const state = outcome.value;
  switch (state.kind) {
    case "too-short":
      // A spinner here would promise a request that is never made.
      return "Keep typing…";
    case "invalid-coordinate":
      return state.hint;
    case "loading":
      return "Searching…";
    case "no-matches":
      return `No place matches “${state.query}”.`;
    case "error":
      return state.message;
    default:
      return undefined;
  }
});

interface RowItem extends CommandPaletteItem {
  tag: string;
}

const GROUP_LABELS = { presets: "Worth comparing", coordinate: "Coordinate", places: "Places" } as const;

/**
 * Every group skips the palette's own fuzzy filter. Presets are a fixed list, a coordinate is
 * answered by the parser and places by the geocoder: filtering them again by label would hide a
 * place whose name matches by its alternate spelling, and a coordinate always.
 */
const groups = computed<CommandPaletteGroup[]>(() => {
  const kind = outcome.value.kind;
  if (kind !== "presets" && kind !== "coordinate" && kind !== "places") return [];
  return [
    {
      id: kind,
      label: GROUP_LABELS[kind],
      ignoreFilter: true,
      items: rows.value.map((row): RowItem => ({
        id: row.key,
        label: row.title,
        description: row.subtitle === "" ? undefined : row.subtitle,
        tag: row.tag,
        onSelect: () => choose(row),
      })),
    },
  ];
});

function choose(row: Row) {
  goTo(row.destination);
  reset();
  open.value = false;
}

/**
 * Enter with nothing highlighted takes the first row: after typing a place name the next key is
 * Enter, not Down-then-Enter. The palette only selects a highlighted item, and results that arrive
 * after typing come in with none.
 */
function onEnter(event: KeyboardEvent) {
  const root = event.currentTarget as HTMLElement;
  if (root.querySelector("[data-highlighted]")) return;
  const first = rows.value[0];
  if (first === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  choose(first);
}

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  // Otherwise the slash lands in the field it just focused.
  event.preventDefault();
  open.value = true;
});
</script>

<template>
  <UButton v-if="isCompact" icon="i-lucide-search" size="sm" color="neutral" variant="ghost" aria-label="Search a place or paste coordinates" @click="open = true" />
  <UButton
    v-else
    icon="i-lucide-search"
    size="sm"
    color="neutral"
    variant="outline"
    class="text-dimmed w-56 justify-start font-normal lg:w-80"
    aria-label="Search a place or paste coordinates"
    @click="open = true"
  >
    <span class="truncate">Search a place or coordinates</span>
    <!-- The only advertisement the shortcut gets; without it nobody discovers `/`. -->
    <template #trailing><UKbd value="/" class="ml-auto" /></template>
  </UButton>

  <UModal
    v-model:open="open"
    title="Go to a place"
    description="Search a place by name, paste coordinates, or pick a preset."
    :fullscreen="isCompact"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #content>
      <div class="contents" @keydown.enter.capture="onEnter">
        <UCommandPalette
          v-model:search-term="query"
          :groups="groups"
          :loading="outcome.kind === 'loading'"
          placeholder="Search a place or paste coordinates"
          close
          class="h-full sm:max-h-[70vh]"
          @update:open="open = $event"
        >
          <template #item-trailing="{ item }">
            <span class="text-muted shrink-0 font-mono text-[10px] tabular-nums">{{ (item as RowItem).tag }}</span>
          </template>

          <template #empty>
            <p class="text-muted px-3 py-6 text-center text-xs">{{ message ?? "Nothing to show." }}</p>
          </template>
        </UCommandPalette>
      </div>
    </template>
  </UModal>
</template>
