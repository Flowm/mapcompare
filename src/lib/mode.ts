/**
 * The comparison modes, and the pane count each implies.
 *
 * Split out from urlState so components can depend on the mode vocabulary without pulling in
 * the URL codec.
 */

export type Mode = "g1" | "g2" | "g3" | "g4" | "sw" | "bl";

export const MODES: readonly Mode[] = ["g1", "g2", "g3", "g4", "sw", "bl"];

export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

/**
 * Pane count is DERIVED from the mode and never stored alongside it: two fields that can
 * disagree is a bug waiting to happen. The stacked modes are always exactly two panes.
 */
export function paneCountFor(mode: Mode): 1 | 2 | 3 | 4 {
  switch (mode) {
    case "g1":
      return 1;
    case "g3":
      return 3;
    case "g4":
      return 4;
    case "g2":
    case "sw":
    case "bl":
      return 2;
  }
}

/** Stacked modes draw panes on top of each other and clip; grid modes tile them. */
export function isStacked(mode: Mode): boolean {
  return mode === "sw" || mode === "bl";
}

/** Whether the deck is wider than it is tall. A phone held upright is the usual `portrait`. */
export type Aspect = "landscape" | "portrait";

/**
 * The grid tracks a mode implies, for the grid modes only.
 *
 * Exhaustive with no `default`, like `paneCountFor` — this used to be a second, parallel switch
 * inside MapDeck's template block whose `default` arm meant a new mode silently rendered as one
 * pane instead of failing to build.
 *
 * `g3` gets three equal tracks rather than a 2-over-1 layout on purpose. Every pane shares one
 * camera, so panes of different sizes show different extents of it — and a comparison between two
 * unequal windows onto the same view is exactly the kind of quiet dishonesty this app exists to
 * avoid.
 *
 * In a portrait deck the tracks turn into rows. Three columns on an upright phone are slivers a
 * few dozen pixels wide; three rows are the same equal windows, just stacked. `g4` is two by two
 * either way.
 */
export function layoutFor(mode: Mode, aspect: Aspect = "landscape"): string {
  const portrait = aspect === "portrait";
  switch (mode) {
    case "g1":
      return "grid-cols-1 grid-rows-1";
    case "g2":
      return portrait ? "grid-cols-1 grid-rows-2" : "grid-cols-2 grid-rows-1";
    case "g3":
      return portrait ? "grid-cols-1 grid-rows-3" : "grid-cols-3 grid-rows-1";
    case "g4":
      return "grid-cols-2 grid-rows-2";
    // Stacked modes are absolutely positioned, not tiled. A single track keeps the wrapper valid
    // for the frame in which the mode changes but the class has not yet been swapped.
    case "sw":
    case "bl":
      return "grid-cols-1 grid-rows-1";
  }
}

/** Portrait only when strictly taller than wide, so a square deck keeps the desktop columns. */
export function aspectOf(width: number, height: number): Aspect {
  return height > width ? "portrait" : "landscape";
}

export const MODE_LABELS: Record<Mode, string> = {
  g1: "Single",
  g2: "2 panes",
  g3: "3 panes",
  g4: "4 panes",
  sw: "Swipe",
  bl: "Blink",
};
