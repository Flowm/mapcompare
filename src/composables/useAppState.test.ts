// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { xyzCandidate } from "@/lib/layers/addedInspect";

import { useAppState } from "./useAppState";
import { findLayer, useCatalogue } from "./useCatalogue";

/**
 * These two behaviours were reproduced as defects before being fixed, and both were invisible from
 * `src/lib` — they live in how the pure pieces are wired, not in the pieces.
 *
 * The module is a singleton initialised from `window.location.search` at import time, so a test
 * cannot choose the startup URL. Everything here drives it through the interface instead.
 */

const state = useAppState();

describe("history restore", () => {
  it("does not rewrite the history entry it just navigated to", async () => {
    state.installHistoryListener();

    // Land on a URL carrying a parameter the app does not own and a provider id it does not know.
    window.history.pushState(null, "", "/?m=g2&v=16.00/52.37300/4.89300&p=versatiles.satellite,nope&utm_source=newsletter");

    const replaceState = vi.spyOn(window.history, "replaceState");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await nextTick();
    await nextTick();

    // The old guard was cleared synchronously, before the pre-flush watchers ran, so it suppressed
    // nothing: every Back/Forward rewrote its own entry, dropping `utm_source` and replacing the
    // unknown provider id with a default.
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it("releases the guard afterwards, so ordinary changes still reach the URL", async () => {
    state.installHistoryListener();
    window.history.pushState(null, "", "/?m=g2&v=16.00/52.37300/4.89300&p=versatiles.satellite,esri.imagery");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await nextTick();
    await nextTick();

    const replaceState = vi.spyOn(window.history, "replaceState");
    state.setLabels(!state.labels.value);
    await nextTick();
    expect(replaceState).toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it("restores blink mode to the top pane, the same as entering it directly", async () => {
    // The invariant `setMode` documents — "entering blink always starts on the top pane, so the
    // first press is a change" — used to hold on only one of the two paths that set `mode`.
    state.setMode("g2");
    state.setBlinkTopVisible(false);
    state.setMode("bl");
    expect(state.blinkTopVisible.value).toBe(true);

    state.setMode("g2");
    state.setBlinkTopVisible(false);
    window.history.pushState(null, "", "/?m=bl&v=16.00/52.37300/4.89300&p=versatiles.satellite,esri.imagery");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await nextTick();

    expect(state.mode.value).toBe("bl");
    expect(state.blinkTopVisible.value).toBe(true);
  });

  it("reads an old Wayback link's release id as the snapshot it names", async () => {
    state.installHistoryListener();
    window.history.pushState(null, "", "/?m=g2&v=16.00/52.37300/4.89300&p=esri.wayback:4756,esri.wayback:1234");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await nextTick();

    // A listed id becomes its ISO Time; an unknown number stays as written, for the pane to report
    // as unreadable rather than as the year 1234.
    expect(state.panes.value).toStrictEqual([
      { layerId: "esri.wayback", time: "2019-12-12" },
      { layerId: "esri.wayback", time: "1234" },
    ]);
  });
});

describe("panes", () => {
  it("restores previous choices when the deck grows back", () => {
    state.setMode("g4");
    state.setPaneLayer(2, { layerId: "gibs.modis.terra" });
    state.setMode("g2");
    expect(state.panes.value).toHaveLength(2);
    state.setMode("g4");
    expect(state.panes.value[2]).toMatchObject({ layerId: "gibs.modis.terra" });
  });

  it("hands out copies, so a pane change cannot mutate the registry's own objects", () => {
    state.setMode("g2");
    const layer = { layerId: "esri.imagery", time: undefined };
    state.setPaneLayer(0, layer);
    expect(state.panes.value[0]).not.toBe(layer);
  });

  it("shows one moment on every satellite pane, at each one's precision, and leaves basemaps alone", () => {
    state.setMode("g4");
    state.setPaneLayer(0, { layerId: "gibs.goes.east" });
    state.setPaneLayer(1, { layerId: "gibs.viirs.noaa20" });
    state.setPaneLayer(2, { layerId: "eox.s2cloudless" });
    state.setPaneLayer(3, { layerId: "esri.imagery" });
    state.showTimeOnEveryPane("2026-11-13T18:40Z");
    expect(state.panes.value).toStrictEqual([
      { layerId: "gibs.goes.east", time: "2026-11-13T18:40Z" },
      { layerId: "gibs.viirs.noaa20", time: "2026-11-13" },
      { layerId: "eox.s2cloudless" },
      { layerId: "esri.imagery" },
    ]);
  });

  it("sets every satellite pane to follow the latest when the source does, rather than pinning them", () => {
    state.setMode("g3");
    state.setPaneLayer(0, { layerId: "gibs.goes.east" });
    state.setPaneLayer(1, { layerId: "gibs.viirs.noaa20", time: "2026-11-13" });
    state.setPaneLayer(2, { layerId: "eox.s2cloudless", time: "2020" });
    state.showTimeOnEveryPane(undefined);
    expect(state.panes.value).toStrictEqual([{ layerId: "gibs.goes.east" }, { layerId: "gibs.viirs.noaa20" }, { layerId: "eox.s2cloudless", time: "2020" }]);
  });

  it("ignores an out-of-range pane index rather than growing the deck", () => {
    state.setMode("g2");
    state.setPaneLayer(7, { layerId: "esri.imagery" });
    expect(state.panes.value).toHaveLength(2);
  });
});

describe("goTo", () => {
  it("moves the camera and leaves the layers alone", () => {
    state.setMode("g2");
    state.setPaneLayer(0, { layerId: "gibs.modis.terra" });
    const before = state.panes.value.map((p) => p.layerId);

    state.goTo({ label: "Somewhere", center: [2.5, 1.5], zoom: 9 });

    expect(state.camera.value).toMatchObject({ center: [2.5, 1.5], zoom: 9, bearing: 0, pitch: 0, roll: 0 });
    expect(state.panes.value.map((p) => p.layerId)).toEqual(before);
  });

  it("clamps a destination the camera owner would reject", () => {
    state.goTo({ label: "Too close", center: [0, 0], zoom: 99 });
    // Guarded by code on the write path now, not only by a test asserting zoom <= 22 over the data.
    expect(state.camera.value.zoom).toBe(22);
  });

  it("levels the camera, so arrival matches the view the zoom was chosen for", () => {
    state.goTo({ center: [10, 20], zoom: 12 });
    expect(state.camera.value).toMatchObject({ bearing: 0, pitch: 0, roll: 0 });
  });
});

describe("removing an Added Layer", () => {
  const layer = xyzCandidate("https://removed.example/{z}/{x}/{y}.png").layer;
  const catalogue = useCatalogue();

  it("resets the hidden panes too, so a mode change cannot bring it back", () => {
    catalogue.saveLayer(layer);
    state.setMode("g4");
    state.setPaneLayer(0, { layerId: layer.id });
    state.setPaneLayer(3, { layerId: layer.id });
    state.setMode("g2");

    state.removeAddedLayer(layer.id);
    expect(state.panes.value[0]!.layerId).toBe("versatiles.satellite");
    state.setMode("g4");
    expect(state.panes.value.map((p) => p.layerId)).not.toContain(layer.id);
    state.setMode("g2");
  });

  it("is not saved again by going Back to a link that carried it", async () => {
    state.installHistoryListener();
    catalogue.saveLayer(layer);
    state.setPaneLayer(0, { layerId: layer.id });
    const link = state.sharePermalink();
    expect(link).toContain("&c=");

    state.removeAddedLayer(layer.id);
    window.history.pushState(null, "", link);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await nextTick();
    await nextTick();

    // The link still shows its comparison, but only for this session.
    expect(state.panes.value[0]!.layerId).toBe(layer.id);
    expect(findLayer(layer.id)).toBeDefined();
    expect(catalogue.isSaved(layer.id)).toBe(false);
    catalogue.removeLayer(layer.id);
  });

  it("resets the panes when the Layer disappears from under them, as a removal in another tab does", async () => {
    catalogue.saveLayer(layer);
    state.setPaneLayer(1, { layerId: layer.id });
    catalogue.removeLayer(layer.id);
    await nextTick();
    expect(state.panes.value[1]!.layerId).toBe("esri.imagery");
  });
});
