import { useLocalStorage } from "@vueuse/core";
import { computed, shallowRef } from "vue";

import type { AddedLayer } from "@/lib/layers/added";
import { normaliseAddedLayer, parseStoredLayers } from "@/lib/layers/addedCodec";
import { LAYERS } from "@/lib/layers/registry";
import type { Layer } from "@/lib/layers/types";

/**
 * The catalogue as the app sees it: the shipped registry plus the Added Layers.
 *
 * Every surface that lists or looks up Layers reads from here rather than from `LAYERS`, so an Added
 * Layer is as much a Layer as a shipped one: it can be picked, compared, timed and credited.
 *
 * An Added Layer is either **saved** — the user added it, or kept one a link brought — and lives in
 * this browser, or **from a link**: a link carried its definition (see `lib/urlState.ts`) and it lasts
 * for this session only. Opening a link never writes to what is saved. Otherwise every Back and
 * Forward through a link's history entry would re-save a Layer the user had removed, and opening a
 * link would overwrite the user's own copy of the same source.
 */

const stored = useLocalStorage<unknown>("mapcompare:added-layers", [], {
  // Read through `parseStoredLayers` below, so a malformed entry is dropped rather than trusted.
  serializer: { read: (raw) => JSON.parse(raw) as unknown, write: (value) => JSON.stringify(value) },
});

const saved = computed<AddedLayer[]>(() => parseStoredLayers(stored.value));
const savedIds = computed(() => new Set(saved.value.map((l) => l.id)));

/** Brought by links this session and not saved. */
const fromLinks = shallowRef<AddedLayer[]>([]);

/** Removed this session, so a link that brings one back can say so rather than seem to undo the removal. */
const removedIds = new Set<string>();

/** The Layers the latest link brought back after the user had removed them, for the app to point out. */
const restoredByLink = shallowRef<AddedLayer[]>([]);

/** Saved first; a saved copy of a source always wins over a link's. */
const addedLayers = computed<AddedLayer[]>(() => [...saved.value, ...fromLinks.value.filter((l) => !savedIds.value.has(l.id))]);

const catalogue = computed<readonly Layer[]>(() => [...LAYERS, ...addedLayers.value]);

const byId = computed(() => new Map(catalogue.value.map((l) => [l.id, l])));

/** Any Layer the app knows, shipped or added. Reactive: an Added Layer is found as soon as it is added. */
export function findLayer(id: string): Layer | undefined {
  return byId.value.get(id);
}

export function knownLayerIds(): ReadonlySet<string> {
  return new Set(byId.value.keys());
}

function without(layers: readonly AddedLayer[], ids: ReadonlySet<string>): AddedLayer[] {
  return layers.filter((l) => !ids.has(l.id));
}

export function useCatalogue() {
  return {
    catalogue,
    addedLayers,

    isSaved(id: string): boolean {
      return savedIds.value.has(id);
    },

    restoredByLink,

    /**
     * Saves a Layer, replacing a saved one from the same source. Checked by the same rules that read
     * it back, so what is saved always survives a reload and a link; false, and nothing saved, if not.
     */
    saveLayer(layer: AddedLayer): boolean {
      const valid = normaliseAddedLayer(layer);
      if (!valid) return false;
      const ids = new Set([valid.id]);
      stored.value = [...without(saved.value, ids), valid];
      fromLinks.value = without(fromLinks.value, ids);
      removedIds.delete(valid.id);
      return true;
    },

    /** Layers a link carried, for this session. A link's definition replaces an earlier link's, never a saved one. */
    showFromLink(layers: readonly AddedLayer[]) {
      const fresh = layers.filter((l) => !savedIds.value.has(l.id));
      const shown = new Set(fromLinks.value.map((l) => l.id));
      const restored = fresh.filter((l) => removedIds.has(l.id) && !shown.has(l.id));
      restored.forEach((l) => removedIds.delete(l.id));
      if (restored.length > 0) restoredByLink.value = restored;
      if (fresh.length === 0) return;
      fromLinks.value = [...without(fromLinks.value, new Set(fresh.map((l) => l.id))), ...fresh];
    },

    /** Forgets a Layer, saved or from a link. Panes showing it are app state: see `useAppState().removeAddedLayer`. */
    removeLayer(id: string) {
      const ids = new Set([id]);
      stored.value = without(saved.value, ids);
      fromLinks.value = without(fromLinks.value, ids);
      removedIds.add(id);
    },
  };
}
