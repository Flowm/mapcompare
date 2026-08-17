import { describe, expect, it } from "vitest";

import { COORDINATE_ZOOM_LIMITS, type Place, placeContext, placeCoordinates, placeToDestination, presetToDestination, zoomForPlace, zoomForPrecision } from "./destination";
import { PRESETS } from "./presets";

function place(overrides: Partial<Place> = {}): Place {
  return { id: 1, name: "Somewhere", lat: 48.1, lon: 11.5, featureCode: "PPL", countryCode: "DE", ...overrides };
}

describe("zoomForPrecision", () => {
  it("is calibrated at two zoom levels per decimal place", () => {
    expect(zoomForPrecision(0.01)).toBe(12);
    expect(zoomForPrecision(0.0001)).toBe(16);
  });

  it("puts whole seconds and whole minutes somewhere sensible", () => {
    expect(zoomForPrecision(1 / 3600)).toBe(15);
    expect(zoomForPrecision(1 / 60)).toBe(12);
  });

  it("clamps rather than flying to the moon or into the pavement", () => {
    expect(zoomForPrecision(1)).toBe(COORDINATE_ZOOM_LIMITS.min);
    expect(zoomForPrecision(1e-12)).toBe(COORDINATE_ZOOM_LIMITS.max);
  });

  it("survives a precision that makes no sense", () => {
    expect(zoomForPrecision(0)).toBe(COORDINATE_ZOOM_LIMITS.max);
    expect(zoomForPrecision(Number.NaN)).toBe(COORDINATE_ZOOM_LIMITS.max);
  });
});

describe("zoomForPlace", () => {
  it("uses population for settlements, because PPL covers a hamlet and a metropolis alike", () => {
    expect(zoomForPlace(place({ featureCode: "PPL", population: 8_000_000 }))).toBe(10);
    expect(zoomForPlace(place({ featureCode: "PPL", population: 300_000 }))).toBe(12);
    expect(zoomForPlace(place({ featureCode: "PPL", population: 400 }))).toBe(14);
  });

  it("falls back to the feature code when population is missing, which it often is", () => {
    expect(zoomForPlace(place({ featureCode: "PPL" }))).toBe(13);
    expect(zoomForPlace(place({ featureCode: "PPLC" }))).toBe(11);
  });

  it("pulls back for regions and countries", () => {
    expect(zoomForPlace(place({ featureCode: "PCLI" }))).toBe(5);
    expect(zoomForPlace(place({ featureCode: "ADM1" }))).toBe(7);
    expect(zoomForPlace(place({ featureCode: "CONT" }))).toBe(3);
  });

  it("has an answer for a feature code it has never heard of", () => {
    expect(zoomForPlace(place({ featureCode: "PRK" }))).toBe(12);
    expect(zoomForPlace(place({ featureCode: "ZZZZ" }))).toBe(12);
  });
});

describe("converting to a destination", () => {
  it("keeps a preset's hand-picked zoom, which is the reason the entry exists", () => {
    const preset = PRESETS[0]!;
    expect(presetToDestination(preset)).toEqual({ label: preset.name, center: [preset.lon, preset.lat], zoom: preset.zoom });
  });

  it("puts a place's centre in lng, lat order to match the camera", () => {
    expect(placeToDestination(place({ lat: 48.1, lon: 11.5, population: 1_500_000 }))).toEqual({ label: "Somewhere", center: [11.5, 48.1], zoom: 11 });
  });

  it("carries no layer information from any source", () => {
    for (const destination of [presetToDestination(PRESETS[0]!), placeToDestination(place())]) {
      expect(Object.keys(destination).toSorted()).toEqual(["center", "label", "zoom"]);
    }
  });
});

describe("placeContext", () => {
  it("is what separates one Springfield from the next", () => {
    expect(placeContext(place({ admin1: "Illinois", country: "United States" }))).toBe("Illinois · United States");
  });

  it("falls back through the fields the API leaves out", () => {
    expect(placeContext(place({ country: "Germany" }))).toBe("Germany");
    expect(placeContext(place({ admin1: "Bavaria" }))).toBe("Bavaria · DE");
  });
});

describe("placeCoordinates", () => {
  it("separates two places a name and a region cannot", () => {
    // Bavaria has two Germerings 55 km apart. Every other visible field is identical, so without
    // the position the two rows are the same row twice.
    const near = place({ id: 2921039, name: "Germering", lat: 48.13392, lon: 11.3765, admin1: "Bavaria", country: "Germany" });
    const far = place({ id: 2921040, name: "Germering", lat: 47.90679, lon: 12.11835, admin1: "Bavaria", country: "Germany" });

    expect(placeContext(near)).toBe(placeContext(far));
    expect(placeCoordinates(near)).not.toBe(placeCoordinates(far));
  });

  it("prints lat, lon in that order at a town's worth of precision", () => {
    expect(placeCoordinates(place({ lat: 48.13392, lon: 11.3765 }))).toBe("48.13°, 11.38°");
    expect(placeCoordinates(place({ lat: -33.8688, lon: 151.2093 }))).toBe("-33.87°, 151.21°");
  });
});
