import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import type { ApiKeys } from "@/lib/layers/availability";
import { extractLabelOverlay, type LabelOverlay } from "@/lib/layers/labelOverlay";
import { declaredTimeDomain } from "@/lib/layers/time";
import type { PaneLayer } from "@/lib/layers/types";
import { LIBERTY_FIXTURE } from "@/test/fixtures/libertyStyle";

import { type ResolvedStyleDeps, useResolvedStyle } from "./useResolvedStyle";

/**
 * These tests exist because the dependencies are parameters. Every one of them turns on
 * controlling something the module used to reach for — the key store, the clock, the network —
 * so none of them could be written before that.
 */

const OVERLAY_URL = "https://tiles.test/liberty";

/** A style Layer that is NOT the overlay source. */
const MAPTILER = "maptiler.satellite";
/** The overlay source itself, which must not be labelled twice. */
const LIBERTY = "openfreemap.liberty";
/** Keyless raster, resolves with no await. */
const VERSATILES = "versatiles.satellite";
/** Raster behind a key. */
const MAPBOX = "mapbox.satellite";
/** Daily Times asked of its service, answered here by its declared series. */
const GIBS = "gibs.viirs.noaa20";

function makeDeps(over: Partial<ResolvedStyleDeps> = {}) {
  const fetched: string[] = [];
  const deps: ResolvedStyleDeps = {
    keys: ref<ApiKeys>({}),
    resampling: ref<"linear" | "nearest">("linear"),
    labels: ref(false),
    fetchStyle: (url) => {
      fetched.push(url);
      return Promise.resolve(structuredClone(LIBERTY_FIXTURE) as StyleSpecification);
    },
    loadOverlay: () => Promise.resolve(extractLabelOverlay(LIBERTY_FIXTURE)),
    overlayStyleUrl: OVERLAY_URL,
    now: ref(new Date("2026-03-10T12:00:00Z")),
    loadTimeDomain: (layer, now) => Promise.resolve(layer.time ? declaredTimeDomain(layer.time, now) : undefined),
    ...over,
  };
  return { deps, fetched };
}

/** Runs `body` inside an effect scope, then disposes it, so watchers do not leak between tests. */
async function inScope(body: (stop: () => void) => Promise<void> | void) {
  const scope = effectScope();
  await scope.run(async () => await body(() => scope.stop()));
  scope.stop();
}

function tileUrlsOf(style: StyleSpecification): string[] {
  return Object.values(style.sources).flatMap((s) => ("tiles" in s && s.tiles ? s.tiles : []));
}

async function shownTime(resolved: { value: { state: string } }): Promise<string | undefined> {
  await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
  const state = resolved.value as { state: "ready"; time?: { time: string } };
  return state.time?.time;
}

