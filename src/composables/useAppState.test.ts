import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { useAppState } from "./useAppState";

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
});

describe("panes", () => {
  it("restores previous choices when the deck grows back", () => {
    state.setMode("g4");
    state.setPaneLayer(2, { providerId: "gibs.modis.terra" });
    state.setMode("g2");
    expect(state.panes.value).toHaveLength(2);
    state.setMode("g4");
    expect(state.panes.value[2]).toMatchObject({ providerId: "gibs.modis.terra" });
  });

  it("hands out copies, so a pane change cannot mutate the registry's own objects", () => {
    state.setMode("g2");
    const layer = { providerId: "esri.imagery", variant: undefined };
    state.setPaneLayer(0, layer);
    expect(state.panes.value[0]).not.toBe(layer);
  });

  it("ignores an out-of-range pane index rather than growing the deck", () => {
    state.setMode("g2");
    state.setPaneLayer(7, { providerId: "esri.imagery" });
    expect(state.panes.value).toHaveLength(2);
  });
});

describe("applyPreset", () => {
  it("moves the camera and leaves the layers alone", () => {
    state.setMode("g2");
    state.setPaneLayer(0, { providerId: "gibs.modis.terra" });
    const before = state.panes.value.map((p) => p.providerId);

    state.applyPreset({ name: "Somewhere", why: "test", lat: 1.5, lon: 2.5, zoom: 9 });

    expect(state.camera.value).toMatchObject({ center: [2.5, 1.5], zoom: 9, bearing: 0, pitch: 0, roll: 0 });
    expect(state.panes.value.map((p) => p.providerId)).toEqual(before);
  });

  it("clamps a preset the camera owner would reject", () => {
    state.applyPreset({ name: "Too close", why: "test", lat: 0, lon: 0, zoom: 99 });
    // Guarded by code on the write path now, not only by a test asserting zoom <= 22 over the data.
    expect(state.camera.value.zoom).toBe(22);
  });
});
