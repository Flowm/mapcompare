import { useDebounceFn } from "@vueuse/core";
import { computed, getCurrentScope, onScopeDispose, ref, watch } from "vue";

import { GEOCODING_MIN_QUERY, searchPlaces } from "@/api/geocoding";
import { type ParsedCoordinate, parseCoordinate } from "@/lib/coordinates";
import type { Place } from "@/lib/destination";

/**
 * Turning what someone typed into something to go to.
 *
 * Two rules carry this module. A coordinate never touches the network: it is recognised and
 * answered synchronously, so pasting a position is instant and works offline. And the outcome is
 * a single value rather than a set of flags, because `loading` alongside a stale `places` array is
 * what puts a spinner over yesterday's results. One value makes that state impossible to build.
 *
 * Staleness is handled by a single counter rather than by aborting alone. Aborting an in-flight
 * request does not stop a response that has already arrived and is waiting to resolve, and the
 * debounce can fire for input that no longer exists — deleting `Berl` back to `Be` leaves a
 * scheduled search for a query the user has moved on from. One generation number, checked at both
 * points, covers both.
 */

export type SearchOutcome =
  /** Nothing typed: the curated list is the answer to "what should I even look at?". */
  | { kind: "presets" }
  /** One or two characters. The API has nothing to say here, so neither do we. */
  | { kind: "too-short" }
  | { kind: "coordinate"; coordinate: ParsedCoordinate }
  | { kind: "invalid-coordinate"; hint: string }
  | { kind: "loading" }
  | { kind: "places"; places: Place[] }
  | { kind: "no-matches"; query: string }
  | { kind: "error"; message: string };

export interface LocationSearchDeps {
  search: (query: string, options: { signal: AbortSignal }) => Promise<Place[]>;
  debounceMs: number;
}

export const defaultLocationSearchDeps: LocationSearchDeps = {
  search: (query, { signal }) => searchPlaces(query, { signal }),
  debounceMs: 250,
};

export function useLocationSearch(deps: LocationSearchDeps = defaultLocationSearchDeps) {
  const query = ref("");
  const outcome = ref<SearchOutcome>({ kind: "presets" });

  let generation = 0;
  let controller: AbortController | undefined;

  const runSearch = useDebounceFn(async (input: string, scheduled: number) => {
    if (scheduled !== generation) return;

    const own = new AbortController();
    controller = own;

    try {
      const places = await deps.search(input, { signal: own.signal });
      if (scheduled !== generation) return;
      outcome.value = places.length === 0 ? { kind: "no-matches", query: input } : { kind: "places", places };
    } catch (error) {
      if (scheduled !== generation || own.signal.aborted) return;
      outcome.value = { kind: "error", message: error instanceof Error ? error.message : "Place search failed" };
    }
  }, deps.debounceMs);

  watch(query, (raw) => {
    const input = raw.trim();

    // Every keystroke invalidates whatever was in flight or merely scheduled.
    generation += 1;
    controller?.abort();
    controller = undefined;

    if (input === "") {
      outcome.value = { kind: "presets" };
      return;
    }

    const parsed = parseCoordinate(input);
    if (parsed.kind === "ok") {
      outcome.value = { kind: "coordinate", coordinate: parsed.value };
      return;
    }
    if (parsed.kind === "invalid") {
      outcome.value = { kind: "invalid-coordinate", hint: parsed.hint };
      return;
    }

    if (input.length < GEOCODING_MIN_QUERY) {
      outcome.value = { kind: "too-short" };
      return;
    }

    outcome.value = { kind: "loading" };
    void runSearch(input, generation);
  });

  // Leaving the page mid-request should not leave a fetch running.
  if (getCurrentScope()) onScopeDispose(() => controller?.abort());

  return {
    query,
    outcome: computed(() => outcome.value),
    /** Call after a destination is taken. */
    reset() {
      generation += 1;
      controller?.abort();
      controller = undefined;
      query.value = "";
      outcome.value = { kind: "presets" };
    },
  };
}
