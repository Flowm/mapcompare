import { setWorkerUrl } from "maplibre-gl";
// `?worker&url` — not plain `?url`. The worker is not self-contained: it imports maplibre's
// ~470 kB shared chunk as a sibling module. `?url` copies the single file verbatim, so that
// import resolved to a path Vite never emitted, the dev server's SPA fallback answered it with
// index.html, and the worker died on being handed HTML instead of JavaScript. `?worker` makes
// Vite bundle the worker together with its dependency graph.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

/**
 * Points maplibre-gl at its web worker explicitly.
 *
 * maplibre-gl v6 resolves the worker itself with `new URL(\`./${name}\`, import.meta.url)`, where
 * `name` is chosen at runtime between the dev and production builds. Because the filename is
 * dynamic, no bundler can statically analyse it: Vite emits no worker asset into `dist`, and in
 * dev the dependency pre-bundler relocates the module to `/node_modules/.vite/deps/`, where the
 * sibling worker file does not exist either. Both paths 404.
 *
 * The failure is completely silent, which is what makes it worth this much explanation. MapLibre
 * decodes raster tiles on the main thread, so imagery keeps working perfectly, while vector tiles
 * — which are parsed in the worker — simply never appear: no console error, no `error` event, just
 * a map showing nothing but its background colour. It cost real debugging time here.
 *
 * Imported for its side effect from main.ts, before any Map is constructed.
 */
setWorkerUrl(workerUrl);
