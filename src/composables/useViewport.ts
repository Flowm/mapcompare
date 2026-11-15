import { breakpointsTailwind, useBreakpoints, useMediaQuery } from "@vueuse/core";

/**
 * Whether the app is laid out for a phone.
 *
 * Only for the places where the layout swaps one component for another: a drawer instead of a
 * popover or a side column, a modal that fills the screen. Anything that only restyles uses the
 * `md:` and `pointer-coarse:` variants in CSS instead, which need no script and cannot disagree
 * with this during the first paint.
 *
 * Module-level, so every caller shares one set of media-query listeners.
 */
const breakpoints = useBreakpoints(breakpointsTailwind);
const isCompact = breakpoints.smaller("md");

/** A finger rather than a mouse: no hover, so nothing may live only in a tooltip or a title. */
const isCoarse = useMediaQuery("(pointer: coarse)");

export function useViewport() {
  return { isCompact, isCoarse };
}
