import { useEventListener } from "@vueuse/core";

import { useAppState } from "./useAppState";

/**
 * A handful of shortcuts, not a system.
 *
 * `1`-`4` set the pane count, `s` switches to swipe, and blink has two: `b` held flips the layer
 * for as long as you hold it, `Space` latches the flip. Hold is how you spot a subtle difference,
 * because returning to the reference layer takes no thought; the latch is for when you want to
 * stay on the other layer and look properly. The on-screen control does the same as `Space`.
 */
export function useKeyboardShortcuts() {
  const { mode, setMode, setBlinkTopVisible, toggleBlink } = useAppState();

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }

  /** Space and Enter already activate these, so handling it here would fire the action twice. */
  function isActivatable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return ["BUTTON", "A", "SUMMARY"].includes(target.tagName);
  }

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;

    // Space is matched on the physical key as well as the character, because it is the one
    // shortcut here whose `key` is a space rather than a letter, and not every source of key
    // events fills that in.
    if (event.key === " " || event.code === "Space") {
      // The latch, and only meaningful in blink mode. Skipped when a focused control would
      // activate on Space anyway, which would otherwise flip twice.
      if (mode.value !== "bl" || isActivatable(event.target)) return;
      if (!event.repeat) toggleBlink();
      event.preventDefault();
      return;
    }

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
