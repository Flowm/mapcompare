import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";

/**
 * The optional label overlay, extracted from OpenFreeMap Liberty and laid over imagery.
 *
 * This replaces shipping a hybrid basemap. Overlaying our own labels is strictly better for a
 * comparison tool: it works over EVERY provider rather than only the one vendor that sells a
 * hybrid, and the labels are then identical across panes, so any difference the user sees is
 * attributable to the imagery rather than to two vendors' label rendering.
 *
 * The toggle is global rather than per-pane for the same reason — differing labels between panes
 * would introduce a visual difference that is not about the imagery at all.
 */

export const OVERLAY_SOURCE_ID = "ofm-labels";

/** Prefix for copied layer ids, so they can never collide with a base style's own layers. */
const LAYER_PREFIX = "ofm-";

export interface LabelOverlay {
  sourceId: string;
  source: SourceSpecification;
  /** Coastlines, administrative boundaries and symbol layers, all pointed at `sourceId`. */
  layers: LayerSpecification[];
  /** Liberty's font endpoint. Style-level, so it has to be merged before the style loads. */
  glyphs: string;
  /** Liberty's sprite. Required for highway shields and POI icons, which are sprite images. */
  sprite: StyleSpecification["sprite"];
}

/**
 * Note what is deliberately NOT here: the overlay's credit.
 *
 * It cannot come from this document. Liberty declares its vector source as a TileJSON `url`, so the
 * fetched style carries no `attribution` to copy — a field here read whatever the source happened to
 * inline, which for the real Liberty is nothing at all. The credit is therefore taken from the
 * registry entry the overlay is extracted from, in `useResolvedStyle`.
 */

/**
 * Coastlines, drawn as the outline of OpenMapTiles' ocean polygons.
 *
 * Liberty has no coastline layer to copy: it shows the coast as the edge of its water fill, and
 * that fill would paint over the imagery. So the overlay draws only the outline of those polygons.
 * Only the `ocean` class is used. Lakes, rivers and ponds would put a ring around every pond at
 * street zoom, and that is cartography, not orientation.
 *
 * The line is light so it shows against dark water, and thin so it does not cover the shoreline
 * it marks. Polygon edges cut at tile borders fall in the tile buffer, which is not drawn, so no
 * tile grid appears in the line.
 */
const COASTLINE_LAYER: LayerSpecification = {
  id: `${LAYER_PREFIX}coastline`,
  type: "line",
  source: OVERLAY_SOURCE_ID,
  "source-layer": "water",
  filter: ["==", ["get", "class"], "ocean"],
  layout: { "line-join": "round", "line-cap": "round" },
  paint: {
    "line-color": "hsl(195, 60%, 85%)",
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 6, 0.7],
    "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1, 14, 1.75],
  },
};

/**
 * Selects the parts of Liberty worth drawing over imagery: every `symbol` layer (place labels,
 * road names, highway shields, POIs, water names, aerodromes) plus the `boundary` line layers,
 * with our own coastline added below them.
 *
 * Everything else is deliberately dropped. `background`, `fill`, `raster` and `fill-extrusion`
 * layers would paint over the imagery, which is the one thing we are trying to look at, and the
 * non-boundary `line` layers draw the full road and waterway network — cartography competing
 * with the photograph rather than annotating it.
 */
export function extractLabelOverlay(liberty: StyleSpecification): LabelOverlay {
  const sourceName = findVectorSourceName(liberty);
  const source = sourceName === undefined ? undefined : liberty.sources[sourceName];
  if (sourceName === undefined || source === undefined) throw new Error("Liberty style has no vector source to build a label overlay from");

  const copied = liberty.layers
    .filter((layer) => keepForOverlay(layer, sourceName))
    .map((layer) =>
      // Copied onto a fresh object rather than mutated: the fetched Liberty style is cached and
      // shared with the standalone Liberty basemap entry, so editing it in place would corrupt
      // that pane. `source` is re-pointed because Liberty calls its source "openmaptiles", and a
      // base style using that same name would otherwise bind the overlay to the wrong tiles.
      Object.assign({}, layer, { id: `${LAYER_PREFIX}${layer.id}`, source: OVERLAY_SOURCE_ID }),
    ) as LayerSpecification[];
  // First, so boundaries and labels draw on top of the coast.
  const layers = [COASTLINE_LAYER, ...copied];

  return {
    sourceId: OVERLAY_SOURCE_ID,
    source,
    layers,
    glyphs: liberty.glyphs ?? "",
    sprite: liberty.sprite,
  };
}

function keepForOverlay(layer: LayerSpecification, sourceName: string): boolean {
  if (!("source" in layer) || layer.source !== sourceName) return false;
  if (layer.type === "symbol") return true;
  return layer.type === "line" && "source-layer" in layer && layer["source-layer"] === "boundary";
}

function findVectorSourceName(style: StyleSpecification): string | undefined {
  return Object.keys(style.sources).find((name) => style.sources[name]?.type === "vector");
}

/**
 * Appends the overlay on top of `style` and takes over its `glyphs` and `sprite`.
 *
 * Replacing those is safe precisely because every imagery provider in the catalogue is
 * label-free, so there is no font stack of its own to break — a second reason a vendor hybrid
 * was the wrong shape for this.
 *
 * The overlay is merged into the spec BEFORE the style is applied, rather than added with
 * addLayer afterwards, so a basemap switch can never race against it.
 */
export function applyLabelOverlay(style: StyleSpecification, overlay: LabelOverlay): StyleSpecification {
  const baseLayers = style.layers.filter((layer) => !layer.id.startsWith(LAYER_PREFIX));
  const { [overlay.sourceId]: _existing, ...baseSources } = style.sources;

  return {
    ...style,
    glyphs: overlay.glyphs,
    sprite: overlay.sprite,
    sources: { ...baseSources, [overlay.sourceId]: overlay.source },
    // Last, so labels sit above the imagery.
    layers: [...baseLayers, ...overlay.layers],
  };
}
