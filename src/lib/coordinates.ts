import { type Destination, zoomForPrecision } from "./destination";

/**
 * Reading a position out of whatever someone pasted into the search bar.
 *
 * Three notations, all of them plain angles: decimal degrees, degrees with a hemisphere letter, and
 * degrees/minutes/seconds. Degrees with decimal minutes falls out of the same grammar for free.
 *
 * One invariant governs what gets added here: parsing is pure, offline and total. A notation that
 * cannot be read without asking a server does not belong in this module, and neither does one that
 * can be read two ways. See `UNSUPPORTED_NOTATIONS` for the ones that failed those tests.
 *
 * Minutes and seconds must carry their markers (`48° 10' 25"`, never `48 10 25`), because without
 * them `48 11` is both a decimal pair and a degrees-and-minutes reading with no way to choose.
 * Requiring the markers is what makes bare numbers unambiguously a pair.
 */

export type CoordinateFormat = "decimal degrees" | "degrees and decimal minutes" | "degrees, minutes and seconds";

export interface ParsedCoordinate {
  lat: number;
  lon: number;
  /** The angular size of the least significant digit stated, in degrees. */
  precision: number;
  format: CoordinateFormat;
  /** Set when the reading was not literal, so the row can say so before the camera moves. */
  note?: string;
}

/**
 * `invalid` is the difference between "no results for 48° 10' N" and telling someone their
 * coordinate is missing its longitude. Falling through to place search with coordinate-shaped
 * input produces a confidently empty answer to a question that was 95% right.
 */
export type CoordinateParse = { kind: "ok"; value: ParsedCoordinate } | { kind: "invalid"; hint: string } | { kind: "none" };

type Hemisphere = "N" | "S" | "E" | "W";

interface Component {
  /** Unsigned, degrees, with minutes and seconds already folded in. */
  magnitude: number;
  sign: 1 | -1;
  precision: number;
  format: CoordinateFormat;
  hemisphere?: Hemisphere;
  minutes?: number;
  seconds?: number;
}

const DEGREE = "[°º]";
const MINUTE = "['′’]";
const SECOND = `(?:["″”]|'')`;

const BODY =
  `([+-]?\\d+(?:\\.\\d+)?)\\s*${DEGREE}?` + // degrees, marker optional
  `(?:\\s*(\\d+(?:\\.\\d+)?)\\s*${MINUTE}` + // minutes, marker required
  `(?:\\s*(\\d+(?:\\.\\d+)?)\\s*${SECOND})?` + // seconds, marker required
  `)?`;

/**
 * The hemisphere letter can lead or trail, so a leading one wins outright and suppresses the
 * trailing group. One pattern with an optional group at each end instead reads `N48.17 E11.53` as
 * a single component whose trailing letter is the *next* component's leading one, and then the
 * pair no longer splits.
 */
const HEMISPHERE_FIRST = new RegExp(`^([NSEW])\\s*${BODY}`, "i");
const HEMISPHERE_LAST = new RegExp(`^${BODY}\\s*([NSEW])?`, "i");

/**
 * Anything that says "this was meant to be a coordinate" even though it did not parse as one.
 *
 * Every marker has to sit against a digit. A bare apostrophe is not evidence of anything:
 * `L'Aquila`, `N'Djamena` and `Coeur d'Alene` are places, and claiming them here would refuse to
 * search for them.
 */
const COORDINATE_PUNCTUATION = new RegExp(`\\d\\s*(?:${DEGREE}|${MINUTE}|${SECOND}|[NSEW]\\b)|(?:^|[\\s,])[NSEW]\\s*[+-]?\\d`, "i");

/**
 * Being told "UTM is not supported" is worth several lines of regex. Being told a UTM string needs
 * a latitude sends someone off to check their numbers for a fault that is not there.
 */
const UNSUPPORTED_NOTATIONS: readonly { pattern: RegExp; hint: string }[] = [
  { pattern: /^\d{1,2}\s*[C-HJ-NP-X]\s*[A-Z]{2}[\s\d]+$/i, hint: "MGRS is not supported. Use latitude and longitude." },
  { pattern: /^\d{1,2}\s*[A-Z]\s+\d{4,}\s+\d{4,}$/i, hint: "UTM is not supported. Use latitude and longitude." },
  { pattern: /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i, hint: "Plus Codes are not supported. Use latitude and longitude." },
];

