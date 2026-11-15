import { useMediaQuery } from "@vueuse/core";

/**
 * Laid out for a phone: narrower than Tailwind's `md`, or a phone on its side, whose 812x375 is
 * wide enough for `md` but leaves the map a sliver next to a side column.
 *
 * Mirrored by the `compact:` and `roomy:` variants in style.css; change both together.
 */
const COMPACT_QUERY = "(width < 48rem) or (height < 30rem)";

/**
 * Whether the app is laid out for a phone.
 *
 * Only for the places where the layout swaps one component for another: a drawer instead of a
 * popover or a side column, a modal that fills the screen. Anything that only restyles uses the
 * `compact:`/`roomy:` and `pointer-coarse:` variants in CSS instead, which need no script and
 * cannot disagree with this during the first paint.
 *
 * Module-level, so every caller shares one set of media-query listeners.
 */
const isCompact = useMediaQuery(COMPACT_QUERY);

/** A finger rather than a mouse: no hover, so nothing may live only in a tooltip or a title. */
const isCoarse = useMediaQuery("(pointer: coarse)");

export function useViewport() {
  return { isCompact, isCoarse };
}
