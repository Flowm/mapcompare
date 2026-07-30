/**
 * The shared camera, and comparisons that are stable enough to break sync feedback loops.
 *
 * Pure, and deliberately free of any maplibre import: `SyncableMap` in syncGroup.ts is
 * declared structurally so the sync core can be unit-tested against a fake with no WebGL.
 */

export interface CameraState {
  /** `[lng, lat]`, matching MapLibre's `center` option order. */
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  roll: number;
}

/** The slice of a map needed to read a camera. */
export interface CameraReadable {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getRoll(): number;
}

export function readCamera(map: CameraReadable): CameraState {
  const c = map.getCenter();
  return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), roll: map.getRoll() };
}

/**
 * Tolerances. Deliberately much tighter than anything a user can perceive: their job is to
 * absorb float round-tripping through MapLibre's transform, not to treat nearby cameras as
 * equal. A loose epsilon here would let panes drift visibly apart and never re-converge.
 */
const EPSILON = { degrees: 1e-9, zoom: 1e-6, angle: 1e-6 } as const;

/**
 * Compares two angles modulo 360.
 *
 * `getBearing()` returns a value in (-180, 180], so a bearing of 359.9999 read back as
 * -0.0001 must not register as a change. Without this, two panes ping-pong tiny corrections
 * across the wrap point forever.
 */
export function angleEquals(a: number, b: number, epsilon: number = EPSILON.angle): boolean {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff) < epsilon;
}

export function cameraEquals(a: CameraState, b: CameraState): boolean {
  return (
    Math.abs(a.center[0] - b.center[0]) < EPSILON.degrees &&
    Math.abs(a.center[1] - b.center[1]) < EPSILON.degrees &&
    Math.abs(a.zoom - b.zoom) < EPSILON.zoom &&
    angleEquals(a.bearing, b.bearing) &&
    Math.abs(a.pitch - b.pitch) < EPSILON.angle &&
    angleEquals(a.roll, b.roll)
  );
}

/** Normalises a bearing into (-180, 180], matching what `getBearing()` returns. */
export function normaliseBearing(bearing: number): number {
  const wrapped = ((bearing % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Clamps a camera into ranges MapLibre will accept, so a hand-edited URL cannot wedge it. */
export function clampCamera(camera: CameraState, minZoom: number, maxZoom: number): CameraState {
  const [lng, lat] = camera.center;
  return {
    // Web Mercator is undefined beyond ~±85.051129°.
    center: [wrapLongitude(lng), Math.min(85.051129, Math.max(-85.051129, lat))],
    zoom: Math.min(maxZoom, Math.max(minZoom, camera.zoom)),
    bearing: normaliseBearing(camera.bearing),
    pitch: Math.min(85, Math.max(0, camera.pitch)),
    roll: normaliseBearing(camera.roll),
  };
}

/** Wraps a longitude into [-180, 180). */
export function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
