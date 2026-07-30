import { useDebounceFn } from "@vueuse/core";
import { computed, ref, watch } from "vue";

import type { CameraState } from "@/lib/camera";
import { type Mode, paneCountFor } from "@/lib/mode";
import type { Preset } from "@/lib/presets";
import { DEFAULT_PANE_LAYERS, PROVIDER_IDS } from "@/lib/providers/registry";
import type { PaneLayer } from "@/lib/providers/types";
import { type AppStateSnapshot, decodeState, encodeState } from "@/lib/urlState";

/**
 * The app's state, as a module-level singleton, with the URL as its persistent form.
 *
 * The camera is WRITE-ONLY to the URL after startup. It is read exactly twice: once at module
 * init, and once per popstate. Watching it back into the sync group would create a delayed
 * echo that the group's synchronous guard cannot catch, because the debounce has long since
 * returned by the time the write lands.
 */

export const DEFAULT_CAMERA: CameraState = {
  // Amsterdam Centrum. Chosen because z16 sits inside the measured ceiling of both opening
  // panes, so nothing is blank on first paint, and the resolution gap between VersaTiles'
  // Dutch orthophoto and Esri's commercial imagery is obvious with no explanatory copy.
  center: [4.893, 52.373],
  zoom: 16,
  bearing: 0,
  pitch: 0,
  roll: 0,
};

/**
 * DEFAULT_PANE_LAYERS is shared readonly registry data, so every pane list is built from
 * copies. Handing the registry's own objects to a reactive ref would let a pane change mutate
 * the catalogue.
 */
function clonePaneLayer(layer: PaneLayer): PaneLayer {
  return { providerId: layer.providerId, variant: layer.variant };
}

const FALLBACK: AppStateSnapshot = {
  mode: "g2",
  camera: DEFAULT_CAMERA,
  panes: DEFAULT_PANE_LAYERS.slice(0, 2).map(clonePaneLayer),
  swipe: 0.5,
  labels: false,
};

const initial = decodeState(typeof window === "undefined" ? "" : window.location.search, PROVIDER_IDS, DEFAULT_PANE_LAYERS, FALLBACK);

const mode = ref<Mode>(initial.mode);
const camera = ref<CameraState>(initial.camera);
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
  window.history.replaceState(null, "", encodeState(snapshot(), DEFAULT_PANE_LAYERS));
}

// Camera writes are debounced because they arrive at frame rate; everything else is a discrete
// user action and is written immediately so a shared link is never a step behind.
const writeUrlDebounced = useDebounceFn(writeUrl, 300);

watch(camera, writeUrlDebounced);
watch([mode, panes, swipe, labels], writeUrl, { deep: true });

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
    const fallback = DEFAULT_PANE_LAYERS[i % DEFAULT_PANE_LAYERS.length]!;
    grown.push(clonePaneLayer(existing ?? recalled ?? fallback));
  }
  panes.value = grown;
}

/**
 * Applies a whole snapshot. Used for popstate and presets, both of which must move the maps
 * rather than merely record a new camera — the sync group is the authority on where panes are.
 */
function applySnapshot(next: AppStateSnapshot, moveCamera: (camera: CameraState) => void): void {
  if (paneCountFor(next.mode) !== panes.value.length) reconcilePanes(next.mode);
  mode.value = next.mode;
  panes.value = next.panes.map(clonePaneLayer);
  next.panes.forEach((pane, i) => (remembered.value[i] = clonePaneLayer(pane)));
  swipe.value = next.swipe;
  labels.value = next.labels;
  camera.value = next.camera;
  moveCamera(next.camera);
}

/**
 * Back and forward re-read the URL. `restoring` suppresses the write that the resulting state
 * changes would otherwise trigger, which would rewrite the entry we just navigated to.
 */
function installHistoryListener(moveCamera: (camera: CameraState) => void): void {
  if (typeof window === "undefined") return;
  // Registered at module scope for the app's whole lifetime, so plain addEventListener rather
  // than useEventListener, which expects an effect scope to dispose it.
  window.addEventListener("popstate", () => {
    restoring = true;
    try {
      applySnapshot(decodeState(window.location.search, PROVIDER_IDS, DEFAULT_PANE_LAYERS, FALLBACK), moveCamera);
    } finally {
      restoring = false;
    }
  });
}

export function useAppState() {
  return {
    mode: computed(() => mode.value),
    camera,
    panes,
    paneCount: computed(() => paneCountFor(mode.value)),
    swipe,
    blinkTopVisible,
    labels,
    installHistoryListener,

    setMode(next: Mode) {
      if (next === mode.value) return;
      reconcilePanes(next);
      mode.value = next;
      // Entering blink always starts on the top pane, so the first press is a change.
      if (next === "bl") blinkTopVisible.value = true;
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

    /** Swaps two panes, which is the quickest way to re-read a swipe comparison. */
    swapPanes(a: number, b: number) {
      const first = panes.value[a];
      const second = panes.value[b];
      if (!first || !second) return;
      panes.value[a] = second;
      panes.value[b] = first;
    },

    setLabels(enabled: boolean) {
      labels.value = enabled;
    },

    /**
     * Jumps to a preset, adopting its suggested pane pairing when it has one. Presets exist to
     * make a specific point, and the pairing is usually half of it.
     */
    applyPreset(preset: Preset, moveCamera: (camera: CameraState) => void) {
      const next: CameraState = { center: [preset.lon, preset.lat], zoom: preset.zoom, bearing: 0, pitch: 0, roll: 0 };
      if (preset.suggests) {
        // Suggested pairings are always two layers, so ensure a two-pane mode to show them.
        if (paneCountFor(mode.value) < 2) {
          reconcilePanes("g2");
          mode.value = "g2";
        }
        preset.suggests.forEach((layer, i) => {
          if (i >= panes.value.length) return;
          panes.value[i] = clonePaneLayer(layer);
          remembered.value[i] = clonePaneLayer(layer);
        });
      }
      camera.value = next;
      moveCamera(next);
    },

    /**
     * The one deliberate pushState in the app: it gives Back something to return to, and
     * flushes the debounced camera write so the copied link is current rather than 300 ms old.
     */
    sharePermalink(): string {
      const url = encodeState(snapshot(), DEFAULT_PANE_LAYERS);
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", url);
        return window.location.href;
      }
      return url;
    },
  };
}
