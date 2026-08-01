import { describe, expect, it } from "vitest";
import { effectScope } from "vue";

import { ZOOM_LIMITS } from "@/lib/camera";
import type { SyncableMap } from "@/lib/syncGroup";

import { useCamera } from "./useCamera";

/**
 * `syncGroup` itself is covered against a fake map in syncGroup.test.ts. What is asserted here is
 * the ownership this module adds: one read path, one write path, and a clamp that no camera source
 * can go around.
 */

function fakeMap(start = { lng: 0, lat: 0, zoom: 0 }) {
  const jumps: { zoom: number; pitch: number }[] = [];
  let moveListener: (() => void) | undefined;
  const state = { ...start, bearing: 0, pitch: 0, roll: 0 };
  const map: SyncableMap = {
    getCenter: () => ({ lng: state.lng, lat: state.lat }),
    getZoom: () => state.zoom,
    getBearing: () => state.bearing,
    getPitch: () => state.pitch,
    getRoll: () => state.roll,
    jumpTo: (options) => {
      Object.assign(state, { lng: options.center[0], lat: options.center[1], zoom: options.zoom, bearing: options.bearing, pitch: options.pitch, roll: options.roll });
      jumps.push({ zoom: options.zoom, pitch: options.pitch });
    },
    on: (_type, listener) => {
      moveListener = listener;
      return { unsubscribe: () => (moveListener = undefined) };
    },
  };
  /** Simulates a user gesture on this pane. */
  const drag = (to: Partial<typeof state>) => {
    Object.assign(state, to);
    moveListener?.();
  };
  return { map, jumps, drag };
}

describe("useCamera", () => {
  it("clamps on the write path, so no camera source can record a zoom a pane cannot hold", () => {
    const scope = effectScope();
    scope.run(() => {
      const { camera, moveCamera, registerPane } = useCamera();
      const { map, jumps } = fakeMap();
      registerPane(map);

      moveCamera({ center: [4.9, 52.4], zoom: 25, bearing: 0, pitch: 120, roll: 0 });

      // What was recorded and what the panes were told must be the same camera.
      expect(camera.value.zoom).toBe(ZOOM_LIMITS.max);
      expect(jumps.at(-1)?.zoom).toBe(ZOOM_LIMITS.max);
      expect(camera.value.pitch).toBe(85);
      expect(jumps.at(-1)?.pitch).toBe(85);
    });
    scope.stop();
  });

  it("records a gesture on any pane without being wired up by a component", () => {
    const scope = effectScope();
    scope.run(() => {
      const { camera, registerPane } = useCamera();
      const { map, drag } = fakeMap();
      registerPane(map);

      drag({ lng: 10, lat: 20, zoom: 7 });

      // The read path used to be a line in App.vue. It is now internal, so it cannot be forgotten.
      expect(camera.value).toMatchObject({ center: [10, 20], zoom: 7 });
    });
    scope.stop();
  });

  it("does NOT clamp the read path — it reports where the panes actually are", () => {
    const scope = effectScope();
    scope.run(() => {
      const { camera, registerPane } = useCamera();
      const { map, drag } = fakeMap();
      registerPane(map);

      // A pane cannot really reach z25, but if one ever reported it, silently rewriting the reading
      // would desync state from the canvas — the opposite of the write path's job.
      drag({ zoom: 25 });
      expect(camera.value.zoom).toBe(25);
    });
    scope.stop();
  });

  it("hands the camera out read-only", () => {
    const scope = effectScope();
    scope.run(() => {
      const { camera } = useCamera();
      // @ts-expect-error the whole point: there is no second writer any more
      camera.value = { center: [0, 0], zoom: 1, bearing: 0, pitch: 0, roll: 0 };
    });
    scope.stop();
  });

  it("seeds a pane that registers later from the group's camera", () => {
    const scope = effectScope();
    scope.run(() => {
      const { moveCamera, registerPane } = useCamera();
      moveCamera({ center: [1, 2], zoom: 11, bearing: 0, pitch: 0, roll: 0 });

      const { map, jumps } = fakeMap();
      registerPane(map);
      // Registering is what moves it, rather than the pane arriving with its own idea of the view.
      expect(jumps.at(-1)?.zoom).toBe(11);
    });
    scope.stop();
  });

  it("unregisters idempotently, so the explicit call before remove() is safe", () => {
    const scope = effectScope();
    scope.run(() => {
      const { registerPane } = useCamera();
      const { map } = fakeMap();
      const unregister = registerPane(map);
      expect(() => {
        unregister();
        unregister();
      }).not.toThrow();
    });
    scope.stop();
  });
});
