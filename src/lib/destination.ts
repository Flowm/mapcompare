import type { Preset } from "./presets";

/**
 * Somewhere the camera can be sent, and how far in to be on arrival.
 *
 * Three things produce a Destination, and they know wildly different amounts. A Preset carries a
 * zoom picked by hand for the thing it wants to show. A Place carries none at all: the geocoding
 * API returns a bare point with no extent and no bounding box, so arrival zoom has to be inferred
 * from what kind of thing it is and how big it is. A Coordinate carries no name and can never
 * acquire one, because place search only answers names.
 *
 * A Destination deliberately carries no layer information, for exactly the reason `presets.ts`
 * gives: the panes are the comparison the user built, and going somewhere takes that comparison
 * with you rather than replacing it.
 */
export interface Destination {
  /** Absent for a bare coordinate, which has no name and no way to get one. */
  label?: string;
  /** `[lng, lat]`, matching `CameraState` and MapLibre. */
  center: [number, number];
  zoom: number;
}

/**
 * A named entity from place search, reduced to the fields that identify it on screen or decide
 * where the camera stops. Everything the API also returns — elevation, timezone, the lower admin
 * levels, postcodes — is dropped at the edge rather than carried around unused.
 */
export interface Place {
  id: number;
  name: string;
  lat: number;
  lon: number;
  /** A GeoNames feature code: `PPLC`, `ADM1`, `PCLI`, … */
  featureCode: string;
  countryCode: string;
  country?: string;
  admin1?: string;
  population?: number;
}

/**
 * The floor exists because a coordinate is a point and arriving at z3 tells you nothing about it.
 * The ceiling because precision beyond a metre or so is a property of the notation, not of anyone's
 * confidence in the position.
 */
export const COORDINATE_ZOOM_LIMITS = { min: 10, max: 18 } as const;

/**
 * Calibrated so two decimal places (~1.1 km) lands at z12 and four (~11 m) at z16, which fixes the
 * slope at two zoom levels per decimal place. Whole seconds (~31 m) fall out at z15 and whole
 * minutes (~1.8 km) at z12, both of which are about right, so the one line covers all three
 * notations rather than needing a table.
 */
export function zoomForPrecision(precision: number): number {
  if (!Number.isFinite(precision) || precision <= 0) return COORDINATE_ZOOM_LIMITS.max;
  const zoom = 8 - 2 * Math.log10(precision);
  return Math.round(Math.min(COORDINATE_ZOOM_LIMITS.max, Math.max(COORDINATE_ZOOM_LIMITS.min, zoom)));
}

/**
 * Nothing here is precise, and it does not need to be: it decides whether arriving at a country
 * shows the country or one field in it.
 */
const FEATURE_ZOOM: Readonly<Record<string, number>> = {
  CONT: 3,
  PCL: 5,
  PCLD: 5,
  PCLF: 5,
  PCLI: 5,
  PCLIX: 5,
  PCLS: 5,
  ADM1: 7,
  ADM2: 9,
  ADM3: 10,
  ADM4: 11,
  ADM5: 11,
  PPLC: 11,
  PPLA: 12,
  PPLA2: 13,
  PPLA3: 13,
  PPLA4: 13,
  PPLA5: 13,
  PPL: 13,
  PPLL: 14,
  PPLS: 14,
  PPLX: 14,
};

const DEFAULT_PLACE_ZOOM = 12;

function zoomForPopulation(population: number): number {
  if (population >= 5_000_000) return 10;
  if (population >= 1_000_000) return 11;
  if (population >= 200_000) return 12;
  if (population >= 20_000) return 13;
  return 14;
}

/**
 * Population wins over the feature code for settlements, because `PPL` covers both a hamlet and a
 * city of four million and the code alone cannot tell them apart. It is missing from roughly a
 * quarter of results, which is the case the table still has to answer.
 */
export function zoomForPlace(place: Place): number {
  if (place.featureCode.startsWith("PPL") && place.population !== undefined) return zoomForPopulation(place.population);
  return FEATURE_ZOOM[place.featureCode] ?? DEFAULT_PLACE_ZOOM;
}

export function presetToDestination(preset: Preset): Destination {
  return { label: preset.name, center: [preset.lon, preset.lat], zoom: preset.zoom };
}

export function placeToDestination(place: Place): Destination {
  return { label: place.name, center: [place.lon, place.lat], zoom: zoomForPlace(place) };
}

/**
 * The line under a place's name. The API exposes no relevance score, so naming where a result is
 * carries the whole burden of telling the nine Springfields apart.
 */
export function placeContext(place: Place): string {
  return [place.admin1, place.country ?? place.countryCode].filter((part) => part !== undefined && part !== "").join(" · ");
}

/**
 * The context line is not enough on its own: two distinct places routinely share a name *and* a
 * region. Bavaria has two Germerings, 55 km apart, and every other visible field matches, so the
 * rows come out indistinguishable. The coordinate is the one field guaranteed to differ, because
 * a search result is a position.
 *
 * Two decimals and degree markers, matching how meteocompare prints the same thing: ~1.1 km, which
 * separates settlements without implying a centroid is known any better than it is.
 */
export function placeCoordinates(place: Place): string {
  return `${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}°`;
}
