import { computed, onScopeDispose, ref } from "vue";

import { clampCamera, type CameraState, ZOOM_LIMITS } from "@/lib/camera";
import { createSyncGroup, type SyncableMap } from "@/lib/syncGroup";

/**
 * The one owner of where the panes are looking.
 *
 * Previously this was split: `syncGroup` held the shared camera, `useAppState` held a second copy
 * as a writable ref, and four separate sites assigned to it. Nothing enforced which was the
 * authority — four comment blocks across four files were the specification — and because
 * `useMapSync` had to import `useAppState`, the reverse import was impossible, so `moveCamera` was
 * threaded by hand as a parameter of three unrelated functions.
 *
 * Ownership is now structural. This module sits below `useAppState`, holds the group and the
 * recorded camera together, and exposes exactly two directions:
 *
 *   READ  `camera` — where the panes actually are. Written only by the group's own `onChange`,
 *         which fires when a user gesture moves a pane. Handed out read-only.
 *   WRITE `moveCamera` — move every pane there AND record it. Both halves are needed: the group
 *         deliberately does not notify listeners when pushed from outside, so a caller that only
 *         pushed would move the maps while leaving the readout, the URL and the badges describing
 *         the old view.
 *
 * The single write path is also the single place a camera is clamped, which is why an out-of-range
 * preset can no longer be recorded as a zoom no pane can be at.
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

const group = createSyncGroup();

/**
 * Seeded to the default so there is always a camera to read. `useAppState` overwrites it with the
 * URL's camera during its own module init, via `moveCamera` — at which point no pane is registered
 * yet, so the push reaches nobody and only sets the group's authoritative camera. Every pane that
 * registers later is then jumped to it by `group.add`, which is what makes the group the single
 * authority on where panes start rather than one of two competing seeds.
 */
const recorded = ref<CameraState>(DEFAULT_CAMERA);

const camera = computed(() => recorded.value);

/**
 * Registered once, for the app's lifetime, rather than wired up by a component.
 *
 * This is the read path, and the only writer of `recorded`. App.vue used to own this line and had
 * to explain in a comment why nothing watches the result back into the group — the loop is now
 * impossible to write rather than merely documented as forbidden.
 */
group.onChange((next) => (recorded.value = next));

/**
 * Registers a map for the lifetime of the calling scope.
 *
 * Callers should still call the returned function explicitly BEFORE `map.remove()`: a `move` fired
 * during `remove()` would otherwise reach a broadcast that touches a half-destroyed map. Calling it
 * twice is safe.
 */
export function registerPane(map: SyncableMap): () => void {
  let unregister = group.add(map);
  const once = () => {
    unregister();
    unregister = () => {};
  };
  onScopeDispose(once);
  return once;
}

/** Moves every pane to `next` and records it. The app's only camera write path. */
export function moveCamera(next: CameraState): void {
  const safe = clampCamera(next, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
  recorded.value = safe;
  group.applyCamera(safe);
}

export function useCamera() {
  return { camera, moveCamera, registerPane };
}
