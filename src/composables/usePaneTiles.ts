import type { Map as MapLibreMap } from "maplibre-gl";
import { onScopeDispose, ref, type ShallowRef, watch } from "vue";

/**
 * Counts failed tile requests for one pane.
 *
 * This is not a nice-to-have. VersaTiles serves European orthophotos to z17 but falls back to a
 * ~10 m global layer that stops around z12, so zooming in over San Francisco produces a pane full
 * of 404s. Without a count, that reads as "the app is broken" rather than "there is no
 * high-resolution coverage here" — which is the genuine insight the tool exists to deliver.
 *
 * A caveat worth knowing: this can only see real failures. Some services answer a missing tile
 * with a 200 and a transparent placeholder image (EOX does exactly that outside its coverage), and
 * nothing here can distinguish that from open water. `pnpm run probe-tiles` is what catches those.
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
