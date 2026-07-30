import { computed, ref } from "vue";

import type { CameraState } from "@/lib/camera";
import { type Mode, paneCountFor } from "@/lib/mode";
import { DEFAULT_PANE_LAYERS } from "@/lib/providers/registry";
import type { PaneLayer } from "@/lib/providers/types";

/**
 * The app's state, as a module-level singleton.
 *
 * URL persistence is added in a later commit. The shape is already the one the URL codec will
 * encode, so wiring it up is additive.
 *
 * The camera lives here for sharing and, later, for the URL — but it is written from the sync
 * group and never watched back into it. See useMapSync for why that direction is one-way.
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

const mode = ref<Mode>("g2");
const camera = ref<CameraState>({ ...DEFAULT_CAMERA, center: [...DEFAULT_CAMERA.center] });
const panes = ref<PaneLayer[]>(DEFAULT_PANE_LAYERS.slice(0, 2).map(clonePaneLayer));

/**
 * Selections for panes that are not currently shown.
 *
 * Deliberately not in the URL: going 4 panes -> 2 -> 4 should restore what you had, but a
 * shared link should describe only what the recipient will actually see.
 */
const remembered = ref<PaneLayer[]>(DEFAULT_PANE_LAYERS.map(clonePaneLayer));

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

export function useAppState() {
  return {
    mode: computed(() => mode.value),
    camera,
    panes,
    paneCount: computed(() => paneCountFor(mode.value)),

    setMode(next: Mode) {
      if (next === mode.value) return;
      reconcilePanes(next);
      mode.value = next;
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
  };
}
