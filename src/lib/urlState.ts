import type { AddedLayer } from "@/lib/layers/added";
import { decodeAddedLayer, encodeAddedLayer } from "@/lib/layers/addedCodec";
import { type PaneLayer, paneLayer } from "@/lib/layers/types";

import { clampCamera, type CameraState, ZOOM_LIMITS } from "./camera";
import { isMode, type Mode, paneCountFor } from "./mode";
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
 *   p   panes       comma-separated layerId[:time], in pane order. A Time is ISO
 *                   (`2024`, `2025-12-18`, `2026-11-13T19:00Z`); only the first colon separates it
 *   c   added       comma-separated definitions of the Added Layers a pane shows, so the link
 *                   carries them to someone who never added them. See `encodeAddedLayer`
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
    panes.push(paneLayer(source.layerId, source.time));
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

/**
 * `added` is every Layer the user added by URL; only those a pane shows are written, so a link
 * never carries a Layer its recipient would not see.
 */
export function encodeState(state: AppStateSnapshot, defaults: readonly PaneLayer[], added: readonly AddedLayer[] = []): string {
  const s = canonicalise(state, defaults);
  const params: string[] = [];

  params.push(`m=${s.mode}`);

  const v = [s.camera.zoom.toFixed(PRECISION.zoom), s.camera.center[1].toFixed(PRECISION.lngLat), s.camera.center[0].toFixed(PRECISION.lngLat)];
  // Trailing zero angles are omitted so the common case stays short and readable.
  if (s.camera.bearing !== 0 || s.camera.pitch !== 0) v.push(s.camera.bearing.toFixed(PRECISION.angle));
  if (s.camera.pitch !== 0) v.push(s.camera.pitch.toFixed(PRECISION.angle));
  params.push(`v=${v.join("/")}`);

  params.push(`p=${s.panes.map((p) => (p.time === undefined ? p.layerId : `${p.layerId}:${p.time}`)).join(",")}`);

  const shown = new Set(s.panes.map((p) => p.layerId));
  const carried = added.filter((l) => shown.has(l.id));
  if (carried.length > 0) params.push(`c=${carried.map(encodeAddedLayer).join(",")}`);

  if (s.mode === "sw" && s.swipe !== 0.5) params.push(`sw=${s.swipe.toFixed(3)}`);
  if (s.labels) params.push("l=1");

  return `?${params.join("&")}`;
}

/**
 * `knownIds` is injected rather than imported from the registry. That keeps the codec free of
 * an import cycle, makes it testable against a three-element Set, and lets it replace ids that a
 * future build no longer ships, or an Added Layer whose definition did not survive, with that
 * pane's default instead of rendering a broken pane.
 */
export function decodeState(search: string, knownIds: ReadonlySet<string>, defaults: readonly PaneLayer[], fallback: AppStateSnapshot): AppStateSnapshot {
  const params = searchParams(search);

  const rawMode = params.get("m");
  const mode = rawMode !== null && isMode(rawMode) ? rawMode : fallback.mode;

  const camera = parseViewport(params.get("v")) ?? fallback.camera;

  const rawPanes = params.get("p");
  const panes =
    rawPanes === null
      ? fallback.panes
      : rawPanes
          .split(",")
          .filter((token) => token.trim() !== "")
          // An unknown Layer keeps its place with that pane's default, rather than being dropped and
          // shifting every later pane one to the left: in a swipe or blink, which side shows what is
          // the comparison.
          .map((token, i) => parsePane(token, knownIds) ?? defaults[i % Math.max(1, defaults.length)])
          .filter((p): p is PaneLayer => p !== undefined);

  const swipe = parseNumber(params.get("sw")) ?? fallback.swipe;
  const labels = params.get("l") === "1";

  return canonicalise({ mode, camera, panes: panes.length > 0 ? panes : fallback.panes, swipe, labels }, defaults);
}

/**
 * The Layers a link carries, for the caller to add to the catalogue before decoding the panes that
 * name them. A token that does not decode is dropped, as an unknown Layer id is.
 */
export function decodeAddedLayers(search: string): AddedLayer[] {
  const raw = searchParams(search).get("c");
  if (!raw) return [];
  return raw.split(",").flatMap((token) => decodeAddedLayer(token.trim()) ?? []);
}

/** A query string with or without its leading `?`. */
function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function parsePane(token: string, knownIds: ReadonlySet<string>): PaneLayer | undefined {
  const trimmed = token.trim();
  const colon = trimmed.indexOf(":");
  const layerId = colon === -1 ? trimmed : trimmed.slice(0, colon);
  if (!knownIds.has(layerId)) return undefined;
  const time = colon === -1 ? undefined : trimmed.slice(colon + 1);
  // The Time is NOT validated here: only the Layer knows which Times it has, and resolveTime
  // substitutes the nearest one at render time, saying so on the pane.
  return time === undefined || time === "" ? { layerId } : { layerId, time };
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
