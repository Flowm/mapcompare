import { describe, expect, it } from "vitest";

import { getProvider } from "./providers/registry";
import { formatZoomFit, shortZoomFit, zoomFit, zoomSeverity } from "./zoomFit";

const eox = { minzoom: 0, maxzoom: 14 };
const gibs = { minzoom: 0, maxzoom: 9 };

describe("zoomFit", () => {
  it("is native inside the range", () => {
    expect(zoomFit(eox, 10)).toStrictEqual({ kind: "native" });
    expect(zoomFit(eox, 14)).toStrictEqual({ kind: "native" });
  });

  it("stays native for fractional zoom at the ceiling", () => {
    // A map at z14.6 is still drawn from z14 tiles, so an "upscaled" badge here would flicker
    // on during an ordinary pinch and mean nothing.
    expect(zoomFit(eox, 14.9)).toStrictEqual({ kind: "native" });
  });

  it("reports the upscale factor past the ceiling", () => {
    expect(zoomFit(eox, 15)).toStrictEqual({ kind: "upscaled", nativeMax: 14, factor: 2 });
    expect(zoomFit(eox, 16)).toStrictEqual({ kind: "upscaled", nativeMax: 14, factor: 4 });
    expect(zoomFit(eox, 18)).toStrictEqual({ kind: "upscaled", nativeMax: 14, factor: 16 });
  });

  it("reports a large factor for the low-resolution daily layers", () => {
    // Munich at z16 against GIBS' z9 ceiling: the pane is genuinely mush.
    expect(zoomFit(gibs, 16)).toStrictEqual({ kind: "upscaled", nativeMax: 9, factor: 128 });
  });

  it("reports being below the floor", () => {
    expect(zoomFit({ minzoom: 5, maxzoom: 14 }, 3)).toStrictEqual({ kind: "belowMin", nativeMin: 5 });
  });
});

describe("formatZoomFit", () => {
  it("names the native ceiling and the factor", () => {
    expect(formatZoomFit(zoomFit(eox, 16))).toBe("z14 native · 4× upscaled");
  });

  it("is terse when native", () => {
    expect(formatZoomFit(zoomFit(eox, 12))).toBe("native");
  });

  it("explains a below-minimum pane", () => {
    expect(formatZoomFit(zoomFit({ minzoom: 5, maxzoom: 14 }, 2))).toBe("no data below z5");
  });
});

describe("shortZoomFit", () => {
  it("drops the native ceiling for the compact chip", () => {
    expect(shortZoomFit(zoomFit(eox, 16))).toBe("4× upscaled");
    expect(shortZoomFit(zoomFit(eox, 10))).toBe("native");
  });
});

describe("zoomSeverity", () => {
  it("is quiet at native and at a barely visible 2x", () => {
    expect(zoomSeverity(zoomFit(eox, 10))).toBe("ok");
    expect(zoomSeverity(zoomFit(eox, 15))).toBe("ok");
  });

  it("warns from 4x", () => {
    expect(zoomSeverity(zoomFit(eox, 16))).toBe("warn");
  });

  it("escalates past 8x, where the pane is mush", () => {
    expect(zoomSeverity(zoomFit(eox, 17))).toBe("bad");
    expect(zoomSeverity(zoomFit(gibs, 16))).toBe("bad");
  });

  it("warns below the floor", () => {
    expect(zoomSeverity(zoomFit({ minzoom: 5, maxzoom: 14 }, 2))).toBe("warn");
  });
});

describe("against the real registry", () => {
  it("flags Sentinel-2 cloudless as overzoomed at the default view", () => {
    // The app opens at z16, so this badge is visible the moment anyone picks that layer.
    const fit = zoomFit(getProvider("eox.s2cloudless")!, 16);
    expect(fit).toMatchObject({ kind: "upscaled", nativeMax: 14, factor: 4 });
  });

  it("keeps Esri native at the default view", () => {
    expect(zoomFit(getProvider("esri.imagery")!, 16)).toStrictEqual({ kind: "native" });
  });

  it("keeps VersaTiles native at the default view", () => {
    // Amsterdam z16 sits inside VersaTiles' measured European ceiling of 17.
    expect(zoomFit(getProvider("versatiles.satellite")!, 16)).toStrictEqual({ kind: "native" });
  });
});