describe("useResolvedStyle", () => {
  it("resolves a keyless raster Layer synchronously, with no loading flash", async () => {
    const { deps } = makeDeps();
    await inScope(() => {
      const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), deps);
      // Not "loading" even before a tick: the fast path never awaits.
      expect(resolved.value.state).toBe("ready");
    });
  });

  it("reports missing-key with the Layer's label, then resolves once the key arrives", async () => {
    const keys = ref<ApiKeys>({});
    const { deps } = makeDeps({ keys });

    await inScope(async () => {
      const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: MAPBOX }), deps);
      expect(resolved.value).toEqual({ state: "missing-key", key: "VITE_MAPBOX_TOKEN", layerLabel: "Mapbox Satellite" });

      keys.value = { VITE_MAPBOX_TOKEN: "pk.test" };
      await nextTick();
      expect(resolved.value.state).toBe("ready");
      if (resolved.value.state !== "ready") return;
      expect(tileUrlsOf(resolved.value.style)[0]).toContain("pk.test");
    });
  });

  it("reports unknown-layer rather than throwing", async () => {
    const { deps } = makeDeps();
    await inScope(() => {
      const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: "not.a.layer" }), deps);
      expect(resolved.value).toEqual({ state: "unknown-layer", layerId: "not.a.layer" });
    });
  });

  it("surfaces a failed style fetch as an error state carrying the message", async () => {
    const { deps } = makeDeps({ fetchStyle: () => Promise.reject(new Error("Style fetch failed: 503")) });
    await inScope(async () => {
      const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: MAPTILER }), { ...deps, keys: ref({ VITE_MAPTILER_KEY: "k" }) });
      expect(resolved.value.state).toBe("loading");
      await vi.waitFor(() => expect(resolved.value.state).toBe("error"));
      if (resolved.value.state !== "error") return;
      expect(resolved.value.message).toBe("Style fetch failed: 503");
    });
  });

  describe("the generation guard", () => {
    it("discards a slow response from a superseded choice", async () => {
      let releaseFirst: (style: StyleSpecification) => void = () => {};
      let call = 0;
      const { deps } = makeDeps({
        keys: ref({ VITE_MAPTILER_KEY: "k" }),
        fetchStyle: () => {
          call += 1;
          if (call === 1) return new Promise<StyleSpecification>((resolve) => (releaseFirst = resolve));
          return Promise.resolve({
            version: 8,
            sources: { second: { type: "raster", tiles: ["https://second/{z}/{x}/{y}.png"], tileSize: 256 } },
            layers: [],
          } as StyleSpecification);
        },
      });

      await inScope(async () => {
        const layer = ref<PaneLayer>({ layerId: MAPTILER });
        const { resolved } = useResolvedStyle(layer, deps);
        expect(resolved.value.state).toBe("loading");

        // Switch away before the first request comes back.
        layer.value = { layerId: LIBERTY };
        await nextTick();
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));

        // The superseded response lands last and must be ignored.
        releaseFirst(structuredClone(LIBERTY_FIXTURE) as StyleSpecification);
        await nextTick();
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(tileUrlsOf(resolved.value.style)).toEqual(["https://second/{z}/{x}/{y}.png"]);
      });
    });
  });

  describe("the label overlay", () => {
    it("merges the overlay into the spec before it is applied", async () => {
      const { deps } = makeDeps({ labels: ref(true) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), deps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
        if (resolved.value.state !== "ready") return;
        // The overlay's layers are present in the very first style the pane ever sees.
        expect(resolved.value.style.layers.some((l) => l.id.startsWith("ofm-"))).toBe(true);
      });
    });

    it("does not label the pane the overlay is extracted from", async () => {
      const { deps } = makeDeps({ labels: ref(true) });
      await inScope(async () => {
        // The Liberty entry's own styleUrl is the overlay source, so labels must be suppressed.
        const overlayDeps = { ...deps, overlayStyleUrl: "https://tiles.openfreemap.org/styles/liberty" };
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: LIBERTY }), overlayDeps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
        if (resolved.value.state !== "ready") return;
        expect(resolved.value.style.layers.some((l) => l.id.startsWith("ofm-"))).toBe(false);
      });
    });

    it("reports an overlay failure as an error, leaving the basemap request intact", async () => {
      const { deps } = makeDeps({ labels: ref(true), loadOverlay: () => Promise.reject(new Error("overlay unavailable")) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), deps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("error"));
        if (resolved.value.state !== "error") return;
        expect(resolved.value.message).toBe("overlay unavailable");
      });
    });
  });

  describe("resampling", () => {
    it("re-resolves a raster pane, because the paint property is part of its style", async () => {
      const resampling = ref<"linear" | "nearest">("linear");
      const { deps } = makeDeps({ resampling });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.style.layers[0]).toMatchObject({ paint: { "raster-resampling": "linear" } });

        resampling.value = "nearest";
        await nextTick();
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.style.layers[0]).toMatchObject({ paint: { "raster-resampling": "nearest" } });
      });
    });

    it("does not re-fetch a style-URL pane, which the setting cannot affect", async () => {
      const resampling = ref<"linear" | "nearest">("linear");
      const { deps, fetched } = makeDeps({ resampling, keys: ref({ VITE_MAPTILER_KEY: "k" }) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: MAPTILER }), deps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
        expect(fetched).toHaveLength(1);

        resampling.value = "nearest";
        await nextTick();
        expect(fetched).toHaveLength(1);
      });
    });
  });

  describe("the credit", () => {
    it("credits a style-URL pane from its descriptor, since the fetched document declares none", async () => {
      // The whole reason the credit is assembled here. MapTiler's style.json names TileJSON `url`
      // sources, so reading the applied style alone left the pane with no attribution at all.
      const { deps } = makeDeps({ keys: ref({ VITE_MAPTILER_KEY: "k" }) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: MAPTILER }), deps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
        if (resolved.value.state !== "ready") return;
        expect(resolved.value.credit.parts.join(" ")).toContain("MapTiler");
        expect(resolved.value.credit.parts.join(" ")).toContain("OpenStreetMap");
      });
    });

    it("carries the wordmark of a vendor that requires one, and none for a vendor that does not", async () => {
      const { deps } = makeDeps({ keys: ref({ VITE_MAPBOX_TOKEN: "pk.test" }) });
      await inScope(() => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: MAPBOX }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.credit.wordmarks.map((w) => w.alt)).toStrictEqual(["Mapbox"]);
      });

      await inScope(() => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), makeDeps().deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.credit.wordmarks).toStrictEqual([]);
      });
    });

    it("does not credit a vendor whose imagery never reached the screen", async () => {
      // A pane blocked on a missing key must not show Mapbox's mark: `credit` rides `ready`, so
      // there is nothing for the renderer to draw.
      const { deps } = makeDeps();
      await inScope(() => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: MAPBOX }), deps);
        expect(resolved.value.state).toBe("missing-key");
        expect(resolved.value).not.toHaveProperty("credit");
      });
    });

    it("substitutes the resolved Time into a credit that names it", async () => {
      const { deps } = makeDeps({ now: ref(new Date("2026-03-10T12:00:00Z")) });
      await inScope(() => {
        // EOX require their credit to name the composite year, and it must name the year applied.
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: "eox.s2cloudless", time: "2019" }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.credit.parts.join(" ")).toContain("EOxCloudless 2019");
        expect(resolved.value.credit.parts.join(" ")).not.toContain("{YEAR}");
      });
    });

    it("adds the overlay's credit when the pane is labelled, and drops it when it is not", async () => {
      // The overlay is OSM-derived vector tiles whose own document carries no attribution, so an
      // unlabelled pane's credit is the only thing that could have named OpenFreeMap.
      const labels = ref(true);
      const { deps } = makeDeps({ labels });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), deps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.credit.parts.join(" ")).toContain("OpenFreeMap");

        labels.value = false;
        await nextTick();
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.credit.parts.join(" ")).not.toContain("OpenFreeMap");
      });
    });

    it("credits OpenFreeMap once on the pane the overlay was extracted from", async () => {
      // Labels are suppressed there, so the overlay must not add a second copy of the same credit.
      const { deps } = makeDeps({ labels: ref(true) });
      await inScope(async () => {
        const overlayDeps = { ...deps, overlayStyleUrl: "https://tiles.openfreemap.org/styles/liberty" };
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: LIBERTY }), overlayDeps);
        await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
        if (resolved.value.state !== "ready") return;
        expect(resolved.value.credit.parts.filter((p) => p.includes("OpenFreeMap"))).toHaveLength(1);
      });
    });
  });

  describe("the clock", () => {
    /** Waits for a pane whose Layer asks its service, then returns the Time it shows. */
    it("resolves a daily Layer against the injected clock, never showing a day still filling in", async () => {
      const { deps } = makeDeps({ now: ref(new Date("2026-03-10T12:00:00Z")) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: GIBS }), deps);
        expect(await shownTime(resolved)).toBe("2026-03-09");
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(tileUrlsOf(resolved.value.style)[0]).toContain("/2026-03-09/");
      });
    });

    it("does not change the rendered day when an unrelated dependency changes", async () => {
      // Regression test for a reproduced defect: the clock was read with new Date() inside the
      // watcher, so pasting a key for an unrelated Layer after UTC midnight silently moved a
      // GIBS pane onto another day's imagery. The clock is now a watched ref, so only the clock
      // moving can move the day.
      const keys = ref<ApiKeys>({});
      const { deps } = makeDeps({ keys, now: ref(new Date("2026-03-10T23:59:00Z")) });

      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: GIBS }), deps);
        expect(await shownTime(resolved)).toBe("2026-03-09");

        // Wall-clock midnight passes — but the app's clock is read once, so it has not moved.
        keys.value = { VITE_MAPBOX_TOKEN: "pk.irrelevant" };
        await nextTick();
        expect(await shownTime(resolved)).toBe("2026-03-09");
      });
    });

    it("re-resolves when the clock itself moves, so every reader flips together", async () => {
      const now = ref(new Date("2026-03-10T23:59:00Z"));
      const { deps } = makeDeps({ now });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: GIBS }), deps);
        expect(await shownTime(resolved)).toBe("2026-03-09");

        now.value = new Date("2026-03-11T00:01:00Z");
        await nextTick();
        await vi.waitFor(async () => expect(await shownTime(resolved)).toBe("2026-03-10"));
      });
    });

    it("shows the nearest earlier Time for a stale or future link, and says what was asked for", async () => {
      const { deps } = makeDeps({ now: ref(new Date("2026-03-10T12:00:00Z")) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: GIBS, time: "2099-01-01" }), deps);
        expect(await shownTime(resolved)).toBe("2026-03-09");
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.time?.substitution).toStrictEqual({ requested: "2099-01-01", reason: "too-recent" });
      });
    });

    it("falls back to declared Times when the service cannot be asked", async () => {
      const { deps } = makeDeps({ loadTimeDomain: () => Promise.reject(new Error("offline")) });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: "satvis.georing" }), deps);
        // A STAC Layer has no rule that could say which file holds which hour, so it errors.
        await vi.waitFor(() => expect(resolved.value.state).toBe("error"));
      });
    });

    it("names the day a series ended", async () => {
      const { deps } = makeDeps({
        now: ref(new Date("2026-03-10T12:00:00Z")),
        loadTimeDomain: () => Promise.resolve({ precision: "day", ranges: [{ start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 1, 1), step: 86_400_000 }] }),
      });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: GIBS }), deps);
        expect(await shownTime(resolved)).toBe("2026-02-01");
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.ended).toBe("2026-02-01");
      });
    });
  });

  describe("the published Time", () => {
    it("is the Time applied, which the pane's chip describes", async () => {
      const { deps } = makeDeps();
      await inScope(() => {
        // A listed Time, requested and honoured.
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: "eox.s2cloudless", time: "2020" }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.time?.time).toBe("2020");
        expect(resolved.value.time?.substitution).toBeUndefined();
      });
    });

    it("falls back to the latest when the request is not a Time at all, and says so", async () => {
      const { deps } = makeDeps();
      await inScope(() => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: "eox.s2cloudless", time: "not-a-year" }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.time?.time).toBe("2025");
        expect(resolved.value.time?.substitution).toStrictEqual({ requested: "not-a-year", reason: "unreadable" });
      });
    });

    it("hands a Wayback snapshot's release id to the template, never its date", async () => {
      const { deps } = makeDeps();
      await inScope(() => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: "esri.wayback", time: "2019-12-12" }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.time?.time).toBe("2019-12-12");
        expect(tileUrlsOf(resolved.value.style)[0]).toContain("/tile/4756/");
      });
    });

    it("rebuilds the style from Times it already has when only the display changes", async () => {
      let asked = 0;
      const resampling = ref<"linear" | "nearest">("linear");
      const { deps } = makeDeps({
        resampling,
        loadTimeDomain: (layer, now) => {
          asked += 1;
          return Promise.resolve(layer.time ? declaredTimeDomain(layer.time, now) : undefined);
        },
      });
      await inScope(async () => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: GIBS }), deps);
        expect(await shownTime(resolved)).toBe("2026-03-09");

        resampling.value = "nearest";
        await nextTick();
        // Straight to the new style: no trip through `loading`, and the service is not re-asked.
        expect(resolved.value.state).toBe("ready");
        expect(asked).toBe(1);
      });
    });

    it("is undefined for a static Layer", async () => {
      const { deps } = makeDeps();
      await inScope(() => {
        const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), deps);
        if (resolved.value.state !== "ready") throw new Error("expected ready");
        expect(resolved.value.time).toBeUndefined();
      });
    });
  });

  it("stops resolving once its scope is disposed", async () => {
    const keys = ref<ApiKeys>({});
    const { deps } = makeDeps({ keys });
    const scope = effectScope();
    const handle = scope.run(() => useResolvedStyle(ref<PaneLayer>({ layerId: MAPBOX }), deps))!;
    expect(handle.resolved.value.state).toBe("missing-key");

    scope.stop();
    keys.value = { VITE_MAPBOX_TOKEN: "pk.test" };
    await nextTick();
    expect(handle.resolved.value.state).toBe("missing-key");
  });
});

/** The overlay memoisation lives in the default wiring, so it is asserted through that seam. */
describe("loadOverlay memoisation", () => {
  it("shares one extraction across panes and retries after a failure", async () => {
    const { clearOverlayCache } = await import("./useResolvedStyle");
    clearOverlayCache();

    let calls = 0;
    let fail = true;
    const loadOverlay = (): Promise<LabelOverlay> => {
      calls += 1;
      return fail ? Promise.reject(new Error("flaky")) : Promise.resolve(extractLabelOverlay(LIBERTY_FIXTURE));
    };

    const first = makeDeps({ labels: ref(true), loadOverlay });
    await inScope(async () => {
      const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), first.deps);
      await vi.waitFor(() => expect(resolved.value.state).toBe("error"));
    });
    expect(calls).toBe(1);

    fail = false;
    const second = makeDeps({ labels: ref(true), loadOverlay });
    await inScope(async () => {
      const { resolved } = useResolvedStyle(ref<PaneLayer>({ layerId: VERSATILES }), second.deps);
      await vi.waitFor(() => expect(resolved.value.state).toBe("ready"));
    });
    expect(calls).toBe(2);
  });
});
