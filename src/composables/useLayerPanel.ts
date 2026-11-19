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
 * Deliberately NOT in the URL. `columnOpen` is a preference about this browser window, and
 * `activePane` is a transient focus — a shared link should describe the comparison, not which
 * sidebar the sender happened to have open.
 */

/** The desktop side column. Persisted: closing it to reclaim the width should survive a reload. */
const columnOpen = useLocalStorage("mapcompare:layer-panel", true);

/** How the catalogue is grouped, in the manager and every picker alike. A viewing preference. */
const groupBy = useLocalStorage<GroupBy>("mapcompare:group-by", "provider");

const { isCompact } = useViewport();

/**
 * The phone's drawer, which is a different surface from the desktop column and so a different
 * state. Not persisted: `columnOpen` defaults to open, and a drawer restored open would cover the
 * map before anyone has seen it.
 */
const drawerOpen = ref(false);

/** Whether the manager is showing, in whichever surface this layout uses for it. */
const managerOpen = computed({
  get: () => (isCompact.value ? drawerOpen.value : columnOpen.value),
  set: (open: boolean) => {
    if (isCompact.value) drawerOpen.value = open;
    else columnOpen.value = open;
  },
});

const activePane = ref(0);

/**
 * Set to ask the manager to focus its search. The pickers' "Layer manager" entry opens the
 * manager, which does nothing visible when it is already open beside the map; moving focus into
 * its search does, and is the next step anyway: the entry is how to look past the short list.
 *
 * A flag the manager clears, not an event: when the manager was closed, the request comes before
 * the manager is mounted to hear it.
 */
const searchPending = ref(false);

export function useLayerPanel() {
  return {
    managerOpen,
    groupBy,
    activePane: computed(() => activePane.value),
    searchPending: computed(() => searchPending.value),

    toggleManager() {
      managerOpen.value = !managerOpen.value;
    },

    /** Opens the manager and puts focus in its search. */
    searchManager() {
      managerOpen.value = true;
      searchPending.value = true;
    },

    /** The manager took the search request. */
    searchHandled() {
      searchPending.value = false;
    },

    closeManager() {
      managerOpen.value = false;
    },

    focusPane(index: number) {
      activePane.value = index;
    },
  };
}
