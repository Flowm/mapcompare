import type { ApiKeyName } from "@/lib/providers/types";

/**
 * The only module in the repo that reads `import.meta.env`.
 *
 * Access is per-key and literal on purpose. Vite guarantees the define replacement for
 * `import.meta.env.VITE_X`, whereas dynamic `import.meta.env[name]` indexing depends on the
 * whole env object surviving the build. The `satisfies` clause makes it a compile error to
 * add an `ApiKeyName` without wiring it up here.
 *
 * These values are compiled into the public bundle. They are not secrets — see the README
 * on restricting keys by HTTP referrer.
 */
export const API_KEYS = {
  VITE_MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN,
  VITE_MAPTILER_KEY: import.meta.env.VITE_MAPTILER_KEY,
  VITE_STADIA_API_KEY: import.meta.env.VITE_STADIA_API_KEY,
  VITE_HERE_API_KEY: import.meta.env.VITE_HERE_API_KEY,
  VITE_ARCGIS_API_KEY: import.meta.env.VITE_ARCGIS_API_KEY,
} satisfies Record<ApiKeyName, string | undefined>;

export const BUILD_DATE = __BUILD_DATE__;
export const BUILD_SHA = __BUILD_SHA__;
