// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { xyzCandidate } from "@/lib/layers/addedInspect";

import { findLayer, useCatalogue } from "./useCatalogue";

const layer = xyzCandidate("https://tiles.example/{z}/{x}/{y}.png").layer;
const catalogue = useCatalogue();

async function savedInStorage(): Promise<boolean> {
  await nextTick();
  return (localStorage.getItem("mapcompare:added-layers") ?? "").includes(layer.id);
}

afterEach(() => catalogue.removeLayer(layer.id));

describe("Added Layers", () => {
  it("shows a Layer a link brought for the session, without saving it", async () => {
    catalogue.showFromLink([layer]);
    expect(findLayer(layer.id)).toStrictEqual(layer);
    expect(catalogue.isSaved(layer.id)).toBe(false);
    expect(await savedInStorage()).toBe(false);
  });

  it("never lets a link overwrite the user's own copy of the same source", () => {
    catalogue.saveLayer({ ...layer, label: "mine" });
    catalogue.showFromLink([{ ...layer, label: "theirs" }]);
    expect(findLayer(layer.id)?.label).toBe("mine");
  });

  it("saves a Layer a link brought once the user keeps it", async () => {
    catalogue.showFromLink([layer]);
    catalogue.saveLayer(layer);
    expect(catalogue.isSaved(layer.id)).toBe(true);
    expect(catalogue.addedLayers.value.filter((l) => l.id === layer.id)).toHaveLength(1);
    expect(await savedInStorage()).toBe(true);
  });

  it("refuses to save what it could not read back, so a reload never loses it", async () => {
    expect(catalogue.saveLayer({ ...layer, label: "x".repeat(500) })).toBe(false);
    expect(findLayer(layer.id)).toBeUndefined();
    expect(await savedInStorage()).toBe(false);
  });

  it("says when a link brings back a Layer the user removed this session", () => {
    catalogue.saveLayer(layer);
    catalogue.removeLayer(layer.id);
    catalogue.showFromLink([layer]);
    expect(catalogue.restoredByLink.value.map((l) => l.id)).toStrictEqual([layer.id]);

    // Only once: the Layer is shown again now, not removed.
    catalogue.restoredByLink.value = [];
    catalogue.showFromLink([layer]);
    expect(catalogue.restoredByLink.value).toStrictEqual([]);
  });

  it("forgets a Layer whether it was saved or from a link", () => {
    catalogue.saveLayer(layer);
    catalogue.showFromLink([{ ...layer, label: "theirs" }]);
    catalogue.removeLayer(layer.id);
    expect(findLayer(layer.id)).toBeUndefined();
  });
});
