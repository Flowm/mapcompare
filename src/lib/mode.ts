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

export const MODE_LABELS: Record<Mode, string> = {
  g1: "Single",
  g2: "2 panes",
  g3: "3 panes",
  g4: "4 panes",
  sw: "Swipe",
  bl: "Blink",
};
