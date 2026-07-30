import { type CameraReadable, type CameraState, cameraEquals, readCamera } from "./camera";

/**
 * Keeps N map panes on one shared camera.
 *
 * This is the highest-risk logic in the app, so it is declared against a structural
 * interface rather than maplibre's `Map` and unit-tested against a fake — no WebGL2, no
 * canvas, no network.
 *
 * ## Why a plain boolean guard is enough
 *
 * Verified against maplibre-gl v6.0.0 (`Camera#jumpTo`): `jumpTo` fires `movestart` and
 * `move` — and then `moveend` — SYNCHRONOUSLY, inside the `jumpTo` call, unconditionally,
 * even when the resulting camera is identical to the current one. So every echo a broadcast
 * provokes lands inside that broadcast's own stack frame, where `applying` is still true.
 * That makes the guard airtight rather than merely likely to work.
 *
 * This reasoning does NOT hold for `easeTo`/`flyTo`, which fire across animation frames
 * long after the guard has been released. Never use them to propagate a camera.
 *
 * `jumpTo` also calls `stop()` first, which cancels any inertia still easing on the
 * receiving pane — exactly what we want, since the group has a new authoritative camera.
 */
export interface SyncableMap extends CameraReadable {
  jumpTo(options: CameraState): unknown;
  on(type: "move", listener: () => void): { unsubscribe: () => void };
}

export interface SyncGroup {
  /** Registers a map and returns its unregister function. */
  add(map: SyncableMap): () => void;
  /** The group's current shared camera, used to seed a newly created pane. */
  camera(): CameraState | undefined;
  /** Forces the whole group to a camera. For popstate, presets and "reset view". */
  applyCamera(camera: CameraState): void;
  /** Fires once per broadcast, so at most once per frame. Subscribers should debounce. */
  onChange(listener: (camera: CameraState) => void): () => void;
  /** Number of registered maps. For tests and diagnostics. */
  size(): number;
  destroy(): void;
}

export function createSyncGroup(initial?: CameraState): SyncGroup {
  const members = new Map<SyncableMap, { unsubscribe: () => void }[]>();
  const listeners = new Set<(camera: CameraState) => void>();
  let current = initial;
  let applying = false;

  /** Pushes `camera` to every member except `origin`, with echoes suppressed. */
  function push(camera: CameraState, origin?: SyncableMap): void {
    applying = true;
    try {
      // Snapshot the members deliberately. jumpTo re-enters this module synchronously, and a
      // subscriber may add or remove a pane, so iterating the live Map would be iterating a
      // collection that can mutate underneath us.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const map of [...members.keys()]) {
        if (map === origin) continue;
        // Skip no-op jumps. jumpTo fires its full movestart/move/moveend sequence even when
        // nothing changes, so this is a real saving rather than a micro-optimisation.
        if (cameraEquals(readCamera(map), camera)) continue;
        map.jumpTo({ ...camera });
      }
    } finally {
      applying = false;
    }
  }

  function broadcast(origin: SyncableMap): void {
    if (applying) return; // the whole feedback-loop defence, in one line
    const camera = readCamera(origin);
    current = camera;
    push(camera, origin);
    // Notified outside the guard: a subscriber must be free to call applyCamera. Snapshotted
    // for the same reason as above — a listener may unsubscribe itself or another.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const listener of [...listeners]) listener(camera);
  }

  function add(map: SyncableMap): () => void {
    if (current) {
      // Seed the newcomer BEFORE subscribing, with the guard held. Subscribing first would
      // let its constructor-time camera broadcast a stale view to the whole group.
      applying = true;
      try {
        map.jumpTo({ ...current });
      } finally {
        applying = false;
      }
    } else {
      // First member defines the group camera.
      current = readCamera(map);
    }

    // `move` rather than `moveend`: panes lagging behind the one being dragged makes the
    // swipe seam visibly tear. `move` already covers rotate, pitch and roll.
    members.set(map, [map.on("move", () => broadcast(map))]);

    return () => {
      for (const subscription of members.get(map) ?? []) subscription.unsubscribe();
      members.delete(map);
    };
  }

  return {
    add,
    camera: () => current,
    applyCamera(camera) {
      current = camera;
      push(camera);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    size: () => members.size,
    destroy() {
      for (const subscriptions of members.values()) {
        for (const subscription of subscriptions) subscription.unsubscribe();
      }
      members.clear();
      listeners.clear();
    },
  };
}
