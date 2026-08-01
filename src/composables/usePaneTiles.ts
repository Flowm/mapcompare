import type { Map as MapLibreMap } from "maplibre-gl";
import { onScopeDispose, ref, type ShallowRef, watch } from "vue";

/**
 * Counts failed tile requests for one pane.
 *
 * KNOWN GAP, and a big one: this does not see 404s, which are most missing tiles. MapLibre
 * swallows them deliberately — `SourceCache._loadTile` marks the tile errored and only fires the
 * error event `if (err.status !== 404)` — so zooming past a provider's coverage produces a blank
 * pane and a count of zero. What survives to this counter is the other failures: 403 on a rejected
 * key, 429 on a rate limit, 5xx from the service.
 *
 * Two things stand in for it until that is fixed. Every `maxzoom` in the registry is set where
 * imagery genuinely exists rather than where the server stops saying no, so the common case is
 * upscaling with the zoom-fit badge rather than a 404 at all; and `pnpm run probe-tiles` re-checks
 * that against the live services.
 *
 * The third shape is worse than either and is not detectable here at all: a 200 carrying a picture
 * of nothing. EOX answers outside its coverage with a transparent PNG, and Esri with a grey "Map
 * data not yet available" JPEG. Only the probe script catches those.
 */
export function usePaneTiles(map: ShallowRef<MapLibreMap | undefined>) {
  const failed = ref(0);
  const loading = ref(false);

  let subscriptions: { unsubscribe: () => void }[] = [];

  function detach() {
    for (const subscription of subscriptions) subscription.unsubscribe();
    subscriptions = [];
  }

  watch(
    map,
    (instance) => {
      detach();
      failed.value = 0;
      if (!instance) return;

      subscriptions = [
        instance.on("error", (event) => {
          // Only tile failures are counted. Style and glyph errors surface elsewhere and would
          // make this number mean two different things at once.
          const status = (event as { error?: { status?: number } }).error?.status;
          if (typeof status === "number" && status >= 400) failed.value += 1;
        }),
        instance.on("dataloading", () => (loading.value = true)),
        instance.on("idle", () => (loading.value = false)),
        // A style swap replaces every source, so the previous layer's failures no longer describe
        // what is on screen.
        instance.on("styledata", () => (failed.value = 0)),
      ];
    },
    { immediate: true },
  );

  onScopeDispose(detach);

  return { failed, loading };
}
