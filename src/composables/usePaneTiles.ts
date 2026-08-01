import type { Map as MapLibreMap } from "maplibre-gl";
import { onScopeDispose, ref, type ShallowRef, watch } from "vue";

/**
 * Counts tile requests the provider REFUSED for this pane — 401 and 403 on a bad or unauthorised
 * key, 429 on a rate limit, 5xx from the service.
 *
 * That list is the whole scope, and it is narrower than it sounds. This deliberately does not
 * report missing coverage, because it cannot: MapLibre swallows 404 tile errors outright
 * (`SourceCache._loadTile` fires the error event only `if (err.status !== 404)`), so a pane past
 * its provider's coverage reports zero. Nor can it see the worst shape, a 200 carrying a picture
 * of nothing — EOX answers outside its coverage with a transparent PNG, Esri with a grey "Map data
 * not yet available" JPEG, and both are valid images. `pnpm run probe-tiles` is what catches those,
 * and the registry's measured `maxzoom` values are what keep users away from them.
 *
 * What is left is still worth having: a wrong key pasted into Settings is otherwise a black pane
 * with no explanation, since the missing-key overlay only covers a key that is absent. Verified
 * against a deliberately invalid Mapbox token: four 401s, four counted.
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
