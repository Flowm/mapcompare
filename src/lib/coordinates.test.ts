import { describe, expect, it } from "vitest";

import { type CoordinateParse, coordinateToDestination, formatCoordinate, parseCoordinate } from "./coordinates";

function ok(input: string) {
  const parsed = parseCoordinate(input);
  expect(parsed.kind, input).toBe("ok");
  return (parsed as Extract<CoordinateParse, { kind: "ok" }>).value;
}

function invalid(input: string): string {
  const parsed = parseCoordinate(input);
  expect(parsed.kind, input).toBe("invalid");
  return (parsed as Extract<CoordinateParse, { kind: "invalid" }>).hint;
}

const MUNICH = { lat: 48.1736, lon: 11.5322 };

describe("notations that are supported", () => {
  it("reads a decimal pair", () => {
    expect(ok("48.173508, 11.532206")).toMatchObject({ lat: 48.173508, lon: 11.532206, format: "decimal degrees" });
  });

  it("reads a decimal pair separated by whitespace alone", () => {
    // Two bare numbers are never a place name, so the comma is not required.
    expect(ok("48.173508 11.532206")).toMatchObject({ lat: 48.173508, lon: 11.532206 });
  });

  it("reads degrees with hemisphere letters", () => {
    expect(ok("48.1734° N, 11.5323° E")).toMatchObject({ lat: 48.1734, lon: 11.5323, format: "decimal degrees" });
  });

  it("reads degrees, minutes and seconds", () => {
    const value = ok(`48° 10' 25" N, 11° 31' 56" E`);
    expect(value.lat).toBeCloseTo(MUNICH.lat, 4);
    expect(value.lon).toBeCloseTo(MUNICH.lon, 4);
    expect(value.format).toBe("degrees, minutes and seconds");
  });

  it("reads degrees and decimal minutes, which the same grammar gives for free", () => {
    const value = ok("48° 10.4' N, 11° 31.9' E");
    expect(value.lat).toBeCloseTo(48.1733, 4);
    expect(value.format).toBe("degrees and decimal minutes");
  });

  it("accepts primes and smart quotes, which is what pasting produces", () => {
    const value = ok(`48° 10′ 25″ N, 11° 31′ 56″ E`);
    expect(value.lat).toBeCloseTo(MUNICH.lat, 4);
    expect(ok(`48° 10' 25'' N, 11° 31' 56'' E`).lat).toBeCloseTo(MUNICH.lat, 4);
  });

  it("reads a leading hemisphere letter", () => {
    expect(ok("N48.17 E11.53")).toMatchObject({ lat: 48.17, lon: 11.53 });
  });

  it("reads negative signs", () => {
    expect(ok("-33.8688, 151.2093")).toMatchObject({ lat: -33.8688, lon: 151.2093 });
  });

  it("turns S and W into negatives", () => {
    expect(ok("33.8688 S, 151.2093 W")).toMatchObject({ lat: -33.8688, lon: -151.2093 });
  });
});

describe("axis order", () => {
  it("takes unlabelled input as lat, lon without guessing", () => {
    const value = ok("11.53, 48.17");
    expect(value).toMatchObject({ lat: 11.53, lon: 48.17 });
    expect(value.note).toBeUndefined();
  });

  it("swaps when the first value cannot be a latitude, and says so", () => {
    const value = ok("151.2093, -33.8688");
    expect(value).toMatchObject({ lat: -33.8688, lon: 151.2093 });
    expect(value.note).toBe("axis order swapped to lat, lon");
  });

  it("lets hemisphere letters override the order", () => {
    const value = ok("11.53 E, 48.17 N");
    expect(value).toMatchObject({ lat: 48.17, lon: 11.53 });
    expect(value.note).toBe("read from the N/S/E/W markers");
  });

  it("uses one hemisphere letter to place both halves", () => {
    expect(ok("11.53 E, 48.17")).toMatchObject({ lat: 48.17, lon: 11.53 });
  });

  it("rejects two of the same axis", () => {
    expect(invalid("48 N, 11 N")).toContain("Both values are latitudes");
    expect(invalid("48 E, 11 W")).toContain("Both values are longitudes");
  });
});

