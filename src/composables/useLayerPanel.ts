import { useLocalStorage } from "@vueuse/core";
import { computed, ref } from "vue";

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

const activePane = ref(0);

export function useLayerPanel() {
  return {
    panelOpen,
    activePane: computed(() => activePane.value),

    togglePanel() {
      panelOpen.value = !panelOpen.value;
    },

    openPanel() {
      panelOpen.value = true;
    },

    closePanel() {
      panelOpen.value = false;
    },

    focusPane(index: number) {
      activePane.value = index;
    },
  };
}
