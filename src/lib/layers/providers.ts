import type { Provider, ProviderId } from "./types";

/**
 * Every organisation the catalogue credits. A Layer names its Provider by key, so the group
 * headers and the Provider filter spell each one exactly one way.
 */
export const PROVIDERS: Readonly<Record<ProviderId, Provider>> = {
  versatiles: { label: "VersaTiles", url: "https://versatiles.org/" },
  esri: { label: "Esri", url: "https://www.esri.com/" },
  eox: { label: "EOX", url: "https://eox.at/" },
  "nasa-gibs": { label: "NASA GIBS", url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" },
  eumetsat: { label: "EUMETSAT", url: "https://view.eumetsat.int/" },
  satvis: { label: "satvis", url: "https://satvis.space/" },
  mapbox: { label: "Mapbox", url: "https://www.mapbox.com/" },
  maptiler: { label: "MapTiler", url: "https://www.maptiler.com/" },
  stadia: { label: "Stadia Maps", url: "https://stadiamaps.com/" },
  here: { label: "HERE", url: "https://www.here.com/" },
  openfreemap: { label: "OpenFreeMap", url: "https://openfreemap.org/" },
  // Not an organisation: the app cannot know who serves an Added Layer, so they share one header and
  // each credits whatever its own source states. See CONTEXT.md.
  added: { label: "Added by you" },
};
