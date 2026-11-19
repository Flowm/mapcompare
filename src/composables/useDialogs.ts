import { ref } from "vue";

import type { ApiKeyName } from "@/lib/layers/types";

/**
 * Which of the app's dialogs is open.
 *
 * Module-level, like the layer panel's state, because the ways in are spread across the app: the
 * header menu, the layer manager, a greyed row, a pane blocked on a missing key. Each opens the
 * dialog itself rather than passing an event up through every component between it and App.
 */

const keysOpen = ref(false);
/** The key field the API keys dialog lands on, when it was opened for one provider. */
const focusKey = ref<ApiKeyName>();
const sourcesOpen = ref(false);
const addLayerOpen = ref(false);

export function useDialogs() {
  return {
    keysOpen,
    focusKey,
    sourcesOpen,
    addLayerOpen,

    openKeys(key?: ApiKeyName) {
      focusKey.value = key;
      keysOpen.value = true;
    },

    openSources() {
      sourcesOpen.value = true;
    },

    openAddLayer() {
      addLayerOpen.value = true;
    },
  };
}
