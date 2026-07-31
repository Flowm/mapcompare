/**
 * Where a popover goes, given its trigger.
 *
 * Pure so the awkward parts — flipping above the trigger, shrinking to the room left, staying
 * inside the viewport — are unit-testable without a browser. The component only reads a rect and
 * applies the result as fixed-position CSS.
 *
 * Fixed positioning is not a detail here. A popover nested inside a pane is clipped by that pane:
 * `overflow-hidden` cuts it off, the neighbouring pane's chrome stacks over it, and in swipe mode
 * the top pane's `clip-path` erases whatever crosses the seam. Anchoring to the viewport instead
 * is what makes those three problems impossible rather than merely unlikely.
 */

export interface Anchor {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PanelBox {
  width: number;
  /** The tallest the panel may be. It shrinks further when the room runs out. */
  maxHeight: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * CSS for the panel. Exactly one of `top`/`bottom` is set: a flipped panel has to be anchored by
 * its bottom edge, because its real height is not known until it renders.
 */
export interface Placement {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/** Clearance kept from every viewport edge. */
const MARGIN = 8;

/** Gap between trigger and panel. */
const GAP = 6;

/** Below this a panel shows too few rows to be worth keeping below the trigger. */
const MIN_USEFUL_HEIGHT = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placePanel(anchor: Anchor, panel: PanelBox, viewport: Viewport, align: "left" | "right" = "left"): Placement {
  const roomBelow = viewport.height - anchor.bottom - GAP - MARGIN;
  const roomAbove = anchor.top - GAP - MARGIN;

  // Flip only when staying below would be cramped AND above is genuinely roomier. Flipping for a
  // marginal gain moves the panel out from under the cursor for no benefit.
  const flip = roomBelow < Math.min(panel.maxHeight, MIN_USEFUL_HEIGHT) && roomAbove > roomBelow;

  const maxHeight = Math.max(0, Math.min(panel.maxHeight, flip ? roomAbove : roomBelow));
  const wantedLeft = align === "right" ? anchor.right - panel.width : anchor.left;
  const left = clamp(wantedLeft, MARGIN, viewport.width - panel.width - MARGIN);

  return flip ? { left, bottom: viewport.height - anchor.top + GAP, maxHeight } : { left, top: anchor.bottom + GAP, maxHeight };
}
