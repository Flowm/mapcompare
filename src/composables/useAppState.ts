import { useDebounceFn } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";

import type { Destination } from "@/lib/destination";
import { DEFAULT_PANE_LAYERS } from "@/lib/layers/registry";
import { timeAt, upgradeLegacyTime } from "@/lib/layers/time";
import { type Layer, type PaneLayer, paneLayer } from "@/lib/layers/types";
import { type Mode, paneCountFor } from "@/lib/mode";
import { type AppStateSnapshot, decodeAddedLayers, decodeState, encodeState } from "@/lib/urlState";

import { DEFAULT_CAMERA, moveCamera, useCamera } from "./useCamera";
import { findLayer, knownLayerIds, useCatalogue } from "./useCatalogue";

/**
 * The app's state, as a module-level singleton, with the URL as its persistent form.
 *
 * The camera is not here — `useCamera` owns it, and this module only reads it in order to write the
 * URL and to push a deliberate group-wide move. That split is what removed the import cycle these
 * two used to have, and with it the `moveCamera` callback that three functions here took as a
 * parameter purely because they could not reach it.
 */

const { camera } = useCamera();

/** Whether a Layer takes part in showing one moment on every pane: one whose pictures show when. */
export function isMatchable(layer: Layer): boolean {
  return layer.category === "satellite" && layer.time !== undefined;
}
const { addedLayers, showFromLink, removeLayer } = useCatalogue();

/**
 * DEFAULT_PANE_LAYERS is shared readonly registry data, so every pane list is built from
 * copies. Handing the registry's own objects to a reactive ref would let a pane change mutate
 * the catalogue.
 */
function clonePaneLayer(layer: PaneLayer): PaneLayer {
  return paneLayer(layer.layerId, layer.time);
}

/**
 * Reads a link as this build understands it: an old Wayback release id becomes the snapshot's
 * ISO Time, so nothing past this point has to know ids were ever in URLs.
 */
function readUrl(search: string): AppStateSnapshot {
  // First, so the panes that name the Layers a link carries find them in the catalogue. For this
  // session only: a link is read again on every Back and Forward, and must not re-save anything.
  showFromLink(decodeAddedLayers(search));
  const decoded = decodeState(search, knownLayerIds(), DEFAULT_PANE_LAYERS, FALLBACK);
  return { ...decoded, panes: decoded.panes.map((p) => paneLayer(p.layerId, upgradeLegacyTime(findLayer(p.layerId)?.time, p.time))) };
}

const FALLBACK: AppStateSnapshot = {
  mode: "g2",
  camera: DEFAULT_CAMERA,
  panes: DEFAULT_PANE_LAYERS.slice(0, 2).map(clonePaneLayer),
  swipe: 0.5,
  labels: false,
};

const initial = readUrl(typeof window === "undefined" ? "" : window.location.search);

const mode = ref<Mode>(initial.mode);
const panes = ref<PaneLayer[]>(initial.panes.map(clonePaneLayer));

/**
 * Selections for panes that are not currently shown.
 *
 * Deliberately not in the URL: going 4 panes -> 2 -> 4 should restore what you had, but a
 * shared link should describe only what the recipient will actually see.
 */
const remembered = ref<PaneLayer[]>(DEFAULT_PANE_LAYERS.map(clonePaneLayer));

/** Divider position in swipe mode, as a fraction of deck width. */
const swipe = ref(initial.swipe);

/** Which layer blink mode is currently showing. Not persisted: it is a transient gesture. */
const blinkTopVisible = ref(true);

/** Global label overlay toggle. Global rather than per-pane, see useResolvedStyle. */
const labels = ref(initial.labels);

// Hand the URL's camera to its owner. No pane exists yet, so this only establishes the group's
// authoritative camera, which every pane is then seeded from as it registers.
moveCamera(initial.camera);

function snapshot(): AppStateSnapshot {
  return { mode: mode.value, camera: camera.value, panes: panes.value, swipe: swipe.value, labels: labels.value };
}

/** Set while applying a popstate, so restoring history does not immediately rewrite it. */
let restoring = false;

/**
 * replaceState, never pushState. The camera changes on every frame of a drag, and one history
 * entry per frame would obliterate the back button. `sharePermalink` makes the single
 * deliberate pushState, so Back returns to the pre-share view.
 */
