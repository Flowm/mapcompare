import { describe, expect, it } from "vitest";

import { MODES } from "./mode";
import { paneCountFor } from "./mode";
import type { PaneLayer } from "./providers/types";
import { fractionFromPointer, MIN_INSET } from "./swipe";
import { type AppStateSnapshot, canonicalise, decodeState, encodeState } from "./urlState";

const IDS = new Set(["versatiles.satellite", "esri.imagery", "eox.s2cloudless", "esri.wayback"]);
const DEFAULTS: readonly PaneLayer[] = [{ providerId: "versatiles.satellite" }, { providerId: "esri.imagery" }, { providerId: "eox.s2cloudless" }, { providerId: "esri.wayback" }];

const FALLBACK: AppStateSnapshot = {
  mode: "g2",
  camera: { center: [4.893, 52.373], zoom: 16, bearing: 0, pitch: 0, roll: 0 },
  panes: [{ providerId: "versatiles.satellite" }, { providerId: "esri.imagery" }],
  swipe: 0.5,
  labels: false,
};

const encode = (s: AppStateSnapshot) => encodeState(s, DEFAULTS);
const decode = (search: string) => decodeState(search, IDS, DEFAULTS, FALLBACK);
const canon = (s: AppStateSnapshot) => canonicalise(s, DEFAULTS);
const allDefaults = (): PaneLayer[] => DEFAULTS.map((d) => ({ providerId: d.providerId, variant: d.variant }));

describe("encodeState", () => {
  it("emits parameters in a fixed order", () => {
    expect(encode(FALLBACK)).toBe("?m=g2&v=16.00/52.37300/4.89300&p=versatiles.satellite,esri.imagery");
  });

  it("omits zero bearing and pitch so the common case stays readable", () => {
    expect(encode(FALLBACK)).not.toContain("/0.0");
  });

  it("includes bearing once it is non-zero", () => {
    expect(encode({ ...FALLBACK, camera: { ...FALLBACK.camera, bearing: 45 } })).toContain("v=16.00/52.37300/4.89300/45.0");
  });

  it("includes pitch only alongside bearing, to keep the slash positions unambiguous", () => {
    const encoded = encode({ ...FALLBACK, camera: { ...FALLBACK.camera, pitch: 30 } });
    expect(encoded).toContain("v=16.00/52.37300/4.89300/0.0/30.0");
  });

  it("appends a variant with a colon", () => {
    expect(encode({ ...FALLBACK, panes: [{ providerId: "eox.s2cloudless", variant: "2019" }, { providerId: "esri.imagery" }] })).toContain("p=eox.s2cloudless:2019,esri.imagery");
  });

  it("omits the divider when centred, and includes it otherwise", () => {
    expect(encode({ ...FALLBACK, mode: "sw", swipe: 0.5 })).not.toContain("sw=");
    expect(encode({ ...FALLBACK, mode: "sw", swipe: 0.375 })).toContain("sw=0.375");
  });

  it("omits the divider outside swipe mode, where it means nothing", () => {
    expect(encode({ ...FALLBACK, mode: "g2", swipe: 0.375 })).not.toContain("sw=");
  });

  it("includes the label flag only when on", () => {
    expect(encode(FALLBACK)).not.toContain("l=1");
    expect(encode({ ...FALLBACK, labels: true })).toContain("l=1");
  });

  it("never emits an API key, since links are shared", () => {
    expect(encode({ ...FALLBACK, labels: true })).not.toMatch(/key|token|api/i);
  });
});