function decimalsOf(text: string): number {
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

function matchComponentAt(text: string): { component: Component; length: number } | undefined {
  const led = HEMISPHERE_FIRST.exec(text);
  const found = led ?? HEMISPHERE_LAST.exec(text);
  if (!found) return undefined;

  const [whole, ...groups] = found;
  const [degreesText, minutesText, secondsText] = led ? groups.slice(1) : groups;
  const letter = led ? groups[0] : groups[3];
  if (degreesText === undefined) return undefined;

  const hemisphere = letter?.toUpperCase() as Hemisphere | undefined;
  const signed = degreesText.startsWith("-") || degreesText.startsWith("+");
  // A sign and a hemisphere letter are two ways to say the same thing, and `-48° N` says both at
  // once. Refusing is better than picking one and being wrong half the time.
  if (signed && hemisphere !== undefined) return undefined;

  const degrees = Math.abs(Number(degreesText));
  const minutes = minutesText === undefined ? undefined : Number(minutesText);
  const seconds = secondsText === undefined ? undefined : Number(secondsText);

  let precision = 10 ** -decimalsOf(degreesText);
  let format: CoordinateFormat = "decimal degrees";
  if (minutesText !== undefined) {
    precision = 10 ** -decimalsOf(minutesText) / 60;
    format = "degrees and decimal minutes";
  }
  if (secondsText !== undefined) {
    precision = 10 ** -decimalsOf(secondsText) / 3600;
    format = "degrees, minutes and seconds";
  }

  return {
    component: {
      magnitude: degrees + (minutes ?? 0) / 60 + (seconds ?? 0) / 3600,
      sign: degreesText.startsWith("-") ? -1 : 1,
      precision,
      format,
      hemisphere,
      minutes,
      seconds,
    },
    length: whole!.length,
  };
}

function parseWholeComponent(text: string): Component | undefined {
  const found = matchComponentAt(text);
  return found !== undefined && found.length === text.length ? found.component : undefined;
}

/**
 * A comma is the separator when there is one. Without a comma the first component is matched
 * greedily and whatever it did not consume is the second — which works precisely because minutes
 * and seconds need their markers, so `48.17 11.53` cannot be read as one component.
 */
function splitInput(input: string): [string, string] | undefined {
  const comma = input.indexOf(",");
  if (comma >= 0) {
    if (input.includes(",", comma + 1)) return undefined;
    return [input.slice(0, comma).trim(), input.slice(comma + 1).trim()];
  }

  const first = matchComponentAt(input);
  if (first === undefined || first.length >= input.length) return undefined;
  return [input.slice(0, first.length).trim(), input.slice(first.length).trim()];
}

const IS_LATITUDE: Readonly<Record<Hemisphere, boolean>> = { N: true, S: true, E: false, W: false };

function signedValue(component: Component): number {
  if (component.hemisphere === undefined) return component.magnitude * component.sign;
  return component.hemisphere === "S" || component.hemisphere === "W" ? -component.magnitude : component.magnitude;
}

/**
 * Decides which half is the latitude.
 *
 * Hemisphere letters settle it outright. Without them the order is lat, lon and is never guessed at
 * — except when the first value is past ±90, which no latitude can be, so the input can only have
 * been written the other way round. That case is swapped and says so.
 */
function orient(first: Component, second: Component): { lat: Component; lon: Component; note?: string } | { hint: string } {
  const firstIsLat = first.hemisphere === undefined ? undefined : IS_LATITUDE[first.hemisphere];
  const secondIsLat = second.hemisphere === undefined ? undefined : IS_LATITUDE[second.hemisphere];

  if (firstIsLat !== undefined && secondIsLat !== undefined && firstIsLat === secondIsLat) {
    return { hint: firstIsLat ? "Both values are latitudes. One needs to be E or W." : "Both values are longitudes. One needs to be N or S." };
  }

  const latIsSecond = firstIsLat === false || secondIsLat === true;
  if (firstIsLat !== undefined || secondIsLat !== undefined) {
    return latIsSecond ? { lat: second, lon: first, note: "read from the N/S/E/W markers" } : { lat: first, lon: second };
  }

  if (Math.abs(signedValue(first)) > 90 && Math.abs(signedValue(second)) <= 90) {
    return { lat: second, lon: first, note: "axis order swapped to lat, lon" };
  }
  return { lat: first, lon: second };
}

export function parseCoordinate(input: string): CoordinateParse {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "none" };

  const halves = splitInput(trimmed);
  const first = halves === undefined ? undefined : parseWholeComponent(halves[0]);
  const second = halves === undefined ? undefined : parseWholeComponent(halves[1]);

  if (first === undefined || second === undefined) {
    const unsupported = UNSUPPORTED_NOTATIONS.find(({ pattern }) => pattern.test(trimmed));
    if (unsupported !== undefined) return { kind: "invalid", hint: unsupported.hint };

    // Only claim the input when it is visibly a coordinate. Bare digits are left alone on purpose:
    // place search takes postal codes, so `80331` is a search, not a broken position.
    return COORDINATE_PUNCTUATION.test(trimmed) ? { kind: "invalid", hint: "That looks like a coordinate but needs both a latitude and a longitude." } : { kind: "none" };
  }

  for (const component of [first, second]) {
    if (component.minutes !== undefined && component.minutes >= 60) return { kind: "invalid", hint: "Minutes must be under 60." };
    if (component.seconds !== undefined && component.seconds >= 60) return { kind: "invalid", hint: "Seconds must be under 60." };
  }

  const oriented = orient(first, second);
  if ("hint" in oriented) return { kind: "invalid", hint: oriented.hint };

  const lat = signedValue(oriented.lat);
  const lon = signedValue(oriented.lon);
  if (Math.abs(lat) > 90) return { kind: "invalid", hint: "Latitude must be between -90 and 90." };
  if (Math.abs(lon) > 180) return { kind: "invalid", hint: "Longitude must be between -180 and 180." };

  // The coarser half decides: a position is only as precise as its vaguer axis, and the format
  // reported is that same half's, so what is shown back explains the zoom that came with it.
  const coarser = oriented.lat.precision >= oriented.lon.precision ? oriented.lat : oriented.lon;

  return {
    kind: "ok",
    value: { lat, lon, precision: coarser.precision, format: coarser.format, note: oriented.note },
  };
}

/** Prints a coordinate back at the precision it was written to, and no further. */
export function formatCoordinate(value: ParsedCoordinate): string {
  const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(value.precision))));
  return `${value.lat.toFixed(decimals)}, ${value.lon.toFixed(decimals)}`;
}

export function coordinateToDestination(value: ParsedCoordinate): Destination {
  return { center: [value.lon, value.lat], zoom: zoomForPrecision(value.precision) };
}