function writeUrl(): void {
  if (restoring || typeof window === "undefined") return;
  window.history.replaceState(null, "", encodeState(snapshot(), DEFAULT_PANE_LAYERS, addedLayers.value));
}

// Camera writes are debounced because they arrive at frame rate; everything else is a discrete
// user action and is written immediately so a shared link is never a step behind.
const writeUrlDebounced = useDebounceFn(writeUrl, 300);

watch(camera, writeUrlDebounced);
// The added Layers too: renaming one a pane shows changes what the link must carry.
watch([mode, panes, swipe, labels, addedLayers], writeUrl, { deep: true });

/**
 * Puts each pane's default in place of a Layer the catalogue no longer has — the hidden panes too,
 * which a mode change would otherwise bring back naming it. An Added Layer can go from under a pane
 * without this tab doing anything: removed in another tab, whose storage change reaches this one.
 */
function resetVanishedPanes(): void {
  const vanished = (pane: PaneLayer) => findLayer(pane.layerId) === undefined;
  const reset = (list: PaneLayer[]) => (list.some(vanished) ? list.map((pane, i) => (vanished(pane) ? defaultPane(i) : pane)) : list);
  panes.value = reset(panes.value);
  remembered.value = reset(remembered.value);
}

watch(addedLayers, resetVanishedPanes);

// A link that arrived with a legacy Time is rewritten at once, so copying it from the address
// bar shares the upgraded form.
if (typeof window !== "undefined") {
  const asWritten = decodeState(window.location.search, knownLayerIds(), DEFAULT_PANE_LAYERS, FALLBACK);
  if (asWritten.panes.some((p, i) => p.time !== initial.panes[i]?.time)) writeUrl();
}

/**
 * Applies a mode, and the invariants that come with it.
 *
 * Both writers go through here. `setMode` used to hold the blink rule on its own while
 * `applySnapshot` assigned `mode.value` directly, so navigating Back into a blink-mode URL landed on
 * whichever layer happened to be showing — the same transition producing two different results
 * depending on which writer performed it.
 */
function applyMode(next: Mode): void {
  mode.value = next;
  // Entering blink always starts on the top pane, so the first press is a change.
  if (next === "bl") blinkTopVisible.value = true;
}

/** What pane `index` shows when nothing has been chosen for it. */
function defaultPane(index: number): PaneLayer {
  return clonePaneLayer(DEFAULT_PANE_LAYERS[index % DEFAULT_PANE_LAYERS.length]!);
}

/** Grows or shrinks `panes` to match the mode, restoring previous choices where possible. */
function reconcilePanes(next: Mode): void {
  const wanted = paneCountFor(next);

  // Remember what is on screen before shrinking.
  panes.value.forEach((pane, i) => {
    remembered.value[i] = clonePaneLayer(pane);
  });

  const grown: PaneLayer[] = [];
  for (let i = 0; i < wanted; i += 1) {
    const existing = panes.value[i];
    const recalled = remembered.value[i];
    grown.push(clonePaneLayer(existing ?? recalled ?? defaultPane(i)));
  }
  panes.value = grown;
}

/**
 * Applies a whole snapshot. Used for popstate, which must move the maps rather than merely record a
 * new camera — `useCamera` is the authority on where panes are.
 *
 * No reconciliation: `canonicalise` guarantees a snapshot carries exactly `paneCountFor(mode)`
 * panes, so the list is taken as given. It used to call `reconcilePanes` and then overwrite its
 * result on the next line, which meant the call was there for one side effect — updating
 * `remembered` — that is now done directly and unconditionally.
 */
function applySnapshot(next: AppStateSnapshot): void {
  applyMode(next.mode);
  panes.value = next.panes.map(clonePaneLayer);
  next.panes.forEach((pane, i) => (remembered.value[i] = clonePaneLayer(pane)));
  swipe.value = next.swipe;
  labels.value = next.labels;
  moveCamera(next.camera);
}