describe("round-trip properties", () => {
  // encodeState rounds, so decode(encode(x)) === x is false for arbitrary x. These are the
  // three properties that actually hold, and they are what "lossless" means here.
  const rawStates: AppStateSnapshot[] = [
    FALLBACK,
    { ...FALLBACK, mode: "g1", panes: [{ providerId: "esri.imagery" }] },
    { ...FALLBACK, mode: "g4", panes: allDefaults() },
    { ...FALLBACK, mode: "sw", swipe: 0.375 },
    { ...FALLBACK, mode: "bl" },
    { ...FALLBACK, labels: true },
    { ...FALLBACK, camera: { center: [-73.98, 40.75], zoom: 11.42, bearing: 45, pitch: 30, roll: 0 } },
    {
      ...FALLBACK,
      panes: [
        { providerId: "eox.s2cloudless", variant: "2017" },
        { providerId: "eox.s2cloudless", variant: "2025" },
      ],
    },
  ];
  const canonicalStates = rawStates.map(canon);

  it("decode(encode(c)) === c for every canonical state", () => {
    for (const state of canonicalStates) {
      expect(decode(encode(state)), JSON.stringify(state)).toStrictEqual(state);
    }
  });

  it("encode(canonicalise(decode(s))) === s for every canonical string", () => {
    for (const state of canonicalStates) {
      const encoded = encode(state);
      expect(encode(canon(decode(encoded))), encoded).toBe(encoded);
    }
  });

  it("canonicalise is idempotent", () => {
    for (const state of canonicalStates) {
      expect(canon(canon(state))).toStrictEqual(canon(state));
    }
  });

  it("holds for every mode", () => {
    for (const mode of MODES) {
      const state = canon({ ...FALLBACK, mode, panes: allDefaults() });
      expect(decode(encode(state)), mode).toStrictEqual(state);
    }
  });
});

describe("canonicalise", () => {
  it("reconciles pane count up to match the mode", () => {
    const result = canon({ ...FALLBACK, mode: "g4", panes: [{ providerId: "esri.imagery" }] });
    expect(result.panes).toHaveLength(4);
    expect(result.panes[0]).toStrictEqual({ providerId: "esri.imagery" });
  });

  it("reconciles pane count down to match the mode", () => {
    const result = canon({ ...FALLBACK, mode: "g1", panes: allDefaults() });
    expect(result.panes).toHaveLength(1);
  });

  it("gives the stacked modes exactly two panes", () => {
    for (const mode of ["sw", "bl"] as const) {
      expect(canon({ ...FALLBACK, mode, panes: allDefaults() }).panes).toHaveLength(2);
    }
  });

  it("keeps panes.length in step with paneCountFor for every mode", () => {
    for (const mode of MODES) {
      expect(canon({ ...FALLBACK, mode, panes: [] }).panes, mode).toHaveLength(paneCountFor(mode));
    }
  });

  it("rounds to wire precision", () => {
    const result = canon({ ...FALLBACK, camera: { center: [4.8931234567, 52.3731234567], zoom: 16.123456, bearing: 45.67, pitch: 30.44, roll: 0 } });
    expect(result.camera.center).toStrictEqual([4.89312, 52.37312]);
    expect(result.camera.zoom).toBe(16.12);
    expect(result.camera.bearing).toBe(45.7);
    expect(result.camera.pitch).toBe(30.4);
  });

  it("clamps an out-of-range camera", () => {
    const result = canon({ ...FALLBACK, camera: { center: [0, 95], zoom: 99, bearing: 0, pitch: 120, roll: 0 } });
    expect(result.camera.zoom).toBe(22);
    expect(result.camera.center[1]).toBeCloseTo(85.05113, 4);
    expect(result.camera.pitch).toBe(85);
  });

  it("drops roll, which the app's own controls cannot produce", () => {
    expect(canon({ ...FALLBACK, camera: { ...FALLBACK.camera, roll: 30 } }).camera.roll).toBe(0);
  });

  it("clamps the divider to the range swipe.ts owns, not to 0..1", () => {
    // A shared link must not be able to reach a position the divider cannot be dragged back from.
    expect(canon({ ...FALLBACK, swipe: 5 }).swipe).toBe(1 - MIN_INSET);
    expect(canon({ ...FALLBACK, swipe: -5 }).swipe).toBe(MIN_INSET);
    expect(canon({ ...FALLBACK, swipe: 0 }).swipe).toBe(MIN_INSET);
    expect(canon({ ...FALLBACK, swipe: 1 }).swipe).toBe(1 - MIN_INSET);
  });

  it("agrees with the pointer path, so both routes into `swipe` land in the same range", () => {
    const rect = { left: 0, width: 1000 };
    for (const [pointerX, url] of [
      [0, 0],
      [1000, 1],
      [-50, -5],
      [1500, 5],
    ] as const) {
      expect(canon({ ...FALLBACK, swipe: url }).swipe).toBe(fractionFromPointer(pointerX, rect));
    }
  });

  it("normalises an absent variant rather than storing undefined", () => {
    const result = canon({ ...FALLBACK, panes: [{ providerId: "esri.imagery", variant: undefined }, { providerId: "esri.imagery" }] });
    expect(Object.hasOwn(result.panes[0]!, "variant")).toBe(false);
  });
});

