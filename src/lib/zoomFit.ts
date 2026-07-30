/**
 * How the current zoom relates to a provider's native resolution.
 *
 * What MapLibre actually does when the map is zoomed past a raster source's `maxzoom`, verified
 * in v6's `covering_tiles.ts`: it clamps the requested tile zoom to `maxzoom` and draws those
 * tiles scaled up. Overzoom reparsing applies only to vector tiles. So a pane goes BLURRY, never
 * blank — which is correct behaviour, not a failure.
 *
 * That is precisely why this exists. Blur with no explanation reads as a broken app, and worse,
 * `raster-resampling: linear` smooths interpolated pixels into something that looks like detail
 * the imagery does not have. The badge says which it is.
 */

export interface ZoomFitProvider {
  minzoom: number;
  maxzoom: number;
}

export type ZoomFit =
  | { kind: "native" }
  /** `factor` is the linear upscale, so 2 means each source pixel covers two screen pixels. */
  | { kind: "upscaled"; nativeMax: number; factor: number }
  | { kind: "belowMin"; nativeMin: number };

export function zoomFit(provider: ZoomFitProvider, zoom: number): ZoomFit {
  // Tile zoom is integral, so a map at z16.4 is still served by z16 tiles and is not yet
  // overzoomed. Comparing the floor avoids an "upscaled 1.3x" badge that flickers on during an
  // ordinary pinch.
  const tileZoom = Math.floor(zoom);
  if (tileZoom > provider.maxzoom) return { kind: "upscaled", nativeMax: provider.maxzoom, factor: 2 ** (tileZoom - provider.maxzoom) };
  if (tileZoom < provider.minzoom) return { kind: "belowMin", nativeMin: provider.minzoom };
  return { kind: "native" };
}

export function formatZoomFit(fit: ZoomFit): string {
  switch (fit.kind) {
    case "native":
      return "native";
    case "upscaled":
      return `z${fit.nativeMax} native · ${fit.factor}× upscaled`;
    case "belowMin":
      return `no data below z${fit.nativeMin}`;
  }
}

/** Short form for a compact chip. */
export function shortZoomFit(fit: ZoomFit): string {
  switch (fit.kind) {
    case "native":
      return "native";
    case "upscaled":
      return `${fit.factor}× upscaled`;
    case "belowMin":
      return `below z${fit.nativeMin}`;
  }
}

export type ZoomSeverity = "ok" | "warn" | "bad";

/**
 * Severity for colouring. A 2x upscale is barely noticeable and not worth alarming about; past
 * 8x the pane is mush and the user should know before drawing a conclusion from it.
 */
export function zoomSeverity(fit: ZoomFit): ZoomSeverity {
  if (fit.kind === "native") return "ok";
  if (fit.kind === "belowMin") return "warn";
  if (fit.factor >= 8) return "bad";
  if (fit.factor >= 4) return "warn";
  return "ok";
}
