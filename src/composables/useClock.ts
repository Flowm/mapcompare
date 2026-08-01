import { computed, ref } from "vue";

/**
 * One clock for the whole app, read once at startup.
 *
 * Date variants ("yesterday's Earth") are resolved from a clock, and three separate modules need
 * the answer: the pane that renders the tiles, and the two surfaces that label it. Each used to
 * call `new Date()` for itself, which made the answer a function of *when each one happened to
 * re-evaluate* rather than of the state. Two consequences, both reproduced:
 *
 *   - Across UTC midnight the three could disagree, so a chip could describe a day the map was
 *     not showing.
 *   - Re-resolving is triggered by unrelated input — pasting a key for a different provider,
 *     toggling labels — so a GIBS pane silently jumped to another day's imagery in response to
 *     something that had nothing to do with it.
 *
 * Read once, not ticked. A pane must never change vintage underneath someone who is mid-comparison,
 * and stability is worth more here than freshness: a reload picks up the new day. Exposed as a ref
 * rather than a bare Date so a caller can watch it, which keeps the door open to advancing it
 * deliberately later without any consumer changing.
 */
const now = ref(new Date());

export function useClock() {
  return { now: computed(() => now.value) };
}
