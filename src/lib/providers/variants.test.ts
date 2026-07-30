import { describe, expect, it } from "vitest";

import { getProvider } from "./registry";
import type { VariantSpec } from "./types";
import { defaultVariant, isValidVariant, resolveVariant, variantLabel, vintageFor } from "./variants";

const NOW = new Date("2026-07-30T09:00:00Z");
const YESTERDAY = "2026-07-29";

const YEARS: VariantSpec = {
  kind: "year",
  token: "{YEAR}",
  values: [
    { value: "2017", label: "2017" },
    { value: "2024", label: "2024" },
    { value: "2025", label: "2025" },
  ],
  default: "latest",
  label: "Vintage",
};

const DATES: VariantSpec = { kind: "date", token: "{DATE}", earliest: "2018-01-01", default: "latest", label: "Date" };

describe("defaultVariant", () => {
  it("takes the last fixed value for 'latest'", () => {
    expect(defaultVariant(YEARS, NOW)).toBe("2025");
  });

  it("takes yesterday UTC for a 'latest' date, never today", () => {
    // Today's global composite may not be published yet.
    expect(defaultVariant(DATES, NOW)).toBe(YESTERDAY);
  });

  it("honours an explicit default", () => {
    expect(defaultVariant({ ...YEARS, default: "2017" }, NOW)).toBe("2017");
  });
});

describe("isValidVariant", () => {
  it("accepts a declared fixed value and rejects anything else", () => {
    expect(isValidVariant(YEARS, "2024", NOW)).toBe(true);
    expect(isValidVariant(YEARS, "2016", NOW)).toBe(false);
    expect(isValidVariant(YEARS, "", NOW)).toBe(false);
  });

  it("accepts dates inside the window", () => {
    expect(isValidVariant(DATES, "2020-05-05", NOW)).toBe(true);
    expect(isValidVariant(DATES, "2018-01-01", NOW)).toBe(true);
    expect(isValidVariant(DATES, YESTERDAY, NOW)).toBe(true);
  });

  it("rejects today and the future, which have no published composite", () => {
    expect(isValidVariant(DATES, "2026-07-30", NOW)).toBe(false);
    expect(isValidVariant(DATES, "2027-01-01", NOW)).toBe(false);
  });

  it("rejects dates before the instrument existed", () => {
    expect(isValidVariant(DATES, "2017-12-31", NOW)).toBe(false);
  });

  it("rejects malformed dates", () => {
    expect(isValidVariant(DATES, "2020-5-5", NOW)).toBe(false);
    expect(isValidVariant(DATES, "yesterday", NOW)).toBe(false);
  });
});

describe("resolveVariant", () => {
  it("falls back to the default when nothing is requested", () => {
    expect(resolveVariant(YEARS, undefined, NOW)).toBe("2025");
    expect(resolveVariant(YEARS, "", NOW)).toBe("2025");
  });

  it("passes a valid request through untouched", () => {
    expect(resolveVariant(YEARS, "2017", NOW)).toBe("2017");
    expect(resolveVariant(DATES, "2020-05-05", NOW)).toBe("2020-05-05");
  });

  it("falls back to the default for an unknown fixed value", () => {
    // There is nothing sensible to clamp "2016" to in a discrete list.
    expect(resolveVariant(YEARS, "2016", NOW)).toBe("2025");
  });

  it("clamps an out-of-window date rather than discarding it", () => {
    // An old shared link should land near what its author saw, not jump to yesterday.
    expect(resolveVariant(DATES, "2010-01-01", NOW)).toBe("2018-01-01");
    expect(resolveVariant(DATES, "2030-01-01", NOW)).toBe(YESTERDAY);
  });

  it("falls back to yesterday for an unparseable date", () => {
    expect(resolveVariant(DATES, "not-a-date", NOW)).toBe(YESTERDAY);
  });
});

describe("variantLabel", () => {
  it("maps an opaque value onto its human label", () => {
    // This is what makes Wayback usable: the value is a release id, the label is the date.
    const wayback = getProvider("esri.wayback")!;
    const first = wayback.variant!.values![0]!;
    expect(variantLabel(wayback.variant!, first.value)).toBe(first.label);
    expect(variantLabel(wayback.variant!, first.value)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to the raw value when unknown", () => {
    expect(variantLabel(YEARS, "1999")).toBe("1999");
  });
});

describe("vintageFor", () => {
  it("prefers the resolved variant label over the static vintage", () => {
    const eox = getProvider("eox.s2cloudless")!;
    expect(vintageFor(eox, "2019")).toBe("2019");
  });

  it("shows a Wayback capture date rather than its release id", () => {
    const wayback = getProvider("esri.wayback")!;
    const latest = wayback.variant!.values!.at(-1)!;
    expect(vintageFor(wayback, latest.value)).toBe(latest.label);
  });

  it("falls back to the static vintage when there is no variant", () => {
    expect(vintageFor(getProvider("gibs.viirs.noaa20")!, undefined)).toBe("daily");
    expect(vintageFor(getProvider("esri.imagery")!, undefined)).toBeUndefined();
  });
});

describe("registry variants resolve", () => {
  it("resolves a usable default for every parameterised provider", () => {
    for (const provider of [getProvider("eox.s2cloudless")!, getProvider("esri.wayback")!, getProvider("gibs.viirs.noaa20")!, getProvider("gibs.modis.terra")!]) {
      const resolved = resolveVariant(provider.variant!, undefined, NOW);
      expect(resolved, provider.id).not.toBe("");
      expect(isValidVariant(provider.variant!, resolved, NOW), provider.id).toBe(true);
    }
  });

  it("defaults Sentinel-2 cloudless to its newest published vintage", () => {
    expect(resolveVariant(getProvider("eox.s2cloudless")!.variant!, undefined, NOW)).toBe("2025");
  });
});
