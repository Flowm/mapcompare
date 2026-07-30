import { useEventListener } from "@vueuse/core";

import { useAppState } from "./useAppState";

/**
 * Three shortcuts, not a system.
 *
 * `1`-`4` set the pane count, `s` switches to swipe, and `b` is held to flip the blink layer —
 * hold rather than toggle, because A/B blinking is how you spot a subtle difference, and that
 * only works if returning to the reference layer takes no thought.
 */
export function useKeyboardShortcuts() {
  const { mode, setMode, setBlinkTopVisible } = useAppState();

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;

    switch (event.key) {
      case "1":
      case "2":
      case "3":
      case "4":
        setMode(`g${event.key}` as "g1" | "g2" | "g3" | "g4");
        break;
      case "s":
      case "S":
        setMode("sw");
        break;
      case "b":
      case "B":
        // First press enters blink mode; while in it, holding reveals the lower layer.
        if (mode.value !== "bl") setMode("bl");
        else if (!event.repeat) setBlinkTopVisible(false);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  useEventListener(window, "keyup", (event: KeyboardEvent) => {
    if ((event.key === "b" || event.key === "B") && mode.value === "bl") setBlinkTopVisible(true);
  });

  // A dropped keyup (tab-away mid-hold) would otherwise leave the lower layer stuck on.
  useEventListener(window, "blur", () => {
    if (mode.value === "bl") setBlinkTopVisible(true);
  });
}
