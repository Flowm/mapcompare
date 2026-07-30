import type { StyleSpecification } from "maplibre-gl";

/**
 * A trimmed stand-in for OpenFreeMap Liberty, shaped from the real document
 * (https://tiles.openfreemap.org/styles/liberty — style v8, 111 layers).
 *
 * It keeps one layer of every type Liberty actually contains, so the overlay extractor is
 * exercised against each case it has to include or reject: background (no `source` at all),
 * a raster shaded-relief layer, fill, boundary lines, non-boundary lines, symbols, and
 * fill-extrusion. Real values for `glyphs`, `sprite` and the vector source URL.
 */
export const LIBERTY_FIXTURE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
  sources: {
    ne2_shaded: {
      type: "raster",
      tiles: ["https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 6,
    },
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">OpenMapTiles</a>',
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "natural_earth", type: "raster", source: "ne2_shaded", maxzoom: 6 },
    { id: "landcover_wood", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#d8e8c8" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#a0c8f0" } },
    { id: "highway_major", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "#fc8" } },
    { id: "waterway_river", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#a0c8f0" } },
    { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary", paint: { "line-color": "#9e9cab" } },
    { id: "boundary_3", type: "line", source: "openmaptiles", "source-layer": "boundary", minzoom: 5, paint: { "line-color": "#9e9cab" } },
    { id: "building_3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", paint: { "fill-extrusion-height": 10 } },
    {
      id: "road_one_way_arrow",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 16,
      layout: { "icon-image": "arrow", "symbol-placement": "line" },
    },
    {
      id: "highway-shield-non-us",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 8,
      // Deliberately sprite-dependent: this is the layer that renders blank if `sprite` is
      // not carried across alongside `glyphs`.
      layout: { "icon-image": "shield", "text-field": ["get", "ref"], "text-font": ["Noto Sans Regular"] },
    },
    {
      id: "label_city",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 3,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"] },
    },
    {
      id: "water_name_point_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"] },
    },
  ],
};

/** A minimal raster basemap style, matching what buildRasterStyle produces. */
export const RASTER_BASE_FIXTURE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://example.test/{z}/{x}/{y}.jpg"],
      tileSize: 256,
      attribution: "Example imagery",
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap", paint: { "raster-fade-duration": 0 } }],
};
