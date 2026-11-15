import { isStacked, type Mode } from "./mode";

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

/**
 * The only legal range for a divider position, and the one place that decides it.
 *
 * Every route into `swipe` goes through here — the pointer, the keyboard, and the URL codec. The
 * URL used to clamp to `[0, 1]` on its own, which let `?sw=0` mask the top pane completely and put
 * the handle at `left: 0%`, half of it off-screen: a shared link that could not be dragged back.
 */
export function clampSwipe(value: number, minInset: number = MIN_INSET): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1 - minInset, Math.max(minInset, value));
}

/** Divider position as a fraction of deck width, clamped away from both edges. */
export function fractionFromPointer(clientX: number, rect: { left: number; width: number }, minInset: number = MIN_INSET): number {
  if (rect.width <= 0) return 0.5;
  const raw = (clientX - rect.left) / rect.width;
  return clampSwipe(raw, minInset);
}

export function nudge(position: number, delta: number, minInset: number = MIN_INSET): number {
  return clampSwipe(position + delta, minInset);
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

/**
 * Which side of a pane its chrome sits on — picker, chips and credit together.
 *
 * Lives here, beside `clipInsetFor`, because the two facts must agree and previously did not live
 * together: `clipInsetFor` reveals the top pane to the LEFT of the divider, so the top pane's
 * chrome has to be on the left or `clip-path` erases it. Erasing the attribution that way is a
 * licensing failure rather than an untidy layout, and the rule was three lines in a template block
 * that no test could reach while the geometry it had to match had thirteen.
 */
export function paneSide(mode: Mode, index: number): "left" | "right" {
  if (!isStacked(mode)) return "right";
  return index === 0 ? "left" : "right";
}

/** The CSS custom property MapDeck sets to the divider position, as a fraction of the deck. */
export const SWIPE_VAR = "--swipe";

/**
 * The widest a pane's chrome may be, as a CSS `max-width`, or undefined when it may use the pane.
 *
 * In swipe mode each pane is visible on one side of the divider only, and its chrome sits on that
 * side (`paneSide`). Chrome wider than its side runs under the other pane and is cut off at the
 * seam — on a phone that is the credit, which must stay legible. So the limit follows the divider:
 * dragged to 30%, the left pane's chrome gets 30% of the deck and the right pane's 70%.
 *
 * The divider position is read from `SWIPE_VAR` rather than baked in, so the expression is the same
 * on every frame of a drag and nothing re-renders for it; only the variable changes.
 */
export function chromeMaxWidth(mode: Mode, index: number): string | undefined {
  if (mode !== "sw") return undefined;
  const share = paneSide(mode, index) === "left" ? `var(${SWIPE_VAR})` : `(1 - var(${SWIPE_VAR}))`;
  return `max(0px, calc(${share} * 100% - 1rem))`;
}
