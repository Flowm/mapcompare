import type { StyleSpecification } from "maplibre-gl";

/**
 * Fetching and caching third-party style.json documents.
 *
 * Style-URL providers are fetched rather than handed straight to `map.setStyle(url)` so we
 * own the resulting object. That is what makes the label overlay possible: `glyphs` and
 * `sprite` are style-level properties and cannot be changed after a style has loaded, so the
 * overlay's font and sprite endpoints have to be merged in before the style is applied.
 *
 * The cache is keyed on the resolved URL, so panes showing the same provider share one
 * request, and the standalone OpenFreeMap Liberty basemap shares its fetch with the label
 * overlay that is extracted from the same document.
 */

const cache = new Map<string, Promise<StyleSpecification>>();

export function fetchStyle(url: string): Promise<StyleSpecification> {
  const cached = cache.get(url);
  if (cached) return cached;

  const pending = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Style fetch failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as StyleSpecification;
  })();

  // A rejected promise must not poison the cache, or one flaky request permanently breaks
  // the provider for the rest of the session.
  pending.catch(() => cache.delete(url));

  cache.set(url, pending);
  return pending;
}

/** Test seam and a way to force a refetch. */
export function clearStyleCache(): void {
  cache.clear();
}

/**
 * The style the label overlay is extracted from.
 *
 * This is the same URL as the standalone OpenFreeMap Liberty basemap entry, so both share one
 * cached fetch: turning labels on while a Liberty pane is open costs nothing extra.
 */
export const LABEL_OVERLAY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function fetchLabelOverlayStyle(): Promise<StyleSpecification> {
  return fetchStyle(LABEL_OVERLAY_STYLE_URL);
}
