import { useLocalStorage } from "@vueuse/core";

/**
 * Small display preferences, persisted per browser.
 *
 * Module-level singletons so every pane reads the same values without prop drilling.
 */
const resampling = useLocalStorage<"linear" | "nearest">("mapcompare:resampling", "linear");
const allowRotate = useLocalStorage("mapcompare:allow-rotate", false);
const showCrosshair = useLocalStorage("mapcompare:crosshair", true);

export function useDisplaySettings() {
  return { resampling, allowRotate, showCrosshair };
}