describe("decodeState", () => {
  it("falls back entirely for an empty query", () => {
    expect(decode("")).toStrictEqual(canon(FALLBACK));
  });

  it("accepts a query string with or without the leading question mark", () => {
    expect(decode("?m=g1&p=esri.imagery")).toStrictEqual(decode("m=g1&p=esri.imagery"));
  });

  it("drops an unknown provider id and backfills from defaults", () => {
    // A future build may stop shipping a provider; an old link should still render.
    const result = decode("?m=g2&v=16.00/52.37300/4.89300&p=gone.away,esri.imagery");
    expect(result.panes).toHaveLength(2);
    expect(result.panes.map((p) => p.providerId)).not.toContain("gone.away");
  });

  it("falls back to defaults when every provider id is unknown", () => {
    const result = decode("?p=nope.one,nope.two");
    expect(result.panes.map((p) => p.providerId)).toStrictEqual(["versatiles.satellite", "esri.imagery"]);
  });

  it("keeps a variant it does not understand, for the provider to resolve", () => {
    // Only the provider knows its vintages, and resolveVariant clamps at render time.
    expect(decode("?p=eox.s2cloudless:1999,esri.imagery").panes[0]).toStrictEqual({ providerId: "eox.s2cloudless", variant: "1999" });
  });

  it("rejects an unknown mode", () => {
    expect(decode("?m=g9").mode).toBe("g2");
    expect(decode("?m=swipe").mode).toBe("g2");
  });

  it.each(["?v=16.00", "?v=", "?v=abc/def/ghi", "?v=16.00/52.373"])("ignores malformed viewport %o", (query) => {
    expect(decode(query).camera).toStrictEqual(canon(FALLBACK).camera);
  });

  it("reads bearing and pitch when present", () => {
    const camera = decode("?v=11.42/40.75/-73.98/45.0/30.0").camera;
    expect(camera.bearing).toBe(45);
    expect(camera.pitch).toBe(30);
  });

  it("defaults bearing and pitch to zero when omitted", () => {
    const camera = decode("?v=11.42/40.75/-73.98").camera;
    expect(camera.bearing).toBe(0);
    expect(camera.pitch).toBe(0);
  });

  it("reads lat/lon in that order, not lon/lat", () => {
    // The v parameter is zoom/lat/lon to echo the OSM idiom, while CameraState is [lng, lat].
    const camera = decode("?v=11.42/40.75/-73.98").camera;
    expect(camera.center).toStrictEqual([-73.98, 40.75]);
  });

  it("treats a missing label flag as off and any non-1 value as off", () => {
    expect(decode("?m=g2").labels).toBe(false);
    expect(decode("?m=g2&l=0").labels).toBe(false);
    expect(decode("?m=g2&l=true").labels).toBe(false);
    expect(decode("?m=g2&l=1").labels).toBe(true);
  });

  it("ignores unrelated parameters", () => {
    expect(decode("?m=g1&utm_source=x&p=esri.imagery").mode).toBe("g1");
  });

  it("tolerates empty pane tokens", () => {
    expect(decode("?p=esri.imagery,,versatiles.satellite").panes.map((p) => p.providerId)).toStrictEqual(["esri.imagery", "versatiles.satellite"]);
  });

  it("decodes a full shared link", () => {
    const result = decode("?m=sw&v=11.42/45.00000/59.50000&p=eox.s2cloudless:2017,eox.s2cloudless:2025&sw=0.375&l=1");
    expect(result.mode).toBe("sw");
    expect(result.camera.zoom).toBe(11.42);
    expect(result.camera.center).toStrictEqual([59.5, 45]);
    expect(result.panes).toStrictEqual([
      { providerId: "eox.s2cloudless", variant: "2017" },
      { providerId: "eox.s2cloudless", variant: "2025" },
    ]);
    expect(result.swipe).toBe(0.375);
    expect(result.labels).toBe(true);
  });
});
