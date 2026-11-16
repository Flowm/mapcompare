import { describe, expect, it } from "vitest";

import { type Inspection, xyzCandidate } from "@/lib/layers/addedInspect";

import { useLayerInspection } from "./useLayerInspection";

const found = (url: string): Inspection => ({ candidates: [xyzCandidate(url)], partial: false });

describe("useLayerInspection", () => {
  it("keeps only the answer about the URL inspected last", async () => {
    let releaseSlow!: () => void;
    const inspection = useLayerInspection((url) => (url.includes("slow") ? new Promise((resolve) => (releaseSlow = () => resolve(found(url)))) : Promise.resolve(found(url))));
    const slow = inspection.run("https://slow.example/{z}/{x}/{y}.png");
    await inspection.run("https://fast.example/{z}/{x}/{y}.png");
    releaseSlow();
    await slow;
    expect(inspection.candidates.value.map((c) => c.layer.label)).toStrictEqual(["fast.example"]);
    expect(inspection.inspecting.value).toBe(false);
  });

  it("says why an inspection failed, and starts clean on the next one", async () => {
    const inspection = useLayerInspection(async () => {
      throw new Error("No drawable GeoTIFF asset found.");
    });
    await inspection.run("https://x.example/catalog.json");
    expect(inspection.error.value).toBe("No drawable GeoTIFF asset found.");
    inspection.reset();
    expect(inspection.error.value).toBeUndefined();
  });
});
