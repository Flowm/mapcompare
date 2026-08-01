import { describe, expect, it } from "vitest";

import { groupByOperator, hasKey, providerStatus, providerStatuses } from "./availability";
import { getProvider, PROVIDERS } from "./registry";

const mapbox = getProvider("mapbox.satellite")!;
const esri = getProvider("esri.imagery")!;

describe("hasKey", () => {
  it("treats a real value as set", () => {
    expect(hasKey("pk.abc123")).toBe(true);
  });

  it("treats an unset or blank value as unset", () => {
    // `VITE_MAPBOX_TOKEN=` with nothing after it yields "", not undefined.
    expect(hasKey(undefined)).toBe(false);
    expect(hasKey("")).toBe(false);
    expect(hasKey("   ")).toBe(false);
    expect(hasKey("\n\t")).toBe(false);
  });
});

describe("providerStatus", () => {
  it("enables a keyless provider regardless of keys", () => {
    expect(providerStatus(esri, {}).enabled).toBe(true);
    expect(providerStatus(esri, { VITE_MAPBOX_TOKEN: "x" }).enabled).toBe(true);
  });

  it("enables a keyed provider once its key is present", () => {
    const status = providerStatus(mapbox, { VITE_MAPBOX_TOKEN: "pk.abc" });
    expect(status.enabled).toBe(true);
    expect(status.disabled).toBeUndefined();
  });

  it("disables a keyed provider when its key is missing", () => {
    const status = providerStatus(mapbox, {});
    expect(status.enabled).toBe(false);
    expect(status.disabled?.code).toBe("missing-key");
  });

  it("disables a keyed provider when its key is blank", () => {
    expect(providerStatus(mapbox, { VITE_MAPBOX_TOKEN: "  " }).enabled).toBe(false);
  });

  it("ignores an unrelated key", () => {
    expect(providerStatus(mapbox, { VITE_MAPTILER_KEY: "abc" }).enabled).toBe(false);
  });

  it("names the env var in the visible reason, so the fix is discoverable", () => {
    const { disabled } = providerStatus(mapbox, {});
    expect(disabled?.message).toContain("VITE_MAPBOX_TOKEN");
    expect(disabled?.key).toBe("VITE_MAPBOX_TOKEN");
  });

  it("carries the signup URL and free tier through for the disabled option", () => {
    const { disabled } = providerStatus(mapbox, {});
    expect(disabled?.keyUrl).toContain("mapbox.com");
    expect(disabled?.freeTier).toBeTruthy();
  });
});

describe("providerStatuses", () => {
  it("preserves registry order", () => {
    const ids = providerStatuses(PROVIDERS, {}).map((s) => s.provider.id);
    expect(ids).toStrictEqual(PROVIDERS.map((p) => p.id));
  });
});

describe("groupByOperator", () => {
  const groups = groupByOperator(providerStatuses(PROVIDERS, {}));

  it("covers every provider exactly once", () => {
    expect(groups.flatMap((g) => g.entries)).toHaveLength(PROVIDERS.length);
  });

  it("gives each operator a single group", () => {
    const operators = groups.map((g) => g.operator);
    expect(new Set(operators).size).toBe(operators.length);
  });

  it("keeps disabled entries in place rather than hiding or sinking them", () => {
    // Discovery is most of the point of the app: an unavailable provider still teaches
    // the user that it exists and what it would cost.
    const mapboxGroup = groups.find((g) => g.operator === "Mapbox");
    expect(mapboxGroup?.entries.some((e) => e.provider.id === "mapbox.satellite" && !e.enabled)).toBe(true);
  });

  it("orders groups by first appearance in the registry", () => {
    expect(groups[0]?.operator).toBe(PROVIDERS[0]!.operator);
  });
});
