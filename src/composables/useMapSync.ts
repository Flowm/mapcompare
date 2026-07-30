import { onScopeDispose } from "vue";

import type { CameraState } from "@/lib/camera";
import { createSyncGroup, type SyncableMap } from "@/lib/syncGroup";

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

export function useMapSync() {
  return {
    registerPane,
    camera: () => group.camera(),
    applyCamera: (camera: CameraState) => group.applyCamera(camera),
    onChange: (listener: (camera: CameraState) => void) => group.onChange(listener),
    size: () => group.size(),
  };
}