/**
 * Back and forward re-read the URL.
 *
 * `restoring` suppresses the write that the resulting state changes would otherwise trigger, which
 * would rewrite the entry we just navigated to. It is cleared after the watchers have flushed, not
 * synchronously: the watchers are pre-flush, so they run in a microtask, and a `finally` that
 * cleared the flag on the way out of this handler released it before it had suppressed anything.
 * The result was that every Back/Forward silently rewrote its own history entry — dropping any
 * query parameter the app does not own, and replacing an unrecognised Layer id with a default.
 */
function installHistoryListener(): void {
  if (typeof window === "undefined") return;
  // Registered at module scope for the app's whole lifetime, so plain addEventListener rather
  // than useEventListener, which expects an effect scope to dispose it.
  window.addEventListener("popstate", () => {
    restoring = true;
    try {
      applySnapshot(readUrl(window.location.search));
    } finally {
      void nextTick().then(() => (restoring = false));
    }
  });
}

export function useAppState() {
  return {
    mode: computed(() => mode.value),
    camera,
    panes,
    swipe,
    blinkTopVisible,
    labels,
    installHistoryListener,

    setMode(next: Mode) {
      if (next === mode.value) return;
      reconcilePanes(next);
      applyMode(next);
    },

    setSwipe(position: number) {
      swipe.value = position;
    },

    /** Blink shows all-or-nothing of the top pane; hold a key, see the other layer. */
    setBlinkTopVisible(visible: boolean) {
      blinkTopVisible.value = visible;
    },

    toggleBlink() {
      blinkTopVisible.value = !blinkTopVisible.value;
    },

    setPaneLayer(index: number, layer: PaneLayer) {
      if (index < 0 || index >= panes.value.length) return;
      panes.value[index] = clonePaneLayer(layer);
      remembered.value[index] = clonePaneLayer(layer);
    },

    /**
     * Gives every satellite pane the same Time as one pane. A moment is shown on each at its own
     * precision, so GOES-East and Meteosat show the same instant and a daily Layer shows that day,
     * and every one is pinned, the pane it came from included: following the latest on one would let
     * it drift away from the rest. No moment means the source follows the latest, and then so does
     * every pane, each to its own newest picture, rather than all being pinned to this minute's.
     *
     * Basemaps keep their own Time. A basemap hides when (CONTEXT.md), so a moment means nothing to
     * it, and asking EOX for 2026 would only earn a "showing 2025" warning.
     */
    showTimeOnEveryPane(moment: string | undefined) {
      panes.value.forEach((pane, index) => {
        const layer = findLayer(pane.layerId);
        if (!layer?.time || !isMatchable(layer)) return;
        const time = moment === undefined ? undefined : timeAt(moment, layer.time.precision);
        if (moment !== undefined && time === undefined) return;
        panes.value[index] = paneLayer(pane.layerId, time);
        remembered.value[index] = paneLayer(pane.layerId, time);
      });
    },

    /** Swaps two panes, which is the quickest way to re-read a swipe comparison. */
    swapPanes(a: number, b: number) {
      const first = panes.value[a];
      const second = panes.value[b];
      if (!first || !second) return;
      panes.value[a] = second;
      panes.value[b] = first;
    },

    /** Forgets an Added Layer, and every pane that showed it, hidden or not, shows its default. */
    removeAddedLayer(layerId: string) {
      removeLayer(layerId);
      resetVanishedPanes();
    },

    setLabels(enabled: boolean) {
      labels.value = enabled;
    },

    /**
     * Goes to a Destination, wherever it came from — a curated preset, a searched place, or a
     * pasted coordinate. This moves the camera and touches nothing else: the layers on screen are
     * the comparison the user built, and taking that comparison somewhere else is the whole job of
     * the search bar. Bearing, pitch and roll reset so the arrival view is the one the zoom was
     * chosen for.
     */
    goTo(destination: Destination) {
      moveCamera({ center: destination.center, zoom: destination.zoom, bearing: 0, pitch: 0, roll: 0 });
    },

    /**
     * The one deliberate pushState in the app: it gives Back something to return to, and
     * flushes the debounced camera write so the copied link is current rather than 300 ms old.
     */
    sharePermalink(): string {
      const url = encodeState(snapshot(), DEFAULT_PANE_LAYERS, addedLayers.value);
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", url);
        return window.location.href;
      }
      return url;
    },
  };
}
