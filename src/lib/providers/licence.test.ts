import { describe, expect, it } from "vitest";

import { licenceInfo, LICENCE_TIERS } from "./licence";
import { PROVIDERS } from "./registry";

describe("LICENCE_TIERS", () => {
  it("gives every tier a one-word label and an explanation", () => {
    for (const [tier, info] of Object.entries(LICENCE_TIERS)) {
      expect(info.label, tier).not.toBe("");
      expect(info.label.split(/\s+/), tier).toHaveLength(1);
      expect(info.explanation.length, tier).toBeGreaterThan(20);
    }
  });

  it("covers every tier used in the registry", () => {
    for (const provider of PROVIDERS) {
      expect(licenceInfo(provider.licence.tier), provider.id).toBeDefined();
    }
  });

  it("marks non-commercial as the most severe", () => {
    expect(LICENCE_TIERS.restricted.severity).toBe("bad");
    expect(LICENCE_TIERS.open.severity).toBe("ok");
  });

  it("reserves the clear severity for open licences alone", () => {
    // `licensed` is not free reuse — it depends on your own agreement with the provider — so it
    // warns like `terms` and `metered` rather than reading as safe.
    for (const tier of ["licensed", "terms", "metered"] as const) {
      expect(LICENCE_TIERS[tier].severity, tier).toBe("warn");
    }
  });

  it("labels the restricted tier by what it means rather than by its key", () => {
    // "restricted" is the internal name; the user needs to read "non-commercial".
    expect(LICENCE_TIERS.restricted.label).toBe("non-commercial");
  });
});

describe("registry licences", () => {
  it("marks Sentinel-2 cloudless non-commercial, which is its actual licence", () => {
    const eox = PROVIDERS.find((p) => p.id === "eox.s2cloudless")!;
    expect(eox.licence.tier).toBe("restricted");
    expect(eox.licence.note).toMatch(/CC BY-NC-SA/i);
  });

  it("flags the keyless Esri endpoints as terms-restricted", () => {
    for (const id of ["esri.imagery", "esri.clarity", "esri.wayback"]) {
      expect(PROVIDERS.find((p) => p.id === id)!.licence.tier, id).toBe("terms");
    }
  });

  it("marks the keyed ArcGIS route as properly licensed, unlike the keyless ones", () => {
    expect(PROVIDERS.find((p) => p.id === "arcgis.imagery")!.licence.tier).toBe("licensed");
  });

  it("marks VersaTiles open, since it is the one commercially safe keyless layer", () => {
    expect(PROVIDERS.find((p) => p.id === "versatiles.satellite")!.licence.tier).toBe("open");
  });

  it("warns that Mapbox bills per tile through MapLibre", () => {
    const mapbox = PROVIDERS.find((p) => p.id === "mapbox.satellite")!;
    expect(mapbox.licence.tier).toBe("metered");
    expect(mapbox.licence.note).toMatch(/bill/i);
  });
});
