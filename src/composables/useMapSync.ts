import { onScopeDispose } from "vue";

import type { CameraState } from "@/lib/camera";
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
 */
function moveCamera(next: CameraState): void {
  useAppState().camera.value = next;
  group.applyCamera(next);
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
