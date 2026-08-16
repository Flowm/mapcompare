<script setup lang="ts">
import { onClickOutside, useEventListener } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";

import { useAppState } from "@/composables/useAppState";
import { isTypingTarget } from "@/composables/useKeyboardShortcuts";
import { useLocationSearch } from "@/composables/useLocationSearch";
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
 * The panel is a plain absolutely-positioned sibling rather than a teleported one, like the menu it
 * replaces: it hangs off the header, where nothing clips it. BasemapPicker needs the teleport
 * because it opens inside a pane, under `overflow-hidden` and a swipe seam's `clip-path`.
 *
 * A coordinate row shows the parse back, including the format it was read as and whether the axes
 * were swapped. There is no name to show, and no other way to catch a misreading before the camera
 * has already moved.
 */

const { goTo } = useAppState();
const { query, outcome, reset } = useLocationSearch();

const LISTBOX_ID = "location-search-results";
const optionId = (index: number) => `location-search-option-${index}`;

const open = ref(false);
const root = ref<HTMLElement>();
const field = ref<HTMLInputElement>();
const panel = ref<HTMLElement>();
const highlight = ref(-1);

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

const showPresetHeading = computed(() => outcome.value.kind === "presets");

// A changed list invalidates whatever was highlighted in the old one.
watch(rows, () => (highlight.value = -1));

watch(highlight, async (index) => {
  if (index < 0) return;
  await nextTick();
  panel.value?.querySelector(`#${optionId(index)}`)?.scrollIntoView({ block: "nearest" });
});

/**
 * Opening is bound to `@input` rather than to a watcher on `query`, and has to stay that way:
 * `reset()` writes the query too, so a watcher reopens the panel on the way out of `choose` — you
 * pick Berlin, the camera moves, and the list is sitting there open again.
 */
function choose(row: Row | undefined) {
  if (row === undefined) return;
  goTo(row.destination);
  reset();
  open.value = false;
  // Focus goes back to the map, which is also what re-arms the 1-4 / s / b shortcuts.
  field.value?.blur();
}

function move(delta: number) {
  const count = rows.value.length;
  if (count === 0) return;
  const from = highlight.value < 0 && delta < 0 ? 0 : highlight.value;
  highlight.value = (from + delta + count) % count;
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case "ArrowDown":
      move(1);
      break;
    case "ArrowUp":
      move(-1);
      break;
    case "Enter":
      // Nothing highlighted takes the first row: after typing a place name the next key is Enter,
      // not Down-then-Enter.
      choose(rows.value[highlight.value] ?? rows.value[0]);
      break;
    case "Escape":
      if (open.value) open.value = false;
      else field.value?.blur();
      break;
    default:
      return;
  }
  event.preventDefault();
}

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  // Otherwise the slash lands in the field it just focused.
  event.preventDefault();
  open.value = true;
  field.value?.focus();
});

onClickOutside(root, () => (open.value = false));
</script>

<template>
  <!-- The width lives here, once. Field and panel both inherit it, so the panel cannot end up
       wider than the thing it hangs off. -->
  <div ref="root" class="relative w-80">
    <input
      ref="field"
      v-model="query"
      type="text"
      class="border-ink-700 bg-ink-900 text-ink-50 placeholder:text-ink-600 focus:border-accent w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
      placeholder="Search a place or coordinates"
      aria-label="Search a place or paste coordinates"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="LISTBOX_ID"
      :aria-activedescendant="highlight >= 0 ? optionId(highlight) : undefined"
      autocomplete="off"
      spellcheck="false"
      @focus="open = true"
      @input="open = true"
      @keydown="onKeydown"
    />

    <!-- The only advertisement the shortcut gets; without it nobody discovers `/`. -->
    <kbd
      v-if="!open && query === ''"
      class="border-ink-700 text-ink-600 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1 font-mono text-[10px] leading-tight"
    >
      /
    </kbd>

    <div
      v-if="open"
      :id="LISTBOX_ID"
      ref="panel"
      class="border-ink-700 bg-ink-900/98 absolute top-full left-0 z-30 mt-1 max-h-[70vh] w-full overflow-y-auto rounded border shadow-xl backdrop-blur"
      role="listbox"
      aria-label="Places"
    >
      <p v-if="showPresetHeading" class="bg-ink-800/95 text-ink-400 sticky top-0 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">Worth comparing</p>

      <!-- Not a <button>: in the activedescendant pattern the input keeps focus, and focusable rows
           would make every result a tab stop. mousedown is swallowed so the click does not blur. -->
      <div
        v-for="(row, index) in rows"
        :id="optionId(index)"
        :key="row.key"
        class="border-ink-800 hover:bg-ink-800 block w-full cursor-pointer border-b px-3 py-2 text-left last:border-b-0"
        :class="index === highlight ? 'bg-ink-800' : ''"
        role="option"
        :aria-selected="index === highlight"
        @mousedown.prevent
        @click="choose(row)"
      >
        <span class="flex items-baseline justify-between gap-2">
          <span class="text-ink-50 truncate text-xs font-medium">{{ row.title }}</span>
          <span class="text-ink-400 shrink-0 font-mono text-[10px] tabular-nums">{{ row.tag }}</span>
        </span>
        <span v-if="row.subtitle !== ''" class="text-ink-400 mt-0.5 block text-[11px] leading-snug">{{ row.subtitle }}</span>
      </div>

      <p v-if="message !== undefined" class="text-ink-400 px-3 py-3 text-xs">{{ message }}</p>
    </div>
  </div>
</template>
