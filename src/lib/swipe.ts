import type { Mode } from "./mode";

/**
 * Geometry for the stacked comparison modes.
 *
 * Clipping is done with `clip-path`, never by resizing the top pane's container. Sizing the
 * top map to 50% width and hiding the overflow changes its canvas size, so MapLibre resizes,
 * so the same camera covers a different visible extent — and the two halves stop lining up at
 * the seam. `clip-path` leaves both canvases identical and only masks paint, which is what
 * makes the seam pixel-exact. That is the whole trick.
 *
 * `clip-path` also clips hit-testing, so gestures land on whichever pane is visible under the
 * cursor. Both panes share one camera, so that needs no pointer-events juggling.
 */

/** Keeps a sliver of each pane visible so the divider can always be grabbed back. */
export const MIN_INSET = 0.02;

/** Divider position as a fraction of deck width, clamped away from both edges. */
export function fractionFromPointer(clientX: number, rect: { left: number; width: number }, minInset: number = MIN_INSET): number {
  if (rect.width <= 0) return 0.5;
  const raw = (clientX - rect.left) / rect.width;
  return clamp(raw, minInset);
}

export function nudge(position: number, delta: number, minInset: number = MIN_INSET): number {
  return clamp(position + delta, minInset);
}

function clamp(value: number, minInset: number): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1 - minInset, Math.max(minInset, value));
}

/**
 * The `clip-path` for the TOP pane (index 0). The bottom pane is never clipped.
 *
 * - swipe: reveal the top pane left of the divider.
 * - blink: show the top pane entirely, or hide it entirely.
 * - grid:  no clipping at all.
 */
export function clipInsetFor(mode: Mode, position: number, topVisible: boolean): string {
  if (mode === "sw") return `inset(0 ${((1 - position) * 100).toFixed(3)}% 0 0)`;
  if (mode === "bl") return topVisible ? "none" : "inset(0 100% 0 0)";
  return "none";
}

/** Percentage offset for positioning the divider handle. */
export function dividerPercent(position: number): string {
  return `${(position * 100).toFixed(3)}%`;
}
