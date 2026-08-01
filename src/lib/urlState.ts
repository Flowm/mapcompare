import { clampCamera, type CameraState, ZOOM_LIMITS } from "./camera";
import { isMode, type Mode, paneCountFor } from "./mode";
import type { PaneLayer } from "./providers/types";
import { clampSwipe } from "./swipe";

/**
 * The URL codec. Every comparison is a link.
 *
 * State lives in the query string rather than the hash: it is what people recognise as
 * shareable, and it keeps MapLibre's own `hash` option out of the picture entirely.
 *
 * Parameters are always emitted in a fixed order so the same state always produces the same
 * string, which is what makes the round-trip properties testable.
 *
 *   m   mode        g1|g2|g3|g4|sw|bl
 *   v   viewport    zoom/lat/lon[/bearing[/pitch]]
 *   p   panes       comma-separated providerId[:variant], in pane order
 *   sw  divider     0..1, only in swipe mode and only when not centred
 *   l   labels      1, only when the label overlay is on
 *
 * Slashes are legal unencoded inside a query value, and `zoom/lat/lon` echoes the
 * `#map=z/lat/lon` idiom people already read from OSM and MapLibre.
 */

export interface AppStateSnapshot {
  mode: Mode;
  camera: CameraState;
  /** Always exactly paneCountFor(mode) entries. Enforced by `canonicalise`. */
  panes: PaneLayer[];
  swipe: number;
  labels: boolean;
}

/** Wire precision. lat/lon to 5 dp is ~1 m, which is finer than anyone can share meaningfully. */
const PRECISION = { zoom: 2, lngLat: 5, angle: 1 } as const;

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

/**
 * Rounds to wire precision, clamps into legal ranges, and reconciles pane count against the
 * mode. The canonical form is the ROUNDED one — that is what makes round-tripping lossless in
 * the only sense that matters.
 */
export function canonicalise(state: AppStateSnapshot, defaults: readonly PaneLayer[]): AppStateSnapshot {
  const clamped = clampCamera(state.camera, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
  const wanted = paneCountFor(state.mode);

  const panes: PaneLayer[] = [];
  for (let i = 0; i < wanted; i += 1) {
    const source = state.panes[i] ?? defaults[i % Math.max(1, defaults.length)];
    if (!source) continue;
    panes.push(source.variant === undefined ? { providerId: source.providerId } : { providerId: source.providerId, variant: source.variant });
  }

  return {
    mode: state.mode,
    camera: {
      center: [round(clamped.center[0], PRECISION.lngLat), round(clamped.center[1], PRECISION.lngLat)],
      zoom: round(clamped.zoom, PRECISION.zoom),
      bearing: round(clamped.bearing, PRECISION.angle),
      pitch: round(clamped.pitch, PRECISION.angle),
      // Roll is not encoded: it is unreachable through the app's own controls, so putting it
      // in the URL would add a component that can never round-trip from real use.
      roll: 0,
    },
    panes,
    // Delegated, not reimplemented: `swipe.ts` owns what a divider position may legally be, the
    // same way `camera.ts` owns the camera's ranges just above.
    swipe: round(clampSwipe(state.swipe), 3),
    labels: state.labels,
  };
}

export function encodeState(state: AppStateSnapshot, defaults: readonly PaneLayer[]): string {
  const s = canonicalise(state, defaults);
  const params: string[] = [];

  params.push(`m=${s.mode}`);

  const v = [s.camera.zoom.toFixed(PRECISION.zoom), s.camera.center[1].toFixed(PRECISION.lngLat), s.camera.center[0].toFixed(PRECISION.lngLat)];
  // Trailing zero angles are omitted so the common case stays short and readable.
  if (s.camera.bearing !== 0 || s.camera.pitch !== 0) v.push(s.camera.bearing.toFixed(PRECISION.angle));
  if (s.camera.pitch !== 0) v.push(s.camera.pitch.toFixed(PRECISION.angle));
  params.push(`v=${v.join("/")}`);

  params.push(`p=${s.panes.map((p) => (p.variant === undefined ? p.providerId : `${p.providerId}:${p.variant}`)).join(",")}`);

  if (s.mode === "sw" && s.swipe !== 0.5) params.push(`sw=${s.swipe.toFixed(3)}`);
  if (s.labels) params.push("l=1");

  return `?${params.join("&")}`;
}

/**
 * `knownIds` is injected rather than imported from the registry. That keeps the codec free of
 * an import cycle, makes it testable against a three-element Set, and lets it silently drop
 * ids that a future build no longer ships instead of rendering a broken pane.
 */
export function decodeState(search: string, knownIds: ReadonlySet<string>, defaults: readonly PaneLayer[], fallback: AppStateSnapshot): AppStateSnapshot {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  const rawMode = params.get("m");
  const mode = rawMode !== null && isMode(rawMode) ? rawMode : fallback.mode;

  const camera = parseViewport(params.get("v")) ?? fallback.camera;

  const rawPanes = params.get("p");
  const panes =
    rawPanes === null
      ? fallback.panes
      : rawPanes
          .split(",")
          .map((token) => parsePane(token, knownIds))
          .filter((p): p is PaneLayer => p !== undefined);

  const swipe = parseNumber(params.get("sw")) ?? fallback.swipe;
  const labels = params.get("l") === "1";

  return canonicalise({ mode, camera, panes: panes.length > 0 ? panes : fallback.panes, swipe, labels }, defaults);
}

function parsePane(token: string, knownIds: ReadonlySet<string>): PaneLayer | undefined {
  const trimmed = token.trim();
  if (trimmed === "") return undefined;
  const colon = trimmed.indexOf(":");
  const providerId = colon === -1 ? trimmed : trimmed.slice(0, colon);
  if (!knownIds.has(providerId)) return undefined;
  const variant = colon === -1 ? undefined : trimmed.slice(colon + 1);
  // The variant is NOT validated here: only the provider knows its own vintages, and
  // resolveVariant clamps or falls back at render time.
  return variant === undefined || variant === "" ? { providerId } : { providerId, variant };
}

function parseViewport(raw: string | null): CameraState | undefined {
  if (raw === null) return undefined;
  const parts = raw.split("/");
  if (parts.length < 3) return undefined;
  const [zoom, lat, lon, bearing, pitch] = parts.map(parseNumber);
  if (zoom === undefined || lat === undefined || lon === undefined) return undefined;
  return { center: [lon, lat], zoom, bearing: bearing ?? 0, pitch: pitch ?? 0, roll: 0 };
}

function parseNumber(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
