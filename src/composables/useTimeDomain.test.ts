import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import { getLayer } from "@/lib/layers/registry";
import { declaredTimeDomain, latestTime, type TimeDomain } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";

import { type TimeDomainDeps, useTimeDomain } from "./useTimeDomain";

const NOW = new Date("2026-03-10T12:00:00Z");

function layer(id: string): Layer {
  const found = getLayer(id);
  if (!found) throw new Error(`no layer ${id}`);
  return found;
}

function inScope<T>(body: () => T): T {
  const scope = effectScope();
  try {
    return scope.run(body)!;
  } finally {
    scope.stop();
  }
}

describe("useTimeDomain", () => {
  it("is static for a Layer without Times, and never asks a service", () => {
    let asked = 0;
    const deps: TimeDomainDeps = { now: ref(NOW), loadTimeDomain: () => (asked++, Promise.resolve(undefined)) };
    const state = inScope(() => useTimeDomain(ref(layer("versatiles.satellite")), deps).domain.value);
    expect(state).toStrictEqual({ state: "static", layerId: "versatiles.satellite" });
    expect(asked).toBe(0);
  });

  it("answers a declared list at once, with no loading state to flash", () => {
    const deps: TimeDomainDeps = { now: ref(NOW), loadTimeDomain: () => Promise.reject(new Error("must not be asked")) };
    const state = inScope(() => useTimeDomain(ref(layer("eox.s2cloudless")), deps).domain.value);
    expect(state.state).toBe("ready");
    if (state.state === "ready") expect(latestTime(state.domain)).toBe(Date.UTC(2025, 0, 1));
  });

  it("asks the service for a discoverable Layer and drops an answer about a Layer it has left", async () => {
    const answers = new Map<string, (d: TimeDomain) => void>();
    const deps: TimeDomainDeps = {
      now: ref(NOW),
      loadTimeDomain: (l) => new Promise((resolve) => answers.set(l.id, resolve)),
    };
    const scope = effectScope();
    const target = ref<Layer>(layer("gibs.viirs.noaa20"));
    const { domain } = scope.run(() => useTimeDomain(target, deps))!;
    expect(domain.value).toStrictEqual({ state: "loading", layerId: "gibs.viirs.noaa20" });

    target.value = layer("gibs.modis.terra");
    await nextTick();
    answers.get("gibs.viirs.noaa20")!(declaredTimeDomain(layer("gibs.viirs.noaa20").time!, NOW));
    await Promise.resolve();
    expect(domain.value).toStrictEqual({ state: "loading", layerId: "gibs.modis.terra" });

    answers.get("gibs.modis.terra")!(declaredTimeDomain(layer("gibs.modis.terra").time!, NOW));
    await Promise.resolve();
    expect(domain.value).toMatchObject({ state: "ready", layerId: "gibs.modis.terra" });
    scope.stop();
  });

  it("reports a service that cannot be read", async () => {
    const deps: TimeDomainDeps = { now: ref(NOW), loadTimeDomain: () => Promise.reject(new Error("Could not read the catalogue: 503")) };
    const scope = effectScope();
    const { domain } = scope.run(() => useTimeDomain(ref(layer("satvis.georing")), deps))!;
    await Promise.resolve();
    await Promise.resolve();
    expect(domain.value).toStrictEqual({ state: "error", layerId: "satvis.georing", message: "Could not read the catalogue: 503" });
    scope.stop();
  });
});