describe("precision drives arrival zoom", () => {
  it("reads precision off the number of decimals stated", () => {
    expect(ok("48.17, 11.53").precision).toBeCloseTo(0.01);
    expect(ok("48.173508, 11.532206").precision).toBeCloseTo(1e-6);
  });

  it("takes the coarser half, because a position is only as good as its vaguer axis", () => {
    expect(ok("48.173508, 11.5").precision).toBeCloseTo(0.1);
  });

  it("reads precision off the smallest stated unit for DMS", () => {
    expect(ok(`48° 10' 25" N, 11° 31' 56" E`).precision).toBeCloseTo(1 / 3600);
    expect(ok("48° 10' N, 11° 31' E").precision).toBeCloseTo(1 / 60);
  });

  it("lands closer for a more precisely written position", () => {
    const coarse = coordinateToDestination(ok("48.17, 11.53"));
    const fine = coordinateToDestination(ok("48.173508, 11.532206"));
    expect(coarse.zoom).toBe(12);
    expect(fine.zoom).toBe(18);
    expect(coarse.zoom).toBeLessThan(fine.zoom);
  });

  it("stays inside the coordinate zoom range even for absurd input", () => {
    expect(coordinateToDestination(ok("48, 11")).zoom).toBe(10);
    expect(coordinateToDestination(ok("48.1234567890, 11.1234567890")).zoom).toBe(18);
  });

  it("carries no label, because place search only answers names", () => {
    expect(coordinateToDestination(ok("48.17, 11.53")).label).toBeUndefined();
  });

  it("prints back only the digits that were actually written", () => {
    expect(formatCoordinate(ok("48.17, 11.53"))).toBe("48.17, 11.53");
    expect(formatCoordinate(ok("48, 11"))).toBe("48, 11");
  });
});

describe("things that are not coordinates", () => {
  it.each(["Munich", "Munich, Germany", "Springfield, IL", "New York"])("leaves place names alone: %s", (input) => {
    expect(parseCoordinate(input).kind).toBe("none");
  });

  it("leaves postal codes alone, since place search accepts them", () => {
    expect(parseCoordinate("80331").kind).toBe("none");
    expect(parseCoordinate("80331, Germany").kind).toBe("none");
  });

  it.each(["L'Aquila", "N'Djamena", "Coeur d'Alene"])("does not mistake an apostrophe for a minutes marker: %s", (input) => {
    // The marker has to sit against a digit, or these places become unsearchable.
    expect(parseCoordinate(input).kind).toBe("none");
  });

  it.each(["Sweden", "Turkey", "Greece", "Bremen", "Perth", "Denver", "Regensburg", "Essen", "Bern"])("keeps %s searchable, which supporting geohash would not", (input) => {
    // Every one of these is a valid geohash. Recognising them as coordinates would skip place
    // search and fly somewhere else entirely, which is why geohash is not supported.
    expect(parseCoordinate(input).kind).toBe("none");
  });

  it("treats an empty string as nothing at all", () => {
    expect(parseCoordinate("").kind).toBe("none");
    expect(parseCoordinate("   ").kind).toBe("none");
  });
});

describe("coordinate-shaped input that cannot be used", () => {
  it("says a coordinate is missing a half rather than searching for it", () => {
    expect(invalid("48° 10' N")).toContain("latitude and a longitude");
  });

  it("names the notations that were deliberately left out", () => {
    expect(invalid("32N 691650 5334754")).toContain("UTM is not supported");
    expect(invalid("32U PU 91650 34754")).toContain("MGRS is not supported");
    expect(invalid("8FVC9G8F+6W")).toContain("Plus Codes are not supported");
  });

  it("rejects minutes and seconds past 60", () => {
    expect(invalid("48° 70' N, 11° 31' E")).toContain("Minutes must be under 60");
    expect(invalid(`48° 10' 61" N, 11° 31' 56" E`)).toContain("Seconds must be under 60");
  });

  it("rejects values outside the world", () => {
    expect(invalid("95, 200")).toContain("Latitude must be between");
    expect(invalid("45, 200")).toContain("Longitude must be between");
  });

  it("refuses a sign and a hemisphere letter saying the same thing twice", () => {
    expect(invalid("-48° N, 11° E")).toContain("latitude and a longitude");
  });
});
