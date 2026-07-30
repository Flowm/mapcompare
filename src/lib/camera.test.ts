import { describe, expect, it } from "vitest";

import { angleEquals, type CameraState, cameraEquals, clampCamera, normaliseBearing, readCamera, wrapLongitude } from "./camera";

const BASE: CameraState = { center: [4.893, 52.373], zoom: 16, bearing: 0, pitch: 0, roll: 0 };

describe("readCamera", () => {
  it("reads every axis and flips lng/lat into array order", () => {
    const camera = readCamera({
      getCenter: () => ({ lng: 4.893, lat: 52.373 }),
      getZoom: () => 16.25,
      getBearing: () => 45,
      getPitch: () => 30,
      getRoll: () => 15,
    });
    expect(camera).toStrictEqual({ center: [4.893, 52.373], zoom: 16.25, bearing: 45, pitch: 30, roll: 15 });
  });
});

describe("angleEquals", () => {
  it("treats identical angles as equal", () => {
    expect(angleEquals(45, 45)).toBe(true);
  });

  it("closes the 360/0 seam", () => {
    // getBearing() returns (-180, 180], so 359.9999999999 comes back as a negative
    // near-zero. Treating that as a change makes two panes correct each other forever.
    expect(angleEquals(359.9999999999, -0.0000000001)).toBe(true);
    expect(angleEquals(0, 360)).toBe(true);
    expect(angleEquals(-180, 180)).toBe(true);
  });

  it("still detects a real rotation", () => {
    expect(angleEquals(0, 1)).toBe(false);
    expect(angleEquals(90, -90)).toBe(false);
    expect(angleEquals(0, 180)).toBe(false);
  });

  it("handles negative angles on both sides", () => {
    expect(angleEquals(-45, -45)).toBe(true);
    expect(angleEquals(-45, 315)).toBe(true);
  });

  it("honours an explicit epsilon", () => {
    expect(angleEquals(0, 0.5, 1)).toBe(true);
    expect(angleEquals(0, 0.5, 0.1)).toBe(false);
  });
});

describe("cameraEquals", () => {
  it("matches a camera against itself", () => {
    expect(cameraEquals(BASE, { ...BASE })).toBe(true);
  });

  it("absorbs float round-tripping", () => {
    expect(cameraEquals(BASE, { ...BASE, zoom: 16 + 1e-12 })).toBe(true);
    expect(cameraEquals(BASE, { ...BASE, center: [4.893 + 1e-12, 52.373] })).toBe(true);
  });

  it.each([
    ["longitude", { center: [4.9, 52.373] as [number, number] }],
    ["latitude", { center: [4.893, 52.4] as [number, number] }],
    ["zoom", { zoom: 16.5 }],
    ["bearing", { bearing: 45 }],
    ["pitch", { pitch: 30 }],
    ["roll", { roll: 15 }],
  ])("detects a change in %s", (_axis, patch) => {
    expect(cameraEquals(BASE, { ...BASE, ...patch })).toBe(false);
  });

  it("is tight enough that a one-metre pan still registers", () => {
    // ~1e-5 degrees is about a metre; the epsilon must be well below that or panes drift.
    expect(cameraEquals(BASE, { ...BASE, center: [4.89301, 52.373] })).toBe(false);
  });
});

describe("normaliseBearing", () => {
  it("leaves an in-range bearing alone", () => {
    expect(normaliseBearing(45)).toBe(45);
    expect(normaliseBearing(180)).toBe(180);
    expect(normaliseBearing(-179)).toBe(-179);
  });

  it("wraps into (-180, 180]", () => {
    expect(normaliseBearing(360)).toBe(0);
    expect(normaliseBearing(270)).toBe(-90);
    expect(normaliseBearing(-270)).toBe(90);
    expect(normaliseBearing(540)).toBe(180);
  });
});

describe("wrapLongitude", () => {
  it("leaves an in-range longitude alone", () => {
    expect(wrapLongitude(4.893)).toBeCloseTo(4.893, 10);
    expect(wrapLongitude(-179)).toBeCloseTo(-179, 10);
  });

  it("wraps past the antimeridian", () => {
    expect(wrapLongitude(181)).toBeCloseTo(-179, 10);
    expect(wrapLongitude(-181)).toBeCloseTo(179, 10);
  });

  it("wraps multiple turns, landing on the low end of the half-open range", () => {
    // The range is [-180, 180), so 540 degrees reduces to 180 and then reports as -180.
    // Both describe the same meridian and maplibre accepts either.
    expect(wrapLongitude(540)).toBeCloseTo(-180, 10);
    expect(wrapLongitude(180)).toBeCloseTo(-180, 10);
    expect(wrapLongitude(720)).toBeCloseTo(0, 10);
  });
});

describe("clampCamera", () => {
  it("passes a valid camera through", () => {
    const clamped = clampCamera(BASE, 0, 22);
    expect(clamped.zoom).toBe(16);
    expect(clamped.center[1]).toBe(52.373);
  });

  it("clamps zoom into the allowed range", () => {
    expect(clampCamera({ ...BASE, zoom: 99 }, 0, 22).zoom).toBe(22);
    expect(clampCamera({ ...BASE, zoom: -5 }, 0, 22).zoom).toBe(0);
  });

  it("clamps latitude to the Web Mercator limit", () => {
    // Beyond ~85.051129 the projection is undefined and maplibre would reject the camera.
    expect(clampCamera({ ...BASE, center: [0, 90] }, 0, 22).center[1]).toBeCloseTo(85.051129, 6);
    expect(clampCamera({ ...BASE, center: [0, -90] }, 0, 22).center[1]).toBeCloseTo(-85.051129, 6);
  });

  it("wraps longitude rather than clamping it", () => {
    expect(clampCamera({ ...BASE, center: [200, 0] }, 0, 22).center[0]).toBeCloseTo(-160, 6);
  });

  it("clamps pitch to what maplibre accepts", () => {
    expect(clampCamera({ ...BASE, pitch: 120 }, 0, 22).pitch).toBe(85);
    expect(clampCamera({ ...BASE, pitch: -10 }, 0, 22).pitch).toBe(0);
  });

  it("normalises bearing and roll", () => {
    const clamped = clampCamera({ ...BASE, bearing: 450, roll: -270 }, 0, 22);
    expect(clamped.bearing).toBe(90);
    expect(clamped.roll).toBe(90);
  });
});
