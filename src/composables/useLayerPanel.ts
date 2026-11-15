import { useLocalStorage } from "@vueuse/core";
import { computed, ref } from "vue";

import type { GroupBy } from "@/lib/layers/availability";

import { useViewport } from "./useViewport";

/**
 * The layer manager's own state: whether it is showing, and which pane it acts on.
 *
 * Module-level singletons, because two surfaces have to agree about the same pane: each pane's
 * picker and the manager. A pane picked on the map is the pane the manager then targets, so
 * clicking a layer in the manager can never quietly change a different pane than the one you were
 * just working on.
 *
 * Deliberately NOT in the URL. `panelOpen` is a preference about this browser window, and
 * `activePane` is a transient focus — a shared link should describe the comparison, not which
 * sidebar the sender happened to have open.
 */

/** Persisted: closing the manager to reclaim the width should survive a reload. */
const panelOpen = useLocalStorage("mapcompare:layer-panel", true);

/** How the catalogue is grouped, in the manager and every picker alike. A viewing preference. */
const groupBy = useLocalStorage<GroupBy>("mapcompare:group-by", "provider");

/**
 * The phone's drawer, which is a different surface from the desktop column and so a different
 * state. Not persisted: `panelOpen` defaults to open, and a drawer restored open would cover the
 * map before anyone has seen it.
 */
const { isCompact } = useViewport();

const drawerOpen = ref(false);

/** Whichever surface this layout shows the manager in. */
const layersOpen = computed({
  get: () => (isCompact.value ? drawerOpen.value : panelOpen.value),
  set: (open: boolean) => {
    if (isCompact.value) drawerOpen.value = open;
    else panelOpen.value = open;
  },
});

const activePane = ref(0);

export function useLayerPanel() {
  return {
    panelOpen,
    drawerOpen,
    layersOpen,
    groupBy,
    activePane: computed(() => activePane.value),

    togglePanel() {
      layersOpen.value = !layersOpen.value;
    },

    openPanel() {
      layersOpen.value = true;
    },

    closePanel() {
      layersOpen.value = false;
    },

    focusPane(index: number) {
      activePane.value = index;
    },
  };
}
