import { useToast } from "@nuxt/ui/composables/useToast";
import { createSharedComposable, useClipboard } from "@vueuse/core";

import { useAppState } from "./useAppState";

/**
 * Copies a link to the exact comparison on screen.
 *
 * Two ways to confirm it. The header button flips its own label to "Copied", as it always did. The
 * phone's overflow menu has closed by the time the copy lands, so it asks for a toast instead.
 * A failed copy always says so: clipboard access can be denied, or missing over plain http.
 */
/** One clipboard for the whole app: each instance watches the clipboard permissions on its own. */
// `legacy` falls back to execCommand where the async clipboard is unavailable, such as plain http.
const useSharedClipboard = createSharedComposable(() => useClipboard({ copiedDuring: 1600, legacy: true }));

export function useShare() {
  const { sharePermalink } = useAppState();
  const toast = useToast();
  const { copy, copied } = useSharedClipboard();

  async function share(confirm: "label" | "toast" = "label") {
    try {
      await copy(sharePermalink());
    } catch {
      // Handled below: `copied` stays false.
    }
    if (!copied.value) {
      // The URL bar already shows the permalink at this point, so say where to find it.
      toast.add({ title: "Could not copy", description: "The address bar holds the link to this comparison.", color: "warning" });
      return;
    }
    if (confirm === "toast") toast.add({ title: "Link copied", description: "It opens this exact comparison.", icon: "i-lucide-check", color: "success", duration: 2000 });
  }

  return { share, copied };
}
