import { useToast } from "@nuxt/ui/composables/useToast";

import { useAppState } from "./useAppState";

/**
 * Copies a link to the exact comparison on screen.
 *
 * A toast rather than a label that flips to "Copied": on a phone the action lives in a menu that
 * has closed by the time the copy lands, so the confirmation needs somewhere of its own to appear.
 */
export function useShare() {
  const { sharePermalink } = useAppState();
  const toast = useToast();

  return async function share() {
    const url = sharePermalink();
    try {
      await navigator.clipboard.writeText(url);
      toast.add({ title: "Link copied", description: "It opens this exact comparison.", icon: "i-lucide-check", color: "success", duration: 2000 });
    } catch {
      // Clipboard access can be denied or unavailable over plain http. The URL bar already shows
      // the permalink at this point, so say where to find it rather than failing silently.
      toast.add({ title: "Could not copy", description: "The address bar holds the link to this comparison.", color: "warning" });
    }
  };
}
