import { describe, expect, it } from "vitest";
import { effectScope } from "vue";

import { ZOOM_LIMITS } from "@/lib/camera";
import type { SyncableMap } from "@/lib/syncGroup";

import { useAppState } from "./useAppState";
import { useMapSync } from "./useMapSync";

/**
 * `moveCamera` is the app's only camera write path, so it is the one gate an out-of-range camera
 * has to pass. `syncGroup` itself is covered against a fake map in syncGroup.test.ts; what is
 * asserted here is the pairing this composable adds — clamp, record, then push.
 */

function fakeMap() {
  const applied: { zoom: number; pitch: number }[] = [];
  const map: SyncableMap = {
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 0,
    getBearing: () => 0,
    getPitch: () => 0,
    getRoll: () => 0,
    jumpTo: (options) => applied.push({ zoom: options.zoom, pitch: options.pitch }),
    on: () => ({ unsubscribe: () => {} }),
  };
  return { map, applied };
}

describe("moveCamera", () => {
  it("clamps a camera no pane could reach, and records the clamped value", () => {
    const scope = effectScope();
    scope.run(() => {
      const { registerPane, applyCamera } = useMapSync();
      const { camera } = useAppState();
      const { map, applied } = fakeMap();
      registerPane(map);

      applyCamera({ center: [4.9, 52.4], zoom: 25, bearing: 0, pitch: 120, roll: 0 });

      // Recorded state and what the panes were told must be the same camera. Before the clamp
      // moved here, state kept z25 while MapLibre silently held the pane at its own ceiling.
      expect(camera.value.zoom).toBe(ZOOM_LIMITS.max);
      expect(applied.at(-1)?.zoom).toBe(ZOOM_LIMITS.max);
      expect(camera.value.pitch).toBe(85);
      expect(applied.at(-1)?.pitch).toBe(85);
    });
    scope.stop();
  });

  it("leaves a legal camera untouched", () => {
    const scope = effectScope();
    scope.run(() => {
      const { registerPane, applyCamera } = useMapSync();
      const { camera } = useAppState();
      const { map } = fakeMap();
      registerPane(map);

      applyCamera({ center: [4.9, 52.4], zoom: 16, bearing: 0, pitch: 0, roll: 0 });
      expect(camera.value).toMatchObject({ zoom: 16, pitch: 0 });
    });
    scope.stop();
  });
});
