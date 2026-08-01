import { onScopeDispose } from "vue";

import { clampCamera, type CameraState, ZOOM_LIMITS } from "@/lib/camera";
import { createSyncGroup, type SyncableMap } from "@/lib/syncGroup";

import { useAppState } from "./useAppState";

/**
 * The app's single sync group, shared by every pane.
 *
 * Module-level rather than per-component: panes mount and unmount as the mode changes, and
 * the group has to outlive all of them.
 */
const group = createSyncGroup();

/**
 * Registers a map for the lifetime of the calling scope.
 *
 * The returned unregister function is also wired into `onScopeDispose`, but callers should
 * still call it explicitly *before* `map.remove()`. Order matters: a `move` fired during
 * `remove()` would otherwise reach a broadcast that touches a half-destroyed map.
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

/**
 * Moves every pane to `next` AND records it in app state.
 *
 * Both halves are needed, which is why this is one function rather than two. The sync group
 * deliberately does not notify its listeners when a camera is pushed from outside — otherwise it
 * would fight whoever called it — so a caller that only pushed would move the maps while leaving
 * the readout, the URL and the zoom badges describing the old view.
 *
 * This is the app's only camera WRITE path, so it is where the clamp belongs. Clamping at each
 * call site instead left `clampCamera` reachable from only one of them (the URL codec), which meant
 * an out-of-range camera from any other source — a preset, the zoom-to-native chip — would be
 * recorded and shared as a zoom no pane can actually be at: MapLibre silently clamps its own
 * transform, the resulting `move` is swallowed by the broadcast guard, and app state, the URL and
 * the canvases stay divergent until the next gesture.
 *
 * The sync group's own `onChange` is the READ path and must never be clamped: it reports where the
 * panes actually are.
 */
function moveCamera(next: CameraState): void {
  const safe = clampCamera(next, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
  useAppState().camera.value = safe;
  group.applyCamera(safe);
}

export function useMapSync() {
  return {
    registerPane,
    camera: () => group.camera(),
    applyCamera: moveCamera,
    onChange: (listener: (camera: CameraState) => void) => group.onChange(listener),
    size: () => group.size(),
  };
}
